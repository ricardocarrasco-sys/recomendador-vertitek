// api/apptivo-lead.js
// Recomendador VertiTek -> Apptivo Leads
// - POST: crea lead y rellena custom fields (customAttributes) automáticamente
// - GET ?debug=1: muestra campos detectados (labels + ids) para verificar mapeo
//
// Env vars (Vercel):
// - APPTIVO_API_KEY
// - APPTIVO_ACCESS_KEY

const CACHE_TTL_MS = 10 * 60 * 1000;
let cachedConfig = null;
let cachedAt = 0;

// Mapeo "lo que queremos llenar" -> cómo puede llamarse en Apptivo (variantes)
const TARGET_FIELDS = [
  { wanted: ["cliente", "nombre empresa", "empresa", "razon social"], key: "companyName" },
  { wanted: ["rut", "rut empresa", "r.u.t", "r u t"], key: "companyRut" },

  { wanted: ["altura requerida", "altura", "altura requerida m", "altura (m)", "altura requerida (m)"], key: "heightM" },
  { wanted: ["alcance requerido", "alcance", "alcance requerido m", "alcance (m)", "alcance requerido (m)"], key: "reachM" },
  { wanted: ["inclinacion terreno", "inclinacion", "pendiente", "pendiente terreno", "inclinacion del terreno"], key: "slopeDeg" },

  { wanted: ["tipo de acceso", "acceso", "tipo acceso"], key: "accessType" },
  { wanted: ["ancho acceso", "ancho de acceso", "ancho"], key: "accessWidthCm" },
  { wanted: ["altura acceso", "alto acceso", "altura de acceso", "alto de acceso"], key: "accessHeightCm" },

  { wanted: ["peso max ascensor", "peso maximo ascensor", "capacidad ascensor", "max kg ascensor", "peso máximo ascensor"], key: "elevatorMaxKg" },
  { wanted: ["cabina ascensor ancho", "ancho cabina ascensor", "ancho cabina"], key: "elevatorCabinWidthCm" },
  { wanted: ["cabina ascensor fondo", "fondo cabina ascensor", "profundidad cabina", "cabina profundidad"], key: "elevatorCabinDepthCm" },
];

function normalizeLabel(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")        // tildes fuera
    .replace(/\(.*?\)/g, " ")              // quita paréntesis (m), (cm), etc
    .replace(/[^a-z0-9]+/g, " ")           // deja letras/numeros
    .replace(/\b(m|cm|kg|mts|mt)\b/g, " ")  // quita unidades sueltas
    .replace(/\s+/g, " ")
    .trim();
}

function tryParseJsonString(s) {
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (!t) return null;
  if (!(t.startsWith("{") || t.startsWith("["))) return null;
  try { return JSON.parse(t); } catch { return null; }
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
    customAttributeType: type,
    customAttributeValue: v,
    customAttributeTagName: id,
    customAttributeName: id,
    [id]: v,
  };
}

// Extrae posibles atributos desde cfg/webLayout aunque venga como JSON string
function extractAttributes(cfg) {
  const out = [];
  const seen = new Set();
  const stack = [cfg];

  while (stack.length) {
    const cur = stack.pop();
    if (!cur) continue;

    // Si es string y parece JSON (ej: webLayout), lo parseamos y seguimos
    const parsed = tryParseJsonString(cur);
    if (parsed) {
      stack.push(parsed);
      continue;
    }

    if (Array.isArray(cur)) {
      for (const it of cur) stack.push(it);
      continue;
    }
    if (typeof cur !== "object") continue;

    const id = cur.attributeId || cur.customAttributeId || cur.id || null;
    const type = cur.attributeType || cur.customAttributeType || cur.type || cur.dataType || null;

    const label =
      cur.label ||
      cur.displayName ||
      cur.attributeNameMeaning ||
      cur.attributeName ||
      cur.customAttributeName ||
      cur.name ||
      cur.title ||
      null;

    if (id && type && label) {
      const key = `${id}::${label}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({
          id: String(id),
          type: String(type),
          label: String(label),
          norm: normalizeLabel(label),
        });
      }
    }

    for (const k of Object.keys(cur)) stack.push(cur[k]);
  }

  return out;
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

  // ✅ DEBUG: muestra campos detectados, incluyendo los que estén en webLayout (string JSON)
  if (req.method === "GET" && String(req.query?.debug || "") === "1") {
    const cfg = await getLeadsConfig({ apiKey, accessKey });
    const webLayoutParsed = tryParseJsonString(cfg.webLayout);
    const attrs = extractAttributes(webLayoutParsed || cfg);

    return res.status(200).json({
      ok: true,
      webLayoutType: typeof cfg.webLayout,
      webLayoutParsed: Boolean(webLayoutParsed),
      totalExtracted: attrs.length,
      // mostramos muestra ordenada para que puedas buscar "Cliente", "Rut", etc.
      sample: attrs
        .sort((a, b) => a.label.localeCompare(b.label))
        .slice(0, 120)
        .map(a => ({ label: a.label, norm: a.norm, id: a.id, type: a.type })),
      note: "Usa Ctrl+F en el JSON del navegador para buscar Cliente/Rut/Altura. Si totalExtracted=0, avísame.",
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
    const webLayoutParsed = tryParseJsonString(cfg.webLayout);
    const attrs = extractAttributes(webLayoutParsed || cfg);

    // índice por label normalizado
    const byNorm = new Map();
    for (const a of attrs) {
      if (!byNorm.has(a.norm)) byNorm.set(a.norm, a);
    }

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
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "Unknown error" });
  }
}
