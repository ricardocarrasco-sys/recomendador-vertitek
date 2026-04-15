import React, { useMemo, useState } from "react";

/**
 * Recomendador Spider – VertiTek (v3.2 FIX)
 * - Hard filter real: NO recomienda modelos que no cumplan alcance/altura/acceso (usa working envelope)
 * - Parseo numérico robusto: acepta coma decimal (12,5) y evita NaN
 * - Cotización: días de arriendo + lugar + horario (diurno/nocturno)
 * - Envío directo a Apptivo (Opportunities) vía /api/apptivo-lead
 * - WhatsApp como respaldo opcional
 */

const PSO_CATALOG = [
  {
    id: "pso-11bl",
    name: "PSO-11BL",
    maxWorkingHeightM: 10.8,
    maxPlatformHeightM: 8.8,
    maxOutreachM: 6.2,
    outreachCapacityKg: 120,
    maxCapacityKg: 200,
    people: 2,
    minAccessWidthCm: 84,
    stowedWidthM: 0.84,
    stowedLengthM: 3.38,
    stowedHeightM: 1.98,
    weightKg: 1535,
    power: "Eléctrico (Litio + 220V)",
    powerType: "electric",
    autoLevel: true,
    maxWorkSlopeDeg: 11,
    maxTravelSlopePct: 28,
    basketRotationDesc: "2×90°",
    unique: ["Acceso negativo (canastillo bajo nivel de estabilizadores)", "Compacto y liviano"],
    envelope: [
      { h: 0, r: 6.2 },
      { h: 2, r: 6.0 },
      { h: 4, r: 5.4 },
      { h: 6, r: 4.2 },
      { h: 8, r: 3.0 },
      { h: 9, r: 2.2 },
      { h: 10, r: 1.2 },
      { h: 10.8, r: 0 },
    ],
  },
  {
    id: "pso-18bl",
    name: "PSO-18BL",
    maxWorkingHeightM: 17.8,
    maxPlatformHeightM: 15.8,
    maxOutreachM: 9.3,
    outreachCapacityKg: 120,
    maxCapacityKg: 230,
    people: 2,
    minAccessWidthCm: 78,
    stowedWidthM: 0.78,
    stowedLengthM: 4.44,
    stowedHeightM: 1.995,
    weightKg: 2300,
    power: "Eléctrico (Litio + 220V)",
    powerType: "electric",
    autoLevel: true,
    maxWorkSlopeDeg: 11,
    maxTravelSlopePct: 28,
    basketRotationDesc: "2×90°",
    unique: ["Acceso muy estrecho (78 cm)"],
    envelope: [
      { h: 0, r: 9.3 },
      { h: 2, r: 9.1 },
      { h: 4, r: 8.8 },
      { h: 6, r: 8.2 },
      { h: 8, r: 7.2 },
      { h: 10, r: 6.2 },
      { h: 12, r: 5.0 },
      { h: 14, r: 3.8 },
      { h: 16, r: 2.2 },
      { h: 17.8, r: 0 },
    ],
  },
  {
    id: "pso-18c",
    name: "PSO-18C",
    maxWorkingHeightM: 17.7,
    maxPlatformHeightM: 15.7,
    maxOutreachM: 11.3,
    outreachCapacityKg: 80,
    maxCapacityKg: 230,
    people: 2,
    minAccessWidthCm: 99,
    stowedWidthM: 0.99,
    stowedLengthM: 5.58,
    stowedHeightM: 1.98,
    weightKg: 2400,
    power: "Bi-energía (Diésel + 220V)",
    powerType: "diesel-220",
    autoLevel: true,
    maxWorkSlopeDeg: 11,
    maxTravelSlopePct: 28,
    basketRotationDesc: "No",
    unique: ["Gran alcance horizontal (11,3 m a 80 kg)"],
    envelope: [
      { h: 0, r: 11.3 },
      { h: 5, r: 10.8 },
      { h: 8, r: 10.0 },
      { h: 10, r: 9.2 },
      { h: 12, r: 8.0 },
      { h: 14, r: 6.5 },
      { h: 15.5, r: 5.0 },
      { h: 16.5, r: 3.0 },
      { h: 17.7, r: 0 },
    ],
  },
  {
    id: "pso-22b",
    name: "PSO-22B",
    maxWorkingHeightM: 22,
    maxPlatformHeightM: 20,
    maxOutreachM: 10.9,
    outreachCapacityKg: 200,
    maxCapacityKg: 250,
    people: 2,
    minAccessWidthCm: 94.5,
    stowedWidthM: 0.945,
    stowedLengthM: 5.2,
    stowedHeightM: 1.97,
    weightKg: 2990,
    power: "Bi-energía (Gasolina + 220V)",
    powerType: "gas-220",
    autoLevel: true,
    maxWorkSlopeDeg: 11,
    maxTravelSlopePct: 28,
    basketRotationDesc: "2×90°",
    unique: ["Múltiples configuraciones de estabilización"],
    envelope: [
      { h: 0, r: 10.9 },
      { h: 5, r: 10.9 },
      { h: 9, r: 10.9 },
      { h: 12, r: 10.0 },
      { h: 15, r: 8.8 },
      { h: 18, r: 7.0 },
      { h: 20, r: 5.0 },
      { h: 22, r: 0 },
    ],
  },
  {
    id: "pso-26b",
    name: "PSO-26B",
    maxWorkingHeightM: 26,
    maxPlatformHeightM: 24,
    maxOutreachM: 14.5,
    outreachCapacityKg: null,
    maxCapacityKg: 250,
    people: 2,
    minAccessWidthCm: 99,
    stowedWidthM: 0.99,
    stowedLengthM: 5.58,
    stowedHeightM: 1.98,
    weightKg: 3350,
    power: "Bi-energía (Diésel + 220V)",
    powerType: "diesel-220",
    autoLevel: true,
    maxWorkSlopeDeg: 11,
    maxTravelSlopePct: 28,
    basketRotationDesc: "2×90°",
    unique: ["Máxima altura y alcance"],
    envelope: [
      { h: 0, r: 14.5 },
      { h: 5, r: 14.5 },
      { h: 10, r: 14.5 },
      { h: 12, r: 14.0 },
      { h: 15, r: 13.0 },
      { h: 18, r: 11.5 },
      { h: 20, r: 10.0 },
      { h: 22, r: 8.0 },
      { h: 24, r: 5.5 },
      { h: 26, r: 0 },
    ],
  },
  {
    id: "pso-26bh",
    name: "PSO-26BH",
    maxWorkingHeightM: 26,
    maxPlatformHeightM: 24,
    maxOutreachM: 14.5,
    outreachCapacityKg: null,
    maxCapacityKg: 250,
    people: 2,
    minAccessWidthCm: 99,
    stowedWidthM: 0.99,
    stowedLengthM: 5.58,
    stowedHeightM: 1.98,
    weightKg: 3450,
    power: "Híbrido (Diésel + Baterías Li)",
    powerType: "hybrid",
    autoLevel: true,
    maxWorkSlopeDeg: 11,
    maxTravelSlopePct: 28,
    basketRotationDesc: "2×90°",
    unique: ["Modo más limpio/ruido reducido vs diésel puro"],
    envelope: [
      { h: 0, r: 14.5 },
      { h: 5, r: 14.5 },
      { h: 10, r: 14.5 },
      { h: 12, r: 14.0 },
      { h: 15, r: 13.0 },
      { h: 18, r: 11.5 },
      { h: 20, r: 10.0 },
      { h: 22, r: 8.0 },
      { h: 24, r: 5.5 },
      { h: 26, r: 0 },
    ],
  },
];

const WHATSAPP_NUMBER_E164 = "+56942600557";
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());

// Convierte inputs a número de forma segura (acepta coma decimal).
const toNum = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === "") return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

const normalizePhone = (raw) => {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("56")) return `+${digits}`;
  if (digits.length >= 8) return `+56${digits}`;
  return `+${digits}`;
};

const cleanRut = (rut) => String(rut || "").toUpperCase().replace(/[^0-9K]/g, "");
const formatRut = (rut) => {
  const c = cleanRut(rut);
  if (c.length < 2) return rut || "";
  const body = c.slice(0, -1);
  const dv = c.slice(-1);
  let out = "";
  for (let i = body.length - 1, j = 0; i >= 0; i--, j++) {
    out = body[i] + out;
    if (j % 3 === 2 && i !== 0) out = "." + out;
  }
  return `${out}-${dv}`;
};
const validateRut = (rut) => {
  const c = cleanRut(rut);
  if (c.length < 2) return false;
  const body = c.slice(0, -1);
  const dv = c.slice(-1);
  let sum = 0;
  let mul = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const mod = 11 - (sum % 11);
  const dvCalc = mod === 11 ? "0" : mod === 10 ? "K" : String(mod);
  return dvCalc === dv;
};

// Alcance máximo aproximado para una altura dada (interpolación lineal).
function reachAtHeight(model, heightM) {
  const env = model?.envelope;
  if (!Array.isArray(env) || env.length < 2) return model.maxOutreachM;
  const h = Math.max(env[0].h, Math.min(heightM, env[env.length - 1].h));
  for (let i = 0; i < env.length - 1; i++) {
    const a = env[i];
    const b = env[i + 1];
    if (h >= a.h && h <= b.h) {
      const t = (h - a.h) / (b.h - a.h || 1);
      return a.r + t * (b.r - a.r);
    }
  }
  return env[env.length - 1].r;
}

// Hard constraints: si falla cualquiera, el modelo NO debe recomendarse.
function hardFails(model, p) {
  const fails = [];
  if (p.heightM > model.maxWorkingHeightM + 1e-9) fails.push("altura");
  if (p.outreachM != null) {
    const allowed = reachAtHeight(model, p.heightM);
    if (p.outreachM > allowed + 0.05) fails.push("alcance");
  }
  if (p.accessWidthCm != null) {
    if (p.accessWidthCm < model.minAccessWidthCm - 1e-9) fails.push("ancho");
  }
  if (p.accessHeightCm != null) {
    const neededCm = Math.round((model.stowedHeightM || 0) * 100);
    if (p.accessHeightCm < neededCm - 1e-9) fails.push("alto");
  }
  return fails;
}
function isEligible(model, p) {
  return hardFails(model, p).length === 0;
}

function reachLine(model, heightM) {
  const h = Number(heightM || 0);
  const allowed = reachAtHeight(model, h);
  const kg = model?.outreachCapacityKg;
  const kgTxt = kg ? ` (con ${kg} kg)` : "";
  return `Alcance máximo a ${h.toFixed(0)} m de altura: ${allowed.toFixed(1)} m${kgTxt}`;
}

function scoreModel(model, p) {
  const reasons = [];
  const warnings = [];
  let score = 0;

  if (p.heightM <= model.maxWorkingHeightM) {
    const margin = model.maxWorkingHeightM - p.heightM;
    score += 40 - clamp(margin * 3, 0, 18);
    reasons.push(`Cumple altura (${model.maxWorkingHeightM}m ≥ ${p.heightM}m).`);
  } else {
    score -= 200;
    warnings.push(`No alcanza altura (${model.maxWorkingHeightM}m < ${p.heightM}m).`);
  }

  if (p.outreachM === null) {
    score += 6;
  } else {
    const allowed = reachAtHeight(model, p.heightM);
    if (p.outreachM <= allowed) {
      const margin = allowed - p.outreachM;
      score += 18 - clamp(margin * 2, 0, 10);
      reasons.push(`Cumple alcance a ${p.heightM}m (máx ~${allowed.toFixed(1)}m ≥ ${p.outreachM}m).`);
    } else {
      score -= 40;
      warnings.push(`Alcance insuficiente a ${p.heightM}m (máx ~${allowed.toFixed(1)}m < ${p.outreachM}m).`);
    }
  }

  return { score, reasons, warnings };
}

export default function App() {
  const [step, setStep] = useState(1);
  const [submitStatus, setSubmitStatus] = useState(null);

  // Trabajo
  const [heightM, setHeightM] = useState("");
  const [outreachM, setOutreachM] = useState("");
  const [accessType, setAccessType] = useState("puerta");
  const [accessWidthCm, setAccessWidthCm] = useState("");
  const [accessHeightCm, setAccessHeightCm] = useState("");

  // Motorización (opcional)
  const [motorPref, setMotorPref] = useState("any"); // any | bi | hybrid | battery

  // ✅ Inputs solicitados
  const [indoor, setIndoor] = useState("no");
  const [terrain, setTerrain] = useState("Plano");
  const [jobType, setJobType] = useState("Mantención");
  const [slopeValue, setSlopeValue] = useState(""); // grados

  const [notes, setNotes] = useState("");

  // Empresa/contacto
  const [companyName, setCompanyName] = useState("");
  const [companyRut, setCompanyRut] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  // Cotización / arriendo
  const [rentalDays, setRentalDays] = useState("");
  const [workSite, setWorkSite] = useState("");
  const [deliveryWindow, setDeliveryWindow] = useState("diurno");

  const legalText =
    "La recomendación entregada por Grupo Vertikal se basa exclusivamente en la información proporcionada por el cliente y en las fichas técnicas de los equipos disponibles al momento de la consulta. Esta recomendación tiene carácter referencial y no constituye una validación técnica definitiva. La decisión final sobre la selección y uso del equipo es de exclusiva responsabilidad del cliente.";

  const slopeDeg = useMemo(() => {
    if (slopeValue === "") return null;
    return toNum(slopeValue);
  }, [slopeValue]);

  const outreachInvalid = outreachM !== "" && toNum(outreachM) === null;
  const companyRutValid = validateRut(companyRut);

  const jobParams = useMemo(
    () => ({
      heightM: toNum(heightM) ?? 0,
      outreachM: toNum(outreachM),
      accessType,
      accessWidthCm: toNum(accessWidthCm),
      accessHeightCm: toNum(accessHeightCm),
      motorPref,
      indoor,
      terrain,
      jobType,
      slopeDeg,
      notes,
    }),
    [heightM, outreachM, accessType, accessWidthCm, accessHeightCm, motorPref, indoor, terrain, jobType, slopeDeg, notes]
  );

  const quoteParams = useMemo(
    () => ({
      rentalDays: toNum(rentalDays),
      workSite: String(workSite || "").trim(),
      deliveryWindow,
      deliveryWindowLabel: deliveryWindow === "nocturno" ? "Nocturno (17 a 9 hrs)" : "Diurno (9 a 17 hrs)",
    }),
    [rentalDays, workSite, deliveryWindow]
  );

  // ✅ Recomendación SOLO con elegibles + filtro por motorización
  const recommendations = useMemo(() => {
    const eligible = PSO_CATALOG.filter((m) => {
      if (!isEligible(m, jobParams)) return false;

      if (jobParams.motorPref === "any") return true;
      if (jobParams.motorPref === "bi") return m.powerType === "diesel-220" || m.powerType === "gas-220";
      if (jobParams.motorPref === "hybrid") return m.powerType === "hybrid";

      // ✅ Batería (Litio) incluye eléctricos + híbridos
      if (jobParams.motorPref === "battery") return m.powerType === "electric" || m.powerType === "hybrid";
      return true;
    });

    if (eligible.length === 0) return [];
    const scored = eligible.map((m) => ({ ...m, ...scoreModel(m, jobParams) }));
    return scored.sort((a, b) => b.score - a.score).slice(0, 3);
  }, [jobParams]);

  const top = recommendations[0] || null;

  const step1Ok = jobParams.heightM > 0 && !outreachInvalid && jobParams.accessWidthCm != null && jobParams.accessWidthCm > 0;
  const step2Ok = Boolean(top);

  const step3Ok =
    companyName.trim().length >= 2 &&
    companyRutValid &&
    contactName.trim().length >= 2 &&
    normalizePhone(contactPhone).length >= 8 &&
    isValidEmail(contactEmail) &&
    quoteParams.rentalDays != null &&
    quoteParams.rentalDays > 0 &&
    quoteParams.workSite.length >= 3 &&
    (quoteParams.deliveryWindow === "diurno" || quoteParams.deliveryWindow === "nocturno");

  const canGoNext = (step === 1 && step1Ok) || (step === 2 && step2Ok) || (step === 3 && step3Ok) || step === 4;

  async function submitToApptivo() {
    try {
      setSubmitStatus({ kind: "loading", msg: "Enviando solicitud..." });
      if (!top) throw new Error("No hay recomendación compatible aún.");
      if (!companyRutValid) throw new Error("Debes ingresar un RUT empresa válido.");

      const payload = {
        companyName,
        companyRut: formatRut(companyRut),
        contactName,
        contactPhone: normalizePhone(contactPhone),
        contactEmail: String(contactEmail || "").trim(),

        rentalDays: quoteParams.rentalDays,
        jobLocation: quoteParams.workSite,
        deliveryShift: quoteParams.deliveryWindowLabel,

        heightM: jobParams.heightM,
        reachM: jobParams.outreachM,
        slopeDeg: jobParams.slopeDeg,
        indoor: jobParams.indoor === "yes" ? "Interior" : "Exterior",
        terrain: jobParams.terrain,
        jobType: jobParams.jobType,

        recommendedModel: top.name,
        legalText,
      };

      const r = await fetch("/api/apptivo-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) throw new Error(data?.error || "Error enviando a Apptivo");
      setSubmitStatus({ kind: "ok", msg: "Solicitud enviada ✅. Te contactaremos a la brevedad." });
    } catch (e) {
      setSubmitStatus({ kind: "err", msg: `No se pudo enviar: ${e.message}` });
    }
  }

  const stepTitle = (s) => ({ 1: "Datos del trabajo", 2: "Recomendación", 3: "Datos para cotización", 4: "Enviar solicitud" }[s] || "");

  return (
    <div className="container">
      <div className="row">
        <div>
          <div className="h1">Recomendador Spider – Grupo Vertikal</div>
          <div className="sub">Recomendación técnica + cotización formal. (Fotos se solicitan luego si aplica.)</div>
        </div>
        <span className="badge">Paso {step} de 4</span>
      </div>

      <div className="grid">
        <div className="card">
          <div className="row" style={{ alignItems: "flex-start" }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{stepTitle(step)}</div>
            </div>
            {step === 2 && top ? <span className="badge primary">Top: {top.name}</span> : null}
          </div>

          {step === 1 && (
            <>
              <hr />
              <div className="cols2">
                <div>
                  <label>Altura requerida (m) ⭐</label>
                  <input type="number" min="1" value={heightM} onChange={(e) => setHeightM(e.target.value)} placeholder="Ej: 11" />
                </div>

                <div>
                  <label>Alcance horizontal requerido (m) (opcional)</label>
                  <input type="text" value={outreachM} onChange={(e) => setOutreachM(e.target.value)} placeholder="Ej: 12 o 12,5" />
                  {outreachInvalid ? (
                    <div className="help" style={{ color: "#b00020" }}>
                      Alcance inválido. Usa número con punto o coma (ej: 12,5).
                    </div>
                  ) : null}
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label>Motorización (opcional)</label>
                  <select value={motorPref} onChange={(e) => setMotorPref(e.target.value)}>
                    <option value="any">1. Cualquiera</option>
                    <option value="bi">2. Motor a combustión y motor eléctrico de 220volts</option>
                    <option value="hybrid">3. Hibrido (Diesel / Bateria de Litio)</option>
                    <option value="battery">4. Batería (Batería de Litio)</option>
                  </select>
                </div>

                <div>
                  <label>Interior / Exterior</label>
                  <select value={indoor} onChange={(e) => setIndoor(e.target.value)}>
                    <option value="no">Exterior</option>
                    <option value="yes">Interior</option>
                  </select>
                </div>

                <div>
                  <label>Tipo de terreno</label>
                  <select value={terrain} onChange={(e) => setTerrain(e.target.value)}>
                    <option value="Plano">Plano</option>
                    <option value="Mixto">Mixto</option>
                    <option value="Irregular">Irregular</option>
                  </select>
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label>Tipo de trabajo</label>
                  <select value={jobType} onChange={(e) => setJobType(e.target.value)}>
                    <option value="Mantención">Mantención / limpieza</option>
                    <option value="Instalación">Instalación</option>
                    <option value="Construcción">Construcción / montaje</option>
                    <option value="Inspección">Inspección</option>
                  </select>
                </div>

                <div>
                  <label>Inclinación terreno en grados (°) (opcional)</label>
                  <input type="text" value={slopeValue} onChange={(e) => setSlopeValue(e.target.value)} placeholder="Ej: 8 o 8,5" />
                </div>

                <div>
                  <label>Tipo de acceso</label>
                  <select value={accessType} onChange={(e) => setAccessType(e.target.value)}>
                    <option value="puerta">Puerta</option>
                    <option value="pasillo">Pasillo</option>
                    <option value="porton">Portón</option>
                    <option value="ascensor">Ascensor</option>
                  </select>
                </div>

                <div>
                  <label>Ancho disponible en el acceso (cm) ⭐</label>
                  <input type="text" value={accessWidthCm} onChange={(e) => setAccessWidthCm(e.target.value)} placeholder="Ej: 95" />
                </div>

                <div>
                  <label>Altura disponible del acceso (cm) (opcional)</label>
                  <input type="text" value={accessHeightCm} onChange={(e) => setAccessHeightCm(e.target.value)} placeholder="Ej: 200" />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label>Notas</label>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Cables, desnivel, piso delicado, puerta exacta..." />
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <hr />
              {!step1Ok ? (
                <div className="notice">Completa los datos del trabajo para obtener una recomendación.</div>
              ) : !top ? (
                <div className="notice err">
                  <strong>No hay equipo compatible</strong> con las medidas ingresadas (altura/alcance/acceso).
                </div>
              ) : (
                <div className="notice">
                  <div style={{ fontWeight: 800 }}>{top.name}</div>
                  <div className="small">{reachLine(top, jobParams.heightM)}</div>
                </div>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <hr />
              <div className="cols2">
                <div>
                  <label>Nombre empresa ⭐</label>
                  <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                </div>
                <div>
                  <label>RUT empresa ⭐</label>
                  <input value={formatRut(companyRut)} onChange={(e) => setCompanyRut(e.target.value)} placeholder="76.123.456-7" />
                  {companyRut.trim() !== "" && !companyRutValid ? (
                    <div className="help" style={{ color: "#b00020" }}>
                      Ingresa un RUT válido (ej: 76.123.456-7).
                    </div>
                  ) : null}
                </div>
                <div>
                  <label>Nombre contacto ⭐</label>
                  <input value={contactName} onChange={(e) => setContactName(e.target.value)} />
                </div>
                <div>
                  <label>Teléfono contacto ⭐</label>
                  <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+56 9 1234 5678" />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label>Correo electrónico contacto ⭐</label>
                  <input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="correo@empresa.cl" />
                </div>

                <div>
                  <label>Días de arriendo ⭐</label>
                  <input type="text" value={rentalDays} onChange={(e) => setRentalDays(e.target.value)} placeholder="Ej: 3" />
                </div>

                <div>
                  <label>Horario de entrega ⭐</label>
                  <select value={deliveryWindow} onChange={(e) => setDeliveryWindow(e.target.value)}>
                    <option value="diurno">Diurno (9 a 17 hrs)</option>
                    <option value="nocturno">Nocturno (17 a 9 hrs)</option>
                  </select>
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label>Lugar donde necesita el equipo ⭐</label>
                  <textarea value={workSite} onChange={(e) => setWorkSite(e.target.value)} placeholder="Dirección, comuna, ciudad + indicaciones de acceso" />
                </div>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <hr />
              <div className="notice">
                <div className="btnbar">
                  <button className="primary" onClick={submitToApptivo} disabled={!top || submitStatus?.kind === "loading"}>
                    Solicitar cotización
                  </button>
                </div>

                {submitStatus ? (
                  <div className={`notice ${submitStatus.kind === "err" ? "err" : ""}`} style={{ marginTop: 12 }}>
                    {submitStatus.kind === "loading" ? "⏳ " : submitStatus.kind === "ok" ? "✅ " : "⚠️ "}
                    {submitStatus.msg}
                  </div>
                ) : null}

                <div className="notice" style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 800 }}>Cláusula</div>
                  <div className="small" style={{ marginTop: 6 }}>{legalText}</div>
                </div>
              </div>
            </>
          )}

          <div className="btnbar">
            <button onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1}>
              Atrás
            </button>

            {step < 4 ? (
              <button className="primary" onClick={() => setStep((s) => Math.min(4, s + 1))} disabled={!canGoNext}>
                Siguiente
              </button>
            ) : null}
          </div>
        </div>

        <div className="card">
          <div style={{ fontWeight: 800 }}>Top sugerido</div>
          <div className="small" style={{ marginTop: 8 }}>
            {top ? (
              <>
                <div><strong>{top.name}</strong></div>
                <div>{reachLine(top, jobParams.heightM)}</div>
              </>
            ) : (
              "Completa datos del trabajo."
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
