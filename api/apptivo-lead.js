export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok:false, error:"Method not allowed" });

  try {
    const apiKey = process.env.APPTIVO_API_KEY;
    const accessKey = process.env.APPTIVO_ACCESS_KEY;
    if (!apiKey || !accessKey) {
      return res.status(500).json({ ok:false, error:"Faltan env vars APPTIVO_API_KEY o APPTIVO_ACCESS_KEY" });
    }

    const b = req.body || {};
    const companyName = String(b.companyName||"").trim();
    const companyRut = String(b.companyRut||"").trim();
    const contactName = String(b.contactName||"").trim();
    const contactPhone = String(b.contactPhone||"").trim();
    const contactEmail = String(b.contactEmail||"").trim();
    if (!companyName || !companyRut || !contactName || !contactPhone || !contactEmail) {
      return res.status(400).json({ ok:false, error:"Faltan campos obligatorios (empresa/contacto)." });
    }

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
      `- Interior: ${b.indoor ?? ""}`,
      `- Terreno: ${b.terrain ?? ""}`,
      `- Tipo trabajo: ${b.jobType ?? ""}`,
      `- Restricción emisiones/ruido: ${b.emissionsRestriction ?? ""}`,
      `- Acceso negativo: ${b.needsNegativeAccess ?? ""}`,
      "",
      "ACCESO",
      `- Tipo de acceso: ${b.accessType ?? ""}`,
      `- Ancho acceso (cm): ${b.accessWidthCm ?? ""}`,
      `- Altura acceso (cm): ${b.accessHeightCm ?? ""}`,
      `- Ascensor máx (kg): ${b.elevatorMaxKg ?? ""}`,
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
      lastName: contactName || companyName,
      description: desc,
      emailAddresses: [{ emailAddress: contactEmail, emailTypeCode:"BUSINESS", emailType:"Business", id:"email_1" }],
      phoneNumbers: [{ phoneNumber: contactPhone, phoneTypeCode:"MOBILE", phoneType:"Mobile", id:"phone_1" }],
    };

    const url = new URL("https://api.apptivo.com/app/dao/v6/leads");
    url.searchParams.set("a","save");
    url.searchParams.set("apiKey", apiKey);
    url.searchParams.set("accessKey", accessKey);
    url.searchParams.set("leadData", JSON.stringify(leadData));

    const resp = await fetch(url.toString(), { method:"GET" });
    const text = await resp.text();
    if (!resp.ok) return res.status(502).json({ ok:false, error:"Error Apptivo", status:resp.status, body:text });

    let data; try { data = JSON.parse(text); } catch { data = { raw:text }; }
    return res.status(200).json({ ok:true, apptivo:data });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e?.message || "Unknown error" });
  }
}
