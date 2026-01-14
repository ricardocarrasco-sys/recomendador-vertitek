// api/apptivo-lead.js
// Apptivo Leads: mapeo real de campos usando referenceFields (más confiable que webLayout)
// Debug: GET /api/apptivo-lead?debug=1

const CACHE_TTL_MS = 10 * 60 * 1000;
let cachedConfig = null;
let cachedAt = 0;

const TARGET_FIELDS = [
  { wanted: ["cliente"], key: "companyName" },
  { wanted: ["rut"], key: "companyRut" },

  { wanted: ["altura requerida"], key: "heightM" },
  { wanted: ["alcance requerido"], key: "reachM" },
  { wanted: ["inclinacion terreno", "inclinación terreno", "pendiente"], key: "slopeDeg" },

  { wanted: ["tipo de acceso"], key: "accessType" },
  { wanted: ["ancho acceso"], key: "accessWidthCm" },
  { wanted: ["altura acceso"], key: "accessHeightCm" },

  { wanted: ["peso max ascensor", "peso máximo ascensor"], key: "elevatorMaxKg" },
  { wanted: ["cabina ascensor ancho"], key: "elevatorCabinWidthCm" },
  { wanted: ["cabina ascensor fondo"], key: "elevatorCabinDepthCm" },
];

function normalizeLabel(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(m|cm|kg|mts|mt)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function splitName(full) {
  const s = String(full || "").trim();
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: s, lastName: s };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function mkCustomAttr({ id, type }, value) {
  const v = value == null ? "" : String(value);
  return {
    customAttributeId: id,
    customAttributeType: type || "text",
    customAttributeValue: v,
    customAttributeTagName: id,
    customAttributeName: id,
    [id]: v,
  };
}

async function getLeadsConfig({ apiKey, accessKey }) {
  const now = Date.now();
  if (cachedConfig && now - cachedAt < CACHE_TTL_MS) return cachedConfig;

  const url = new URL("https://api.apptivo.com/app/dao/v6/leads");
  url.searchParams.set("a", "getConfigData");
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("accessKey", accessKey);

  const resp = await fetch(url.toString(), { method: "GET" });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`getConfigData error (${resp.status}): ${text}`);

  let data;
  try { data = JSON.parse(text); } catch { throw new Error("getConfigData did not return JSON"); }

  cachedConfig = data;
  cachedAt = now;
  return data;
}

// ✅ Extrae campos reales desde referenceFields
function extractFromReferenceFields(cfg) {
  const rf = cfg?.referenceFields;
  const found = [];

  // referenceFields puede venir como array, objeto, o incluir "fields"
  const stack = [rf];
  const seen = new Set();

  while (stack.length) {
    const cur = stack.pop();
    if (!cur) continue;

    if (Array.isArray(cur)) {
      for (const it of cur) stack.push(it);
      continue;
    }
    if (typeof cur !== "object") continue;

    // Heurísticas: muchos configs usan fieldId/attributeId + displayName/label/name + fieldType/dataType
    const id =
      cur.fieldId ||
      cur.attributeId ||
      cur.customAttributeId ||
      cur.id ||
      null;

    const label =
      cur.displayName ||
      cur.label ||
      cur.name ||
      cur.attributeNameMeaning ||
      cur.attributeName ||
      cur.customAttributeName ||
      null;

    const type =
      cur.fieldType ||
      cur.dataType ||
      cur.attributeType ||
      cur.customAttributeType ||
      cur.type ||
      null;

    if (id && label) {
      const key = `${id}::${label}`;
      if (!seen.has(key)) {
        seen.add(key);
        found.push({
          id: String(id),
          label: String(label),
          norm: normalizeLabel(label),
          type: String(type || "text"),
          rawType: type,
        });
      }
    }

    for (const k of Object.keys(cur)) stack.push(cur[k]);
  }

  return found;
}

function buildIndex(fields) {
  const byNorm = new Map();
  for (const f of fields) {
    if (!byNorm.has(f.norm)) byNorm.set(f.norm, f);
  }
  return byNorm;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  const apiKey = process.env.APPTIVO_API_KEY;
  const accessKey = process.env.APPTIVO_ACCESS_KEY;
  if (!apiKey || !accessKey) {
    return res.status(500).json({ ok: false, error: "Missing APPTIVO_API_KEY or APPTIVO_ACCESS_KEY" });
  }

  // DEBUG: muestra lo que referenceFields realmente contiene
  if (req.method === "GET" && String(req.query?.debug || "") === "1") {
    const cfg = await getLeadsConfig({ apiKey, accessKey });
    const extracted = extractFromReferenceFields(cfg);

    return res.status(200).json({
      ok: true,
      hasReferenceFields: cfg.referenceFields != null,
      referenceFieldsType: typeof cfg.referenceFields,
      extractedCount: extracted.length,
      sample: extracted
        .sort((a, b) => a.label.localeCompare(b.label))
        .slice(0, 200)
        .map(x => ({ label: x.label, norm: x.norm, id: x.id, type: x.type })),
      note: "Busca aquí Cliente/Rut/Altura/etc. Este sample SÍ debería mostrar nombres reales.",
    });
  }

  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const b = req.body || {};

    const companyName = String(b.companyName || "").trim();
    const companyRut = String(b.companyRut || "").trim();
    const contactName = String(b.contactName || "").trim();
    const contactPhone = normalizePhone(b.contactPhone);
    const contactEmail = String(b.contactEmail || "").trim();

    if (!companyName || !companyRut || !contactName || !contactPhone || !contactEmail) {
      return res.status(400).json({ ok: false, error: "Faltan campos obligatorios (empresa/contacto)." });
    }
    if (!isValidEmail(contactEmail)) {
      return res.status(400).json({ ok: false, error: "Correo inválido." });
    }

    const cfg = await getLeadsConfig({ apiKey, accessKey });
    const fields = extractFromReferenceFields(cfg);
    const byNorm = buildIndex(fields);

    const missing = [];
    const matched = [];
    const customAttributes = [];

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

      const val =
        f.key === "companyName" ? companyName :
        f.key === "companyRut" ? companyRut :
        b[f.key];

      if (meta) {
        const v = val == null ? "" : String(val);
        if (v !== "") {
          customAttributes.push(mkCustomAttr(meta, v));
          matched.push({ wanted: usedWanted, matchedLabel: meta.label, id: meta.id, type: meta.type });
        }
      } else {
        missing.push(f.wanted[0]);
      }
    }

    const { firstName, lastName } = splitName(contactName);

    const desc = [
      "Solicitud de cotización desde Recomendador Spider (VertiTek)",
      "",
      `EMPRESA: ${companyName}`,
      `RUT: ${companyRut}`,
      `CONTACTO: ${contactName}`,
      `TEL: ${contactPhone}`,
      `EMAIL: ${contactEmail}`,
      "",
      "DATOS TÉCNICOS",
      `- Altura requerida (m): ${b.heightM ?? ""}`,
      `- Alcance requerido (m): ${b.reachM ?? ""}`,
      `- Inclinación terreno (°): ${b.slopeDeg ?? ""}`,
      `- Tipo de acceso: ${b.accessType ?? ""}`,
      `- Ancho acceso (cm): ${b.accessWidthCm ?? ""}`,
      `- Altura acceso (cm): ${b.accessHeightCm ?? ""}`,
      `- Peso max ascensor (kg): ${b.elevatorMaxKg ?? ""}`,
      `- Cabina ascensor ancho (cm): ${b.elevatorCabinWidthCm ?? ""}`,
      `- Cabina ascensor fondo (cm): ${b.elevatorCabinDepthCm ?? ""}`,
      "",
      "RECOMENDACIÓN",
      `- Equipo recomendado: ${b.recommendedModel ?? ""}`,
      `- Motivo: ${b.recommendationReason ?? ""}`,
      "",
      "LEGAL",
      String(b.legalText || ""),
    ].filter(Boolean).join("\n");

    const leadData = {
      firstName,
      lastName: lastName || firstName || companyName,
      description: desc,
      emailAddresses: [
        { emailAddress: contactEmail, emailTypeCode: "BUSINESS", emailType: "Business", id: "cont_email_input" },
      ],
      phoneNumbers: [
        { phoneNumber: contactPhone, phoneTypeCode: "MOBILE", phoneType: "Mobile", id: "lead_phone_input" },
      ],
      customAttributes,
    };

    const url = new URL("https://api.apptivo.com/app/dao/v6/leads");
    url.searchParams.set("a", "save");
    url.searchParams.set("apiKey", apiKey);
    url.searchParams.set("accessKey", accessKey);
    url.searchParams.set("leadData", JSON.stringify(leadData));

    const resp = await fetch(url.toString(), { method: "GET" });
    const text = await resp.text();
    if (!resp.ok) {
      return res.status(502).json({ ok: false, error: "Apptivo API error", status: resp.status, body: text });
    }

    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    return res.status(200).json({
      ok: true,
      apptivo: data,
      mappedCustomFields: customAttributes.length,
      missingCustomFieldLabels: missing,
      matched,
      referenceFieldsExtracted: fields.length,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "Unknown error" });
  }
}
