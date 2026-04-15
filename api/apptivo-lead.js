// api/apptivo-lead.js
// VertiTek Recomendador -> Apptivo Opportunities
// - Uses Apptivo getConfigData.webLayout to discover field IDs by their (modified) labels
// - Maps payload fields into Apptivo customAttributes and standard contact fields
// Debug: GET /api/apptivo-lead?debug=1

const CACHE_TTL_MS = 10 * 60 * 1000;
let cachedConfig = null;
let cachedAt = 0;

function normalizeLabel(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(m|cm|kg|mts|mt|deg)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tryParseJsonString(s) {
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (!t) return null;
  if (!(t.startsWith("{") || t.startsWith("["))) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

function labelToText(rawLabel) {
  if (!rawLabel) return "";

  if (typeof rawLabel === "string") {
    const parsed = tryParseJsonString(rawLabel);
    if (parsed && typeof parsed === "object") {
      const m = String(parsed.modifiedLabel || "").trim();
      const o = String(parsed.originalLabel || "").trim();
      return m || o || "";
    }
    return rawLabel.trim();
  }

  if (typeof rawLabel === "object") {
    const m = String(rawLabel.modifiedLabel || "").trim();
    const o = String(rawLabel.originalLabel || "").trim();
    const t = String(rawLabel.text || rawLabel.label || rawLabel.name || "").trim();
    return m || o || t || "";
  }

  return "";
}

function cleanString(value) {
  if (value == null) return "";
  return String(value).trim().replace(/\s+/g, " ");
}

function firstNonEmpty(...values) {
  for (const v of values) {
    const s = cleanString(v);
    if (s) return s;
  }
  return "";
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function normalizePhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("56")) return `+${digits}`;
  if (digits.length >= 8) return `+56${digits}`;
  return `+${digits}`;
}

function normalizeCompanyName(value) {
  return cleanString(value);
}

function normalizeRut(raw) {
  const s = cleanString(raw)
    .replace(/\./g, "")
    .replace(/\s+/g, "")
    .replace(/_/g, "")
    .toUpperCase();

  if (!s) return "";

  const compact = s.replace(/[^0-9K]/g, "");
  if (compact.length < 2) return "";

  const body = compact.slice(0, -1).replace(/\D/g, "");
  const dv = compact.slice(-1);

  if (!body || !dv) return "";
  return `${body}-${dv}`;
}

function isValidRut(rut) {
  const normalized = normalizeRut(rut);
  if (!normalized) return false;

  const [bodyStr, dv] = normalized.split("-");
  if (!bodyStr || !dv) return false;

  let sum = 0;
  let multiplier = 2;

  for (let i = bodyStr.length - 1; i >= 0; i--) {
    sum += Number(bodyStr[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const remainder = 11 - (sum % 11);
  let expected = "";
  if (remainder === 11) expected = "0";
  else if (remainder === 10) expected = "K";
  else expected = String(remainder);

  return expected === dv.toUpperCase();
}

function normalizeNumeric(value) {
  const s = String(value ?? "").trim().replace(",", ".");
  if (!s) return "";
  const n = Number(s);
  return Number.isFinite(n) ? n : "";
}

function splitName(full) {
  const s = String(full || "").trim();
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: s, lastName: s };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function looksLikeFieldId(id) {
  const s = String(id || "");
  return (
    s.startsWith("input_") ||
    s.startsWith("number_") ||
    s.startsWith("select_") ||
    s.startsWith("textarea_") ||
    s.startsWith("check_") ||
    s.endsWith("_attr")
  );
}

function inferAttrTypeFromId(id, fallback) {
  const s = String(id || "");
  if (s.startsWith("select_")) return "select";
  if (s.startsWith("number_")) return "number";
  if (s.startsWith("check_")) return "check";
  if (s.startsWith("textarea_")) return "textarea";
  if (s.startsWith("input_")) return "text";
  return fallback || "text";
}

function normalizeYesNo(v) {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return "";
  if (["si", "sí", "yes", "y", "true", "1", "on"].includes(s)) return "Y";
  if (["no", "n", "false", "0", "off"].includes(s)) return "N";
  return String(v);
}

function normalizeSelectValue(v) {
  return String(v ?? "").trim();
}

function mkCustomAttr(meta, value) {
  const id = String(meta.id);
  const rawType = String(meta.type || "");
  const t = inferAttrTypeFromId(id, meta.type);

  let v = value;
  if (v == null) v = "";
  if (typeof v === "number") v = String(v);
  else v = String(v);

  if (t === "check") v = normalizeYesNo(v);
  if (t === "select") v = normalizeSelectValue(v);

  if (String(v).trim() === "") return null;

  // Para campos Standard de Apptivo, mandar estructura simple
  if (rawType.toLowerCase() === "standard" || id === "customer_attr" || id === "company_attr") {
    return {
      customAttributeId: id,
      customAttributeType: "Standard",
      customAttributeValue: v,
      attributeValues: [],
    };
  }

  return {
    customAttributeId: id,
    customAttributeType: t,
    customAttributeValue: v,
    customAttributeTagName: id,
    customAttributeName: id,
    [id]: v,
  };
}
function extractFieldsFromWebLayout(cfg) {
  const parsed = tryParseJsonString(cfg?.webLayout);
  if (!parsed) return [];

  const out = [];
  const seen = new Set();
  const stack = [parsed];

  while (stack.length) {
    const cur = stack.pop();
    if (!cur) continue;

    if (Array.isArray(cur)) {
      for (const it of cur) stack.push(it);
      continue;
    }
    if (typeof cur !== "object") continue;

    const id = cur.attributeId || cur.customAttributeId || cur.id || null;
    const rawType = cur.attributeType || cur.customAttributeType || cur.type || cur.dataType || null;

    const rawLabel =
      cur.label ||
      cur.displayName ||
      cur.attributeNameMeaning ||
      cur.attributeName ||
      cur.customAttributeName ||
      cur.name ||
      cur.title ||
      null;

    const label = labelToText(rawLabel);

    if (id && looksLikeFieldId(id) && label) {
      const norm = normalizeLabel(label);
      const key = `${id}::${norm}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ id: String(id), type: String(rawType || "text"), label, norm });
      }
    }

    for (const k of Object.keys(cur)) {
      const v = cur[k];
      const p = tryParseJsonString(v);
      if (p) stack.push(p);
      else stack.push(v);
    }
  }

  return out;
}

function buildIndex(fields) {
  const byNorm = new Map();
  for (const f of fields) {
    if (!byNorm.has(f.norm)) byNorm.set(f.norm, f);
  }
  return byNorm;
}

async function getOpportunitiesConfig({ apiKey, accessKey }) {
  const now = Date.now();
  if (cachedConfig && now - cachedAt < CACHE_TTL_MS) return cachedConfig;

  const url = new URL("https://api.apptivo.com/app/dao/v6/opportunities");
  url.searchParams.set("a", "getConfigData");
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("accessKey", accessKey);

  const resp = await fetch(url.toString(), { method: "GET" });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`getConfigData error (${resp.status}): ${text}`);

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("getConfigData did not return JSON");
  }

  cachedConfig = data;
  cachedAt = now;
  return data;
}

const TARGET_FIELDS = [
  { wanted: ["cliente", "nombre empresa", "empresa", "razon social", "razón social"], key: "companyName" },
  { wanted: ["rut", "rut empresa", "rut cliente", "rol unico tributario", "rol único tributario"], key: "companyRut" },
  { wanted: ["dias de arriendo", "días de arriendo", "dias arriendo", "duracion arriendo", "duración arriendo"], key: "rentalDays" },
  { wanted: ["lugar de trabajo", "lugar del trabajo", "lugar de entrega", "ubicacion", "ubicación", "direccion de trabajo", "dirección de trabajo", "direccion obra", "dirección obra"], key: "jobLocation" },
  { wanted: ["horario de entrega", "horario entrega", "turno de entrega", "turno entrega", "diurno o nocturno"], key: "deliveryShift" },
  { wanted: ["altura requerida", "altura requerida mts"], key: "heightM" },
  { wanted: ["alcance requerido", "alcance requerido mts"], key: "reachM" },
  { wanted: ["inclinacion del terreno", "inclinación del terreno"], key: "slopeDeg" },
  { wanted: ["tipo de acceso"], key: "accessType" },
  { wanted: ["ancho disponible en acceso", "ancho acceso"], key: "accessWidthCm" },
  { wanted: ["altura disponible en acceso", "altura acceso"], key: "accessHeightCm" },
  { wanted: ["capacidad maxima ascensor", "capacidad maxima ascensor kg", "capacidad maxima ascensor (kg)", "peso max ascensor"], key: "elevatorMaxKg" },
  { wanted: ["cabina ascensor ancho"], key: "elevatorCabinWidthCm" },
  { wanted: ["cabina ascensor fondo"], key: "elevatorCabinDepthCm" },
  { wanted: ["tipo de trabajo"], key: "jobType" },
  { wanted: ["tipo de terreno"], key: "terrain" },
  { wanted: ["interior exterior", "interior / exterior"], key: "interiorExterior" },
  { wanted: ["restriccion de emisiones", "restricción de emisiones"], key: "emissionsRestriction" },
  { wanted: ["requiere acceso negativo"], key: "needsNegativeAccess" },
  { wanted: ["equipo recomendado"], key: "recommendedModel" },
  { wanted: ["motivo recomendacion", "motivo recomendación"], key: "recommendationReason" },
];

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  const apiKey = process.env.APPTIVO_API_KEY;
  const accessKey = process.env.APPTIVO_ACCESS_KEY;

  if (!apiKey || !accessKey) {
    return res.status(500).json({
      ok: false,
      error: "Faltan env vars APPTIVO_API_KEY o APPTIVO_ACCESS_KEY",
    });
  }

  if (req.method === "GET" && String(req.query?.debug || "") === "1") {
    try {
      const cfg = await getOpportunitiesConfig({ apiKey, accessKey });
      const fields = extractFieldsFromWebLayout(cfg);
      return res.status(200).json({
        ok: true,
        totalFieldsDetected: fields.length,
        sampleFields: fields.sort((a, b) => a.label.localeCompare(b.label)).slice(0, 250),
        tip: "Busca labels como Cliente, Rut, Altura requerida, Tipo de Acceso, Interior / Exterior, etc.",
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || "debug error" });
    }
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const b = req.body || {};

    const companyName = normalizeCompanyName(
      firstNonEmpty(
        b.companyName,
        b.company,
        b.empresa,
        b.nombreEmpresa,
        b.razonSocial,
        b.razon_social,
        b.cliente
      )
    );

    const companyRut = normalizeRut(
      firstNonEmpty(
        b.companyRut,
        b.rut,
        b.taxId,
        b.tax_id,
        b.rutEmpresa,
        b.rut_empresa
      )
    );

    const contactName = firstNonEmpty(
      b.contactName,
      b.nombreContacto,
      b.contacto,
      b.name,
      b.fullName,
      b.nombre
    );

    const contactPhone = normalizePhone(
      firstNonEmpty(
        b.contactPhone,
        b.phone,
        b.telefono,
        b.celular,
        b.mobile
      )
    );

    const contactEmail = firstNonEmpty(
      b.contactEmail,
      b.email,
      b.correo,
      b.mail
    ).toLowerCase();

    const rentalDays = normalizeNumeric(
      firstNonEmpty(b.rentalDays, b.diasArriendo, b.dias_arriendo)
    );

    const jobLocation = firstNonEmpty(
      b.jobLocation,
      b.lugarTrabajo,
      b.lugarDeTrabajo,
      b.lugarEntrega,
      b.ubicacion,
      b.ubicación,
      b.direccion,
      b.dirección
    );

    const deliveryShift = firstNonEmpty(
      b.deliveryShift,
      b.horarioEntrega,
      b.turnoEntrega,
      b.shift
    );

    if (!companyName || !companyRut || !contactName || !contactPhone || !contactEmail) {
      return res.status(400).json({
        ok: false,
        error: "Faltan campos obligatorios (empresa/contacto).",
      });
    }

    if (!rentalDays || rentalDays <= 0 || !jobLocation || !deliveryShift) {
      return res.status(400).json({
        ok: false,
        error: "Faltan campos obligatorios del arriendo (días/lugar/horario).",
      });
    }

    if (!isValidEmail(contactEmail)) {
      return res.status(400).json({ ok: false, error: "Correo inválido." });
    }

    if (!isValidRut(companyRut)) {
      return res.status(400).json({
        ok: false,
        error: "RUT inválido.",
        companyRut,
      });
    }

    const cfg = await getOpportunitiesConfig({ apiKey, accessKey });
    const fields = extractFieldsFromWebLayout(cfg);
    const byNorm = buildIndex(fields);

    const interiorExterior = firstNonEmpty(
      b.interiorExterior,
      b.indoor,
      b.exteriorInterior
    );

    const needsNegativeAccess = firstNonEmpty(
      b.needsNegativeAccess,
      b.requiresNegativeAccess,
      b.accesoNegativo
    );

    const accessType = firstNonEmpty(
      b.accessType,
      b.tipoAcceso
    );

    const payloadNormalized = {
      ...b,
      companyName,
      companyRut,
      contactName,
      contactPhone,
      contactEmail,
      rentalDays,
      jobLocation,
      deliveryShift,
      interiorExterior,
      needsNegativeAccess,
      accessType,
      heightM: normalizeNumeric(b.heightM),
      reachM: normalizeNumeric(b.reachM),
      slopeDeg: normalizeNumeric(b.slopeDeg),
      accessWidthCm: normalizeNumeric(b.accessWidthCm),
      accessHeightCm: normalizeNumeric(b.accessHeightCm),
      elevatorMaxKg: normalizeNumeric(b.elevatorMaxKg),
      elevatorCabinWidthCm: normalizeNumeric(b.elevatorCabinWidthCm),
      elevatorCabinDepthCm: normalizeNumeric(b.elevatorCabinDepthCm),
      terrain: firstNonEmpty(b.terrain, b.tipoTerreno),
      jobType: firstNonEmpty(b.jobType, b.tipoTrabajo),
      emissionsRestriction: firstNonEmpty(b.emissionsRestriction, b.restriccionEmisiones),
      recommendedModel: firstNonEmpty(b.recommendedModel, b.equipoRecomendado),
      recommendationReason: firstNonEmpty(b.recommendationReason, b.motivoRecomendacion),
    };

    const customAttributes = [];
    const matched = [];
    const missing = [];

    for (const f of TARGET_FIELDS) {
      const wantedNorms = f.wanted.map(normalizeLabel);

      let meta = null;
      let usedWanted = f.wanted[0];

      for (let i = 0; i < wantedNorms.length; i++) {
        const w = wantedNorms[i];
        if (byNorm.has(w)) {
          meta = byNorm.get(w);
          usedWanted = f.wanted[i];
          break;
        }
      }

      const val = payloadNormalized[f.key];

      if (meta) {
        const attr = mkCustomAttr(meta, val);
        if (attr) {
          customAttributes.push(attr);
          matched.push({
            wanted: usedWanted,
            matchedLabel: meta.label,
            id: meta.id,
            type: meta.type,
          });
        }
      } else {
        missing.push(f.wanted[0]);
      }
    }

    const { firstName, lastName } = splitName(contactName);

    const desc = [
      "Solicitud de cotización desde Recomendador Spider (VertiTek) - Opportunity",
      "",
      `EMPRESA: ${companyName}`,
      `RUT: ${companyRut}`,
      `CONTACTO: ${contactName}`,
      `TEL: ${contactPhone}`,
      `EMAIL: ${contactEmail}`,
      "",
      "DATOS DE ARRIENDO",
      `- Días de arriendo: ${rentalDays}`,
      `- Lugar del trabajo/entrega: ${jobLocation}`,
      `- Horario de entrega: ${deliveryShift}`,
      "",
      "DATOS TÉCNICOS",
      `- Altura requerida (m): ${payloadNormalized.heightM ?? ""}`,
      `- Alcance requerido (m): ${payloadNormalized.reachM ?? ""}`,
      `- Inclinación terreno (°): ${payloadNormalized.slopeDeg ?? ""}`,
      `- Tipo de acceso: ${payloadNormalized.accessType ?? ""}`,
      `- Interior / Exterior: ${payloadNormalized.interiorExterior ?? ""}`,
      `- Tipo de terreno: ${payloadNormalized.terrain ?? ""}`,
      `- Tipo de trabajo: ${payloadNormalized.jobType ?? ""}`,
      `- Restricción de emisiones: ${payloadNormalized.emissionsRestriction ?? ""}`,
      `- Requiere acceso negativo: ${payloadNormalized.needsNegativeAccess ?? ""}`,
      `- Ancho acceso (cm): ${payloadNormalized.accessWidthCm ?? ""}`,
      `- Altura acceso (cm): ${payloadNormalized.accessHeightCm ?? ""}`,
      `- Peso max ascensor (kg): ${payloadNormalized.elevatorMaxKg ?? ""}`,
      `- Cabina ascensor ancho (cm): ${payloadNormalized.elevatorCabinWidthCm ?? ""}`,
      `- Cabina ascensor fondo (cm): ${payloadNormalized.elevatorCabinDepthCm ?? ""}`,
      "",
      "RECOMENDACIÓN",
      `- Equipo recomendado: ${payloadNormalized.recommendedModel ?? ""}`,
      `- Motivo: ${payloadNormalized.recommendationReason ?? ""}`,
      "",
      "LEGAL",
      String(b.legalText || ""),
    ].filter(Boolean).join("\n");

    const opportunityData = {
      firstName,
      lastName: lastName || firstName || companyName,
      description: desc,
      emailAddresses: [
        {
          emailAddress: contactEmail,
          emailTypeCode: "BUSINESS",
          emailType: "Business",
          id: "cont_email_input",
        },
      ],
      phoneNumbers: [
        {
          phoneNumber: contactPhone,
          phoneTypeCode: "PHONE_MOBILE",
          phoneType: "Mobile",
          id: "lead_phone_input",
        },
      ],
      customAttributes,
    };

    const url = new URL("https://api.apptivo.com/app/dao/v6/opportunities");
    url.searchParams.set("a", "save");
    url.searchParams.set("apiKey", apiKey);
    url.searchParams.set("accessKey", accessKey);
    url.searchParams.set("opportunityData", JSON.stringify(opportunityData));

    const resp = await fetch(url.toString(), { method: "GET" });
    const text = await resp.text();

    if (!resp.ok) {
      return res.status(502).json({
        ok: false,
        error: "Apptivo API error",
        status: resp.status,
        body: text,
        matched,
        missingCustomFieldLabels: missing,
      });
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    return res.status(200).json({
      ok: true,
      apptivo: data,
      mappedCustomFields: customAttributes.length,
      missingCustomFieldLabels: missing,
      matched,
      customAttributesSent: customAttributes,
      normalizedInput: {
        companyName,
        companyRut,
        contactName,
        contactPhone,
        contactEmail,
        rentalDays,
        jobLocation,
        deliveryShift,
      },
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: e?.message || "Unknown error",
    });
  }
}
