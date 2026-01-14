// api/apptivo-lead.js
// Crea Lead en Apptivo y rellena CUSTOM FIELDS automáticamente usando getConfigData
// Requiere env vars en Vercel: APPTIVO_API_KEY, APPTIVO_ACCESS_KEY

const TARGET_FIELDS = [
  // Mapeo "Nombre visible en Apptivo" -> key en payload
  { labels: ["cliente", "nombre cliente", "empresa"], key: "companyName" },
  { labels: ["rut", "r.u.t", "rut empresa"], key: "companyRut" },

  { labels: ["altura requerida", "altura requerida m", "altura"], key: "heightM" },
  { labels: ["alcance requerido", "alcance"], key: "reachM" },
  { labels: ["inclinacion terreno", "inclinacion del terreno", "pendiente"], key: "slopeDeg" },

  { labels: ["tipo de acceso", "acceso"], key: "accessType" },
  { labels: ["ancho acceso", "ancho de acceso"], key: "accessWidthCm" },
  { labels: ["altura acceso", "alto acceso", "altura de acceso"], key: "accessHeightCm" },

  { labels: ["peso max ascensor", "peso maximo ascensor", "capacidad ascensor"], key: "elevatorMaxKg" },
  { labels: ["cabina ascensor ancho", "ancho cabina ascensor"], key: "elevatorCabinWidthCm" },
  { labels: ["cabina ascensor fondo", "fondo cabina ascensor", "profundidad cabina"], key: "elevatorCabinDepthCm" },];

// Cache simple en memoria (Vercel serverless puede reutilizarlo entre requests)
let cachedConfig = null;
let cachedAt = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos

function splitName(full) {
  const s = String(full || "").trim();
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: s, lastName: s };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
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

// Busca recursivamente un atributo por su “label” (Cliente, Rut, etc.)
function findAttributeByLabel(obj, wantedLabel) {
  const labelNorm = String(wantedLabel || "").trim().toLowerCase();

  const stack = [obj];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur) continue;

    if (Array.isArray(cur)) {
      for (const it of cur) stack.push(it);
      continue;
    }
    if (typeof cur !== "object") continue;

    // Heurística: detecta nodos con id + type + algún nombre/label
    const possibleId =
      cur.attributeId || cur.customAttributeId || cur.id || null;

    const possibleType =
      cur.attributeType || cur.customAttributeType || cur.type || null;

    const possibleLabel =
      cur.label ||
      cur.displayName ||
      cur.attributeNameMeaning ||
      cur.attributeName ||
      cur.customAttributeName ||
      cur.name ||
      null;

    if (possibleId && possibleType && possibleLabel) {
      const curLabelNorm = String(possibleLabel).trim().toLowerCase();
      if (curLabelNorm === labelNorm) {
        return { id: String(possibleId), type: String(possibleType) };
      }
    }

    // seguir recorriendo
    for (const k of Object.keys(cur)) stack.push(cur[k]);
  }

  return null;
}

function mkCustomAttr({ id, type }, value) {
  // Formato alineado al ejemplo de customAttributes en updateLead :contentReference[oaicite:1]{index=1}
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

async function getLeadsConfig({ apiKey, accessKey }) {
  const now = Date.now();
  if (cachedConfig && now - cachedAt < CACHE_TTL_MS) return cachedConfig;

  const url = new URL("https://api.apptivo.com/app/dao/v6/leads");
  url.searchParams.set("a", "getConfigData");
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("accessKey", accessKey);

  const resp = await fetch(url.toString(), { method: "GET" });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`getConfigData error (${resp.status}): ${text}`);
  }

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

export default async function handler(req, res) {
  // CORS básico (útil si está embebido en Wix)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const apiKey = process.env.APPTIVO_API_KEY;
    const accessKey = process.env.APPTIVO_ACCESS_KEY;
    if (!apiKey || !accessKey) {
      return res.status(500).json({ ok: false, error: "Missing APPTIVO_API_KEY or APPTIVO_ACCESS_KEY" });
    }

    const b = req.body || {};

    // Obligatorios
    const companyName = String(b.companyName || "").trim();
    const companyRut = String(b.companyRut || "").trim();
    const contactName = String(b.contactName || "").trim();
    const contactPhone = normalizePhone(b.contactPhone);
    const contactEmail = String(b.contactEmail || "").trim();

    if (!companyName || !companyRut || !contactName || !contactPhone || !contactEmail) {
      return res.status(400).json({
        ok: false,
        error: "Faltan campos obligatorios (empresa/contacto).",
      });
    }
    if (!isValidEmail(contactEmail)) {
      return res.status(400).json({ ok: false, error: "Correo inválido." });
    }

    // Traer config para mapear labels -> ids
    const cfg = await getLeadsConfig({ apiKey, accessKey });

    const missing = [];
    const customAttributes = [];

    for (const f of TARGET_FIELDS) {
      const meta = findAttributeByLabel(cfg, f.label);
      const val =
        f.key === "companyName" ? companyName :
        f.key === "companyRut" ? companyRut :
        b[f.key];

      if (meta) {
        const v = val == null ? "" : String(val);
        // Evitar mandar vacíos (opcional)
        if (v !== "") customAttributes.push(mkCustomAttr(meta, v));
      } else {
        missing.push(f.label);
      }
    }

    const { firstName, lastName } = splitName(contactName);

    // Igual dejamos description como respaldo (por si algún campo no existe / cambian labels)
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

    // createLead soporta customAttributes[] dentro de leadData :contentReference[oaicite:2]{index=2}
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
      missingCustomFieldLabels: missing, // si aparece algo aquí, es porque el label no coincide EXACTO
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "Unknown error" });
  }
}
