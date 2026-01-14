// api/apptivo-lead.js
export default async function handler(req, res) {
  // CORS básico (por si lo abren desde un embed/preview)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const apiKey = process.env.APPTIVO_API_KEY;
    const accessKey = process.env.APPTIVO_ACCESS_KEY;

    if (!apiKey || !accessKey) {
      return res.status(500).json({
        ok: false,
        error: "Missing APPTIVO_API_KEY or APPTIVO_ACCESS_KEY in Vercel env vars",
      });
    }

    const body = req.body || {};

    // Datos obligatorios para ustedes
    const companyName = String(body.companyName || "").trim();
    const companyRut = String(body.companyRut || "").trim();
    const contactName = String(body.contactName || "").trim();
    const contactPhone = String(body.contactPhone || "").trim();
    const contactEmail = String(body.contactEmail || "").trim();

    if (!companyName || !companyRut || !contactName || !contactPhone || !contactEmail) {
      return res.status(400).json({
        ok: false,
        error: "Missing required fields",
        missing: {
          companyName: !companyName,
          companyRut: !companyRut,
          contactName: !contactName,
          contactPhone: !contactPhone,
          contactEmail: !contactEmail,
        },
      });
    }

    // Armamos un "leadData" mínimo y robusto.
    // Apptivo indica que el único obligatorio para crear leads es Last Name. :contentReference[oaicite:2]{index=2}
    // Igual mandamos email/phone y metemos TODO lo técnico en description para no depender de IDs de custom fields.
    const descriptionLines = [
      `Solicitud de cotización desde Recomendador Spider (Vertitek)`,
      ``,
      `EMPRESA: ${companyName}`,
      `RUT: ${companyRut}`,
      `CONTACTO: ${contactName}`,
      `TEL: ${contactPhone}`,
      `EMAIL: ${contactEmail}`,
      ``,
      `DATOS TÉCNICOS:`,
      `- Altura requerida (m): ${body.heightM ?? ""}`,
      `- Alcance requerido (m): ${body.reachM ?? ""}`,
      `- Inclinación terreno (°): ${body.slopeDeg ?? ""}`,
      `- Tipo de acceso: ${body.accessType ?? ""}`,
      `- Ancho acceso (cm): ${body.accessWidthCm ?? ""}`,
      `- Altura acceso (cm): ${body.accessHeightCm ?? ""}`,
      `- Ascensor máx (kg): ${body.elevatorMaxKg ?? ""}`,
      `- Cabina ascensor ancho (cm): ${body.elevatorCabinWidthCm ?? ""}`,
      `- Cabina ascensor fondo (cm): ${body.elevatorCabinDepthCm ?? ""}`,
      ``,
      `RECOMENDACIÓN:`,
      `- Equipo recomendado: ${body.recommendedModel ?? ""}`,
      `- Motivo: ${body.recommendationReason ?? ""}`,
      ``,
      `LEGAL: Recomendación basada en información entregada por el cliente y fichas técnicas. La decisión final es del cliente.`,
    ];

    const leadData = {
      // "Last Name" es el mínimo requerido en Apptivo Leads. :contentReference[oaicite:3]{index=3}
      lastName: contactName || companyName,
      description: descriptionLines.join("\n"),

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
          phoneTypeCode: "MOBILE",
          phoneType: "Mobile",
          id: "cont_phone_input",
        },
      ],
    };

    // Endpoint oficial createLead (DAO v6) :contentReference[oaicite:4]{index=4}
    const url = new URL("https://api.apptivo.com/app/dao/v6/leads");
    url.searchParams.set("a", "save");
    url.searchParams.set("apiKey", apiKey);
    url.searchParams.set("accessKey", accessKey);
    url.searchParams.set("leadData", JSON.stringify(leadData));

    const apptivoResp = await fetch(url.toString(), { method: "GET" });
    const text = await apptivoResp.text();

    if (!apptivoResp.ok) {
      return res.status(502).json({
        ok: false,
        error: "Apptivo API error",
        status: apptivoResp.status,
        body: text,
      });
    }

    // Apptivo responde JSON, pero por seguridad lo parseamos con try/catch
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    return res.status(200).json({ ok: true, apptivo: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "Unknown error" });
  }
}
