// api/apptivo-lead.js
// Recomendador VertiTek -> Apptivo Leads
// POST: crea lead y llena campos (standard + custom) usando IDs del webLayout
// GET ?debug=1: muestra campos detectados con label limpio (modifiedLabel)

// Env vars (Vercel):
// - APPTIVO_API_KEY
// - APPTIVO_ACCESS_KEY

const CACHE_TTL_MS = 10 * 60 * 1000;
let cachedConfig = null;
let cachedAt = 0;

// ✅ Queremos matchear contra los labels "modifiedLabel" que tu layout tiene
// (según tu debug real)
const TARGET_FIELDS = [
  // Empresa / Rut (en tu layout son Standard fields con modifiedLabel "Cliente" y "Rut")
  { wanted: ["cliente"], key: "companyName" },
  { wanted: ["rut"], key: "companyRut" },

  // Datos trabajo (Custom fields)
  { wanted: ["altura requerida", "altura requerida mts"], key: "heightM" }, // number_4_1
  { wanted: ["alcance requerido", "alcance requerido mts"], key: "reachM" }, // number_4_2
  { wanted: ["inclinacion del terreno", "inclinación del terreno", "inclinacion terreno"], key: "slopeDeg" }, // number_4_6
  { wanted: ["tipo de acceso"], key: "accessType" }, // select_4_9
  { wanted: ["ancho disponible en acceso", "ancho acceso"], key: "accessWidthCm" }, // number_4_10
  { wanted: ["altura disponible en acceso", "altura acceso"], key: "accessHeightCm" }, // number_4_11

  // Ascensor
  { wanted: ["capacidad maxima ascensor", "capacidad maxima ascensor kg", "peso max ascensor"], key: "elevatorMaxKg" }, // number_4_12
  { wanted: ["cabina ascensor ancho"], key: "elevatorCabinWidthCm" }, // number_4_13
  { wanted: ["cabina ascensor fondo"], key: "elevatorCabinDepthCm" }, // number_4_14

  // Recomendación (Custom fields en tu layout)
  { wanted: ["equipo recomendado"], key: "recommendedModel" }, // input_4_15
  { wanted: ["motivo recomendacion", "motivo recomendación"], key: "recommendationReason" }, // textarea_4_16
];

function normalizeLabel(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // tildes
    .replace(/\(.*?\)/g, " ") // (cm), (m), etc
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(m|cm|kg|mts|mt)\b/g, " ")
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

// ✅ CLAVE: el label viene como JSON string con modifiedLabel/originalLabel
function labelToText(rawLabel) {
  if (!rawLabel) return "";
  if (typeof rawLabel === "string") {
    const parsed = tryParseJsonString(rawLabel);
    if (parsed && typeof parsed === "object") {
      const m = String(parsed.modifiedLabel || "").trim();
      const o = String(parsed.originalLabel || "").trim();
      return m || o || "";
    }
    return rawLabel;
  }
  if (typeof rawLabel === "object") {
    // por si en algún caso ya viene como objeto
    const m = String(rawLabel.modifiedLabel || "").trim();
    const o = String(rawLabel.originalLabel || "").trim();
    const t = String(rawLabel.text || rawLabel.label || rawLabel.name || "").trim();
    return m || o || t || "";
  }
  return "";
}

function looksLikeFieldId(id) {
  const s = String(id || "");
  return (
    s.startsWith("input_") ||
    s.startsWith("number_") ||
    s.startsWith("select_") ||
    s.startsWith("textarea_") ||
    s.startsWith("check_") ||
    s.endsWith("_attr") // standard (email_attr, customer_attr, company_attr, etc.)
  );
}

function mkCustomAttr({ id, type }, value) {
  const v = value == null ? "" : String(value);
  return {
    customAttributeId: String(id),
    customAttributeType: String(type || "text"),
    customAttributeValue: v,
    customAttributeTagName: String(id),
    customAttributeName: String(id),
    [String(id)]: v,
  };
}

// Extrae campos desde webLayout
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
    const type = cur.attributeType || cur.customAttributeType || cur.type || cur.dataType || null;

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

    // Guardamos solo campos reales
    if (id && looksLikeFieldId(id) && label) {
      const norm = normalizeLabel(label);
      const key = `${id}::${norm}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ id: String(id), type: String(type || "text"), label, norm });
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

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  const apiKey = process.env.APPTIVO_API_KEY;
  const accessKey = process.env.APPTIVO_ACCESS_KEY;
  if (!apiKey || !accessKey) {
    return res.status(500).json({ ok: false, error: "Missing APPTIVO_API_KEY or APPTIVO_ACCESS_KEY" });
  }

  // ✅ DEBUG
  if (req.method === "GET" && String(req.query?.debug || "") === "1") {
    const cfg = await getLeadsConfig({ apiKey, accessKey });
    const fields = extractFieldsFromWebLayout(cfg);
    return res.status(200).json({
      ok: true,
      totalFieldsDetected: fields.length,
      sampleFields: fields
        .sort((a, b) => a.label.localeCompare(b.label))
        .slice(0, 200),
      tip: "Ahora label debe ser texto (modifiedLabel). Busca Cliente/Rut/Altura requerida/Ancho disponible en acceso/etc.",
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

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
    const fields = extractFieldsFromWebLayout(cfg);
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

    // (igual mantenemos description como respaldo)
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
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "Unknown error" });
  }
}
