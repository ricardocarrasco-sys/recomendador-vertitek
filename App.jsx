import React, { useMemo, useState } from "react";

/**
 * Recomendador Spider – VertiTek (v2)
 * - Fotos eliminadas en esta etapa (el vendedor las solicita si aplica)
 * - Envío directo a Apptivo (Leads) vía /api/apptivo-lead
 * - WhatsApp queda como respaldo opcional
 */

const PSO_CATALOG = [
  { id:"pso-11bl", name:"PSO-11BL", maxWorkingHeightM:10.8, maxPlatformHeightM:8.8, maxOutreachM:6.2, outreachCapacityKg:120,
    maxCapacityKg:200, people:2, minAccessWidthCm:84, stowedWidthM:0.84, stowedLengthM:3.38, stowedHeightM:1.98, weightKg:1535,
    power:"Eléctrico (Litio + 220V)", powerType:"electric", autoLevel:true, maxWorkSlopeDeg:11, maxTravelSlopePct:28, basketRotationDesc:"2×90°",
    unique:["Acceso negativo (canastillo bajo nivel de estabilizadores)","Compacto y liviano"] },
  { id:"pso-18bl", name:"PSO-18BL", maxWorkingHeightM:17.8, maxPlatformHeightM:15.8, maxOutreachM:9.3, outreachCapacityKg:120,
    maxCapacityKg:230, people:2, minAccessWidthCm:78, stowedWidthM:0.78, stowedLengthM:4.44, stowedHeightM:1.995, weightKg:2300,
    power:"Eléctrico (Litio + 220V)", powerType:"electric", autoLevel:true, maxWorkSlopeDeg:11, maxTravelSlopePct:28, basketRotationDesc:"2×90°",
    unique:["Acceso muy estrecho (78 cm)"] },
  { id:"pso-18c", name:"PSO-18C", maxWorkingHeightM:17.7, maxPlatformHeightM:15.7, maxOutreachM:11.3, outreachCapacityKg:80,
    maxCapacityKg:230, people:2, minAccessWidthCm:99, stowedWidthM:0.99, stowedLengthM:5.58, stowedHeightM:1.98, weightKg:2400,
    power:"Bi-energía (Diésel + 220V)", powerType:"diesel-220", autoLevel:true, maxWorkSlopeDeg:11, maxTravelSlopePct:28, basketRotationDesc:"No",
    unique:["Gran alcance horizontal (11,3 m a 80 kg)"] },
  { id:"pso-22b", name:"PSO-22B", maxWorkingHeightM:22, maxPlatformHeightM:20, maxOutreachM:10.9, outreachCapacityKg:200,
    maxCapacityKg:250, people:2, minAccessWidthCm:94.5, stowedWidthM:0.945, stowedLengthM:5.2, stowedHeightM:1.97, weightKg:2990,
    power:"Bi-energía (Gasolina + 220V)", powerType:"gas-220", autoLevel:true, maxWorkSlopeDeg:11, maxTravelSlopePct:28, basketRotationDesc:"2×90°",
    unique:["Múltiples configuraciones de estabilización"] },
  { id:"pso-26b", name:"PSO-26B", maxWorkingHeightM:26, maxPlatformHeightM:24, maxOutreachM:14.5, outreachCapacityKg:null,
    maxCapacityKg:250, people:2, minAccessWidthCm:99, stowedWidthM:0.99, stowedLengthM:5.58, stowedHeightM:1.98, weightKg:3350,
    power:"Bi-energía (Diésel + 220V)", powerType:"diesel-220", autoLevel:true, maxWorkSlopeDeg:11, maxTravelSlopePct:28, basketRotationDesc:"2×90°",
    unique:["Máxima altura y alcance"] },
  { id:"pso-26bh", name:"PSO-26BH", maxWorkingHeightM:26, maxPlatformHeightM:24, maxOutreachM:14.5, outreachCapacityKg:null,
    maxCapacityKg:250, people:2, minAccessWidthCm:99, stowedWidthM:0.99, stowedLengthM:5.58, stowedHeightM:1.98, weightKg:3450,
    power:"Híbrido (Diésel + Baterías Li)", powerType:"hybrid", autoLevel:true, maxWorkSlopeDeg:11, maxTravelSlopePct:28, basketRotationDesc:"2×90°",
    unique:["Modo más limpio/ruido reducido vs diésel puro"] },
];

const WHATSAPP_NUMBER_E164 = "+56942600557";
const clamp = (n,min,max)=>Math.max(min,Math.min(max,n));
const fmt = (n,suf="")=>{
  if(n===null||n===undefined||n==="") return "—";
  const x=Number(n); if(Number.isNaN(x)) return "—";
  return `${x}${suf}`;
};
const isValidEmail = (email)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email||"").trim());
const normalizePhone = (raw)=>{
  const digits = String(raw||"").replace(/\D/g,"");
  if(!digits) return "";
  if(digits.startsWith("56")) return `+${digits}`;
  if(digits.length>=8) return `+56${digits}`;
  return `+${digits}`;
};
const cleanRut = (rut)=>String(rut||"").toUpperCase().replace(/[^0-9K]/g,"");
const formatRut = (rut)=>{
  const c=cleanRut(rut);
  if(c.length<2) return rut||"";
  const body=c.slice(0,-1), dv=c.slice(-1);
  let out="";
  for(let i=body.length-1,j=0;i>=0;i--,j++){
    out=body[i]+out;
    if(j%3===2 && i!==0) out="."+out;
  }
  return `${out}-${dv}`;
};
const validateRut = (rut)=>{
  const c=cleanRut(rut);
  if(c.length<2) return false;
  const body=c.slice(0,-1), dv=c.slice(-1);
  let sum=0,mul=2;
  for(let i=body.length-1;i>=0;i--){
    sum+=Number(body[i])*mul;
    mul=mul===7?2:mul+1;
  }
  const mod=11-(sum%11);
  const dvCalc=mod===11?"0":mod===10?"K":String(mod);
  return dvCalc===dv;
};
const degFromPercent = (pct)=>{
  const p=Number(pct); if(Number.isNaN(p)) return null;
  return (Math.atan(p/100)*180)/Math.PI;
};

function scoreModel(model,p){
  const reasons=[], warnings=[];
  let score=0;

  if(p.heightM<=model.maxWorkingHeightM){
    const margin=model.maxWorkingHeightM-p.heightM;
    score+=40-clamp(margin*3,0,18);
    reasons.push(`Cumple altura (${model.maxWorkingHeightM}m ≥ ${p.heightM}m).`);
  } else { score-=200; warnings.push(`No alcanza altura (${model.maxWorkingHeightM}m < ${p.heightM}m).`); }

  if(p.outreachM===null){ score+=6; }
  else if(p.outreachM<=model.maxOutreachM){
    const margin=model.maxOutreachM-p.outreachM;
    score+=18-clamp(margin*2,0,10);
    reasons.push(`Cumple alcance (${model.maxOutreachM}m ≥ ${p.outreachM}m).`);
  } else { score-=40; warnings.push(`Alcance insuficiente (${model.maxOutreachM}m < ${p.outreachM}m).`); }

  if(p.accessWidthCm>=model.minAccessWidthCm){
    score+=22; reasons.push(`Pasa por acceso (ancho mín ${model.minAccessWidthCm}cm).`);
  } else { score-=120; warnings.push(`No pasa por el acceso (ancho mín ${model.minAccessWidthCm}cm; disponible ${p.accessWidthCm}cm).`); }

  if(p.accessHeightCm!=null){
    const neededCm=Math.round((model.stowedHeightM||0)*100);
    if(neededCm>0){
      if(p.accessHeightCm>=neededCm){ score+=10; reasons.push(`Altura de acceso OK (mín ${neededCm}cm).`); }
      else { score-=90; warnings.push(`Altura de acceso insuficiente (mín ${neededCm}cm; disponible ${p.accessHeightCm}cm).`); }
    }
  }

  if(p.accessType==="ascensor"){
    if(p.elevatorMaxKg!=null){
      const machineKg=Number(model.weightKg)||0;
      if(p.elevatorMaxKg>=machineKg){ score+=8; reasons.push(`Ascensor soporta peso (equipo ${machineKg}kg ≤ máx ${p.elevatorMaxKg}kg).`); }
      else { score-=140; warnings.push(`Ascensor NO soporta el peso (equipo ${machineKg}kg > máx ${p.elevatorMaxKg}kg).`); }
    }
    if(p.elevatorCabWidthCm!=null && p.elevatorCabDepthCm!=null){
      const needW=Math.round((model.stowedWidthM||0)*100);
      const needD=Math.round((model.stowedLengthM||0)*100);
      if(p.elevatorCabWidthCm<needW){ score-=160; warnings.push(`Cabina: ancho insuficiente (mín ${needW}cm; disponible ${p.elevatorCabWidthCm}cm).`); }
      else { score+=6; reasons.push(`Cabina: ancho OK (mín ${needW}cm).`); }
      if(p.elevatorCabDepthCm<needD){ score-=180; warnings.push(`Cabina: fondo insuficiente (mín ${needD}cm; disponible ${p.elevatorCabDepthCm}cm).`); }
      else { score+=6; reasons.push(`Cabina: fondo OK (mín ${needD}cm).`); }
    }
  }

  if(p.indoor==="yes"){
    if(model.powerType==="electric"||model.powerType==="hybrid"){ score+=12; reasons.push("Adecuado para interior (eléctrico/híbrido)."); }
    else { score-=10; warnings.push("Interior: preferir eléctrico/híbrido (ventilación)."); }
  }
  if(p.emissionsRestriction==="yes"){
    if(model.powerType==="electric"||model.powerType==="hybrid"){ score+=10; reasons.push("Mejor para restricción de emisiones/ruido."); }
    else { score-=8; warnings.push("Restricción de emisiones/ruido: este equipo puede no ser ideal."); }
  }

  if(p.slopeDeg!=null){
    if(p.slopeDeg<=model.maxWorkSlopeDeg){ score+=8; reasons.push(`Inclinación OK (≤ ${model.maxWorkSlopeDeg}°).`); }
    else { score-=8; warnings.push(`Inclinación supera ${model.maxWorkSlopeDeg}°: requiere nivelación/placas.`); }
  }

  if(p.needsNegativeAccess==="yes"){
    if(model.id==="pso-11bl"){ score+=12; reasons.push("Incluye acceso negativo (PSO-11BL)."); }
    else { score-=6; warnings.push("Acceso negativo: PSO-11BL suele ser el más adecuado."); }
  }

  return { score, reasons, warnings };
}

function buildWhatsappText({company,contact,job,rec,legalText}){
  return [
    "Hola, solicito cotización formal con los siguientes datos:\n",
    "EMPRESA",
    `- Nombre: ${company.companyName}`,
    `- RUT: ${company.companyRut}`,
    "\nCONTACTO",
    `- Nombre: ${contact.contactName}`,
    `- Teléfono: ${contact.contactPhone}`,
    `- Email: ${contact.contactEmail}`,
    "\nTRABAJO",
    `- Altura requerida: ${job.heightM} m`,
    job.outreachM ? `- Alcance requerido: ${job.outreachM} m` : null,
    `- Tipo de trabajo: ${job.jobType}`,
    `- Interior/Exterior: ${job.indoor==="yes"?"Interior":"Exterior"}`,
    `- Terreno: ${job.terrain}`,
    job.slopeDeg!=null ? `- Inclinación: ${job.slopeDeg.toFixed(1)}°` : null,
    `- Tipo de acceso: ${job.accessType}`,
    `- Ancho disponible de acceso: ${job.accessWidthCm} cm`,
    job.accessHeightCm ? `- Altura disponible de acceso: ${job.accessHeightCm} cm` : null,
    job.accessType==="ascensor" && job.elevatorMaxKg ? `- Capacidad máxima ascensor: ${job.elevatorMaxKg} kg` : null,
    job.accessType==="ascensor" && job.elevatorCabWidthCm ? `- Cabina ascensor (ancho): ${job.elevatorCabWidthCm} cm` : null,
    job.accessType==="ascensor" && job.elevatorCabDepthCm ? `- Cabina ascensor (fondo): ${job.elevatorCabDepthCm} cm` : null,
    job.emissionsRestriction==="yes" ? "- Restricción de emisiones/ruido: Sí" : "- Restricción de emisiones/ruido: No",
    job.needsNegativeAccess==="yes" ? "- Requiere acceso negativo: Sí" : "- Requiere acceso negativo: No",
    job.notes ? `- Notas: ${job.notes}` : null,
    "\nEQUIPO RECOMENDADO",
    `- Modelo: ${rec.name}`,
    `- Altura máx: ${rec.maxWorkingHeightM} m`,
    `- Alcance máx: ${rec.maxOutreachM} m`,
    `- Energía: ${rec.power}`,
    "\n"+legalText,
  ].filter(Boolean).join("\n");
}

export default function App(){
  const [step,setStep]=useState(1); // 1..4
  const [submitStatus,setSubmitStatus]=useState(null);

  const [heightM,setHeightM]=useState(18);
  const [outreachM,setOutreachM]=useState("");
  const [accessType,setAccessType]=useState("puerta");
  const [accessWidthCm,setAccessWidthCm]=useState("");
  const [accessHeightCm,setAccessHeightCm]=useState("");
  const [elevatorMaxKg,setElevatorMaxKg]=useState("");
  const [elevatorCabWidthCm,setElevatorCabWidthCm]=useState("");
  const [elevatorCabDepthCm,setElevatorCabDepthCm]=useState("");

  const [terrain,setTerrain]=useState("Plano");
  const [indoor,setIndoor]=useState("no");
  const [jobType,setJobType]=useState("Mantención");
  const [notes,setNotes]=useState("");
  const [emissionsRestriction,setEmissionsRestriction]=useState("no");
  const [needsNegativeAccess,setNeedsNegativeAccess]=useState("no");

  const [slopeUnit,setSlopeUnit]=useState("deg");
  const [slopeValue,setSlopeValue]=useState("");

  const [companyName,setCompanyName]=useState("");
  const [companyRut,setCompanyRut]=useState("");
  const [contactName,setContactName]=useState("");
  const [contactPhone,setContactPhone]=useState("");
  const [contactEmail,setContactEmail]=useState("");

  const legalText="La recomendación entregada por Grupo Vertikal se basa exclusivamente en la información proporcionada por el cliente y en las fichas técnicas de los equipos disponibles al momento de la consulta. Esta recomendación tiene carácter referencial y no constituye una validación técnica definitiva. La decisión final sobre la selección y uso del equipo es de exclusiva responsabilidad del cliente.";

  const slopeDeg = useMemo(()=>{
    if(slopeValue==="") return null;
    if(slopeUnit==="deg") return Number(slopeValue);
    return degFromPercent(slopeValue);
  },[slopeUnit,slopeValue]);

  const jobParams = useMemo(()=>({
    heightM:Number(heightM)||0,
    outreachM: outreachM===""?null:Number(outreachM),
    accessType,
    accessWidthCm:Number(accessWidthCm)||0,
    accessHeightCm: accessHeightCm===""?null:Number(accessHeightCm),
    elevatorMaxKg: elevatorMaxKg===""?null:Number(elevatorMaxKg),
    elevatorCabWidthCm: elevatorCabWidthCm===""?null:Number(elevatorCabWidthCm),
    elevatorCabDepthCm: elevatorCabDepthCm===""?null:Number(elevatorCabDepthCm),
    terrain, indoor, jobType, notes, emissionsRestriction, needsNegativeAccess, slopeDeg
  }),[heightM,outreachM,accessType,accessWidthCm,accessHeightCm,elevatorMaxKg,elevatorCabWidthCm,elevatorCabDepthCm,terrain,indoor,jobType,notes,emissionsRestriction,needsNegativeAccess,slopeDeg]);

  const recommendations = useMemo(()=>PSO_CATALOG.map(m=>({...m,...scoreModel(m,jobParams)})).sort((a,b)=>b.score-a.score).slice(0,3),[jobParams]);
  const top = recommendations[0]||null;

  const isElevator = accessType==="ascensor";

  const step1Ok = jobParams.heightM>0 && jobParams.accessWidthCm>0 && (!isElevator || (
    jobParams.accessHeightCm!=null && jobParams.accessHeightCm>0 &&
    jobParams.elevatorMaxKg!=null && jobParams.elevatorMaxKg>0 &&
    jobParams.elevatorCabWidthCm!=null && jobParams.elevatorCabWidthCm>0 &&
    jobParams.elevatorCabDepthCm!=null && jobParams.elevatorCabDepthCm>0
  ));
  const step2Ok = Boolean(top);
  const step3Ok = companyName.trim().length>=2 && validateRut(companyRut) && contactName.trim().length>=2 &&
    normalizePhone(contactPhone).length>=8 && isValidEmail(contactEmail);

  const canGoNext = (step===1 && step1Ok) || (step===2 && step2Ok) || (step===3 && step3Ok) || step===4;

  const whatsappText = useMemo(()=>{
    if(!top) return "";
    return buildWhatsappText({
      company:{companyName, companyRut: formatRut(companyRut)},
      contact:{contactName, contactPhone: normalizePhone(contactPhone), contactEmail:String(contactEmail||"").trim()},
      job: jobParams,
      rec: top,
      legalText
    });
  },[companyName,companyRut,contactName,contactPhone,contactEmail,jobParams,top]);

  const whatsappUrl = useMemo(()=>{
    const encoded = encodeURIComponent(whatsappText);
    const num = WHATSAPP_NUMBER_E164.replace(/\D/g,"");
    return `https://wa.me/${num}?text=${encoded}`;
  },[whatsappText]);

  async function submitToApptivo(){
    try{
      setSubmitStatus({kind:"loading", msg:"Enviando solicitud..."});
      if(!top) throw new Error("No hay recomendación aún.");

      const payload = {
        companyName,
        companyRut: formatRut(companyRut),
        contactName,
        contactPhone: normalizePhone(contactPhone),
        contactEmail: String(contactEmail||"").trim(),

        heightM: jobParams.heightM,
        reachM: jobParams.outreachM,
        slopeDeg: jobParams.slopeDeg,
        indoor: jobParams.indoor==="yes" ? "Interior" : "Exterior",
        terrain: jobParams.terrain,
        jobType: jobParams.jobType,
        emissionsRestriction: jobParams.emissionsRestriction==="yes" ? "Sí" : "No",
        needsNegativeAccess: jobParams.needsNegativeAccess==="yes" ? "Sí" : "No",

        accessType: jobParams.accessType,
        accessWidthCm: jobParams.accessWidthCm,
        accessHeightCm: jobParams.accessHeightCm,
        elevatorMaxKg: jobParams.elevatorMaxKg,
        elevatorCabinWidthCm: jobParams.elevatorCabWidthCm,
        elevatorCabinDepthCm: jobParams.elevatorCabDepthCm,

        recommendedModel: top.name,
        recommendationReason: (top.reasons||[]).slice(0,6).join(" | "),
        legalText
      };

      const r = await fetch("/api/apptivo-lead",{
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify(payload)
      });
      const data = await r.json().catch(()=>({}));
      if(!r.ok || !data.ok) throw new Error(data?.error || "Error enviando a Apptivo");
      setSubmitStatus({kind:"ok", msg:"Solicitud enviada ✅. Te contactaremos a la brevedad."});
    } catch(e){
      setSubmitStatus({kind:"err", msg:`No se pudo enviar: ${e.message}`});
    }
  }

  const stepTitle = (s)=>({1:"Datos del trabajo",2:"Recomendación",3:"Datos para cotización",4:"Enviar solicitud"}[s]||"");

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
          <div className="row" style={{alignItems:"flex-start"}}>
            <div>
              <div style={{fontWeight:800,fontSize:16}}>{stepTitle(step)}</div>
              <div className="small">
                {step===1 ? "Completa medidas y condiciones. Si es ascensor, se requieren datos PRO." : null}
                {step===3 ? "Datos obligatorios para cotización formal." : null}
              </div>
            </div>
            {step===2 && top ? <span className="badge primary">Top: {top.name}</span> : null}
          </div>

          {step===1 && (
            <>
              <hr/>
              <div className="cols2">
                <div>
                  <label>Altura requerida (m) ⭐</label>
                  <input type="number" min="1" value={heightM} onChange={(e)=>setHeightM(e.target.value)} />
                </div>
                <div>
                  <label>Alcance horizontal requerido (m) (opcional)</label>
                  <input type="number" min="0" value={outreachM} onChange={(e)=>setOutreachM(e.target.value)} placeholder="Ej: 10" />
                </div>

                <div>
                  <label>Tipo de acceso</label>
                  <select value={accessType} onChange={(e)=>setAccessType(e.target.value)}>
                    <option value="puerta">Puerta</option>
                    <option value="pasillo">Pasillo</option>
                    <option value="porton">Portón</option>
                    <option value="ascensor">Ascensor</option>
                  </select>
                  <div className="help">Selecciona el punto más restrictivo por donde debe pasar el equipo.</div>
                </div>

                <div>
                  <label>Ancho disponible en el acceso (cm) ⭐</label>
                  <input type="number" min="1" value={accessWidthCm} onChange={(e)=>setAccessWidthCm(e.target.value)} placeholder="Ej: 95" />
                </div>

                <div>
                  <label>Altura disponible del acceso (cm){isElevator ? " ⭐" : " (opcional)"}</label>
                  <input type="number" min="1" value={accessHeightCm} onChange={(e)=>setAccessHeightCm(e.target.value)} placeholder="Ej: 200" />
                </div>

                <div>
                  <label>Inclinación del terreno</label>
                  <div className="cols2" style={{gridTemplateColumns:"2fr 1fr"}}>
                    <input type="number" value={slopeValue} onChange={(e)=>setSlopeValue(e.target.value)} placeholder={slopeUnit==="deg"?"Ej: 8":"Ej: 12"} />
                    <select value={slopeUnit} onChange={(e)=>setSlopeUnit(e.target.value)}>
                      <option value="deg">Grados (°)</option>
                      <option value="pct">Porcentaje (%)</option>
                    </select>
                  </div>
                </div>

                {isElevator && (
                  <>
                    <div>
                      <label>Capacidad máxima del ascensor (kg) ⭐</label>
                      <input type="number" min="1" value={elevatorMaxKg} onChange={(e)=>setElevatorMaxKg(e.target.value)} placeholder="Ej: 1000" />
                    </div>
                    <div>
                      <label>Cabina ascensor – ancho interno (cm) ⭐</label>
                      <input type="number" min="1" value={elevatorCabWidthCm} onChange={(e)=>setElevatorCabWidthCm(e.target.value)} placeholder="Ej: 120" />
                    </div>
                    <div>
                      <label>Cabina ascensor – fondo/profundidad (cm) ⭐</label>
                      <input type="number" min="1" value={elevatorCabDepthCm} onChange={(e)=>setElevatorCabDepthCm(e.target.value)} placeholder="Ej: 140" />
                    </div>
                    <div className="notice"><strong>Nota:</strong> En ascensores, el <strong>fondo</strong> suele ser el factor crítico.</div>
                  </>
                )}

                <div>
                  <label>Interior / Exterior</label>
                  <select value={indoor} onChange={(e)=>setIndoor(e.target.value)}>
                    <option value="no">Exterior</option>
                    <option value="yes">Interior</option>
                  </select>
                </div>

                <div>
                  <label>Tipo de terreno</label>
                  <select value={terrain} onChange={(e)=>setTerrain(e.target.value)}>
                    <option value="Plano">Plano</option>
                    <option value="Mixto">Mixto</option>
                    <option value="Irregular">Irregular</option>
                  </select>
                </div>

                <div>
                  <label>Restricción de ruido/emisiones</label>
                  <select value={emissionsRestriction} onChange={(e)=>setEmissionsRestriction(e.target.value)}>
                    <option value="no">No</option>
                    <option value="yes">Sí</option>
                  </select>
                </div>

                <div>
                  <label>¿Requiere acceso negativo?</label>
                  <select value={needsNegativeAccess} onChange={(e)=>setNeedsNegativeAccess(e.target.value)}>
                    <option value="no">No</option>
                    <option value="yes">Sí</option>
                  </select>
                </div>

                <div style={{gridColumn:"1 / -1"}}>
                  <label>Tipo de trabajo</label>
                  <select value={jobType} onChange={(e)=>setJobType(e.target.value)}>
                    <option value="Mantención">Mantención / limpieza</option>
                    <option value="Instalación">Instalación</option>
                    <option value="Construcción">Construcción / montaje</option>
                    <option value="Inspección">Inspección</option>
                  </select>
                </div>

                <div style={{gridColumn:"1 / -1"}}>
                  <label>Notas</label>
                  <textarea value={notes} onChange={(e)=>setNotes(e.target.value)} placeholder="Cables, desnivel, piso delicado, puerta exacta..." />
                </div>
              </div>

              {!step1Ok && (
                <div className="notice err" style={{marginTop:12}}>
                  {isElevator ? "Falta completar: ancho + altura + peso máx + cabina (ancho y fondo)." : "Falta completar: altura y ancho de acceso."}
                </div>
              )}
            </>
          )}

          {step===2 && (
            <>
              <hr/>
              {!top ? <div className="notice">Completa los datos del trabajo para obtener una recomendación.</div> : (
                <>
                  <div className="notice">
                    <div className="row">
                      <div><div style={{fontWeight:800}}>{top.name}</div><div className="small">Puntaje: {Math.round(top.score)}</div></div>
                      <span className="badge primary">Mejor opción</span>
                    </div>

                    <div className="cols2" style={{marginTop:10}}>
                      <div className="kpi"><div className="small">Altura máx</div><div style={{fontWeight:800}}>{fmt(top.maxWorkingHeightM," m")}</div></div>
                      <div className="kpi"><div className="small">Alcance máx</div><div style={{fontWeight:800}}>{fmt(top.maxOutreachM," m")}</div></div>
                      <div className="kpi"><div className="small">Acceso mín</div><div style={{fontWeight:800}}>{fmt(top.minAccessWidthCm," cm")}</div></div>
                      <div className="kpi"><div className="small">Peso</div><div style={{fontWeight:800}}>{fmt(top.weightKg," kg")}</div></div>
                    </div>

                    <div style={{marginTop:10}}>
                      <div style={{fontWeight:800}}>Por qué</div>
                      <ul className="ul">{top.reasons.slice(0,6).map((r,i)=><li key={i}>{r}</li>)}</ul>
                    </div>

                    {top.warnings.length ? (
                      <div style={{marginTop:10}}>
                        <div style={{fontWeight:800}}>Ojo</div>
                        <ul className="ul">{top.warnings.slice(0,6).map((w,i)=><li key={i}>{w}</li>)}</ul>
                      </div>
                    ) : null}
                  </div>

                  {recommendations.length>1 && (
                    <div className="notice" style={{marginTop:12}}>
                      <div style={{fontWeight:800}}>Alternativas</div>
                      <ul className="ul">
                        {recommendations.slice(1).map(m=>(
                          <li key={m.id}>{m.name} — puntaje {Math.round(m.score)} (Acceso mín {m.minAccessWidthCm}cm)</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {step===3 && (
            <>
              <hr/>
              <div className="cols2">
                <div style={{gridColumn:"1 / -1"}} className="notice"><strong>Estos datos son obligatorios</strong> para emitir una cotización formal.</div>

                <div>
                  <label>Nombre empresa ⭐</label>
                  <input value={companyName} onChange={(e)=>setCompanyName(e.target.value)} />
                </div>

                <div>
                  <label>RUT empresa ⭐</label>
                  <input value={formatRut(companyRut)} onChange={(e)=>setCompanyRut(e.target.value)} placeholder="76.123.456-7" />
                  {companyRut && !validateRut(companyRut) ? <div className="help" style={{color:"#b00020"}}>RUT inválido.</div> : <div className="help">Formato sugerido: 12.345.678-9</div>}
                </div>

                <div>
                  <label>Nombre contacto ⭐</label>
                  <input value={contactName} onChange={(e)=>setContactName(e.target.value)} />
                </div>

                <div>
                  <label>Teléfono contacto ⭐</label>
                  <input value={contactPhone} onChange={(e)=>setContactPhone(e.target.value)} placeholder="+56 9 1234 5678" />
                </div>

                <div style={{gridColumn:"1 / -1"}}>
                  <label>Correo electrónico contacto ⭐</label>
                  <input value={contactEmail} onChange={(e)=>setContactEmail(e.target.value)} placeholder="correo@empresa.cl" />
                  {contactEmail && !isValidEmail(contactEmail) ? <div className="help" style={{color:"#b00020"}}>Correo inválido.</div> : null}
                </div>
              </div>

              {!step3Ok && <div className="notice err" style={{marginTop:12}}>Completa empresa, RUT válido y datos de contacto.</div>}
            </>
          )}

          {step===4 && (
            <>
              <hr/>
              <div className="notice">
                <div className="row">
                  <div>
                    <div style={{fontWeight:800}}>Enviar solicitud</div>
                    <div className="small">Esto creará un Lead en Apptivo y notificará al equipo.</div>
                  </div>
                  {top ? <span className="badge primary">{top.name}</span> : null}
                </div>

                <div className="btnbar" style={{marginTop:12}}>
                  <button className="primary" onClick={submitToApptivo} disabled={!top || submitStatus?.kind==="loading"}>
                    Solicitar cotización
                  </button>
                  <button className="secondary" onClick={()=>window.open(whatsappUrl,"_blank")} disabled={!top}>
                    WhatsApp (opcional)
                  </button>
                </div>

                {submitStatus ? (
                  <div className={`notice ${submitStatus.kind==="err" ? "err" : ""}`} style={{marginTop:12}}>
                    {submitStatus.kind==="loading" ? "⏳ " : submitStatus.kind==="ok" ? "✅ " : "⚠️ "}
                    {submitStatus.msg}
                  </div>
                ) : null}

                <div className="notice" style={{marginTop:12}}>
                  <div style={{fontWeight:800}}>Cláusula</div>
                  <div className="small" style={{marginTop:6}}>{legalText}</div>
                </div>
              </div>
            </>
          )}

          <div className="btnbar">
            <button onClick={()=>setStep(s=>Math.max(1,s-1))} disabled={step===1}>Atrás</button>
            <div className="small">
              {step===1 && !step1Ok ? (isElevator ? "Ascensor: completa alto + peso + cabina." : "Completa altura y ancho.") : null}
              {step===3 && !step3Ok ? "Completa datos para cotización." : null}
            </div>
            <button className="primary" onClick={()=>setStep(s=>Math.min(4,s+1))} disabled={!canGoNext}>Siguiente</button>
          </div>
        </div>

        <div className="card">
          <div className="row">
            <div><div style={{fontWeight:800}}>Estado</div><div className="small">Checklist de avance</div></div>
            <span className="badge">Apptivo-ready</span>
          </div>
          <hr/>
          <div className="row"><span>Datos trabajo</span><span className={`badge ${step1Ok?"ok":""}`}>{step1Ok?"OK":"Pendiente"}</span></div>
          <div className="row"><span>Recomendación</span><span className={`badge ${step2Ok?"ok":""}`}>{step2Ok?"OK":"Pendiente"}</span></div>
          <div className="row"><span>Datos cotización</span><span className={`badge ${step3Ok?"ok":""}`}>{step3Ok?"OK":"Pendiente"}</span></div>

          <hr/>
          <div style={{fontWeight:800}}>Resumen rápido</div>
          <div className="small" style={{marginTop:8,lineHeight:1.6}}>
            <div>Altura: <strong>{fmt(heightM," m")}</strong></div>
            <div>Acceso: <strong>{fmt(accessWidthCm," cm")}</strong></div>
            <div>Altura acceso: <strong>{fmt(accessHeightCm," cm")}</strong></div>
            <div>Ascensor (kg): <strong>{fmt(elevatorMaxKg," kg")}</strong></div>
            <div>Cabina ancho: <strong>{fmt(elevatorCabWidthCm," cm")}</strong></div>
            <div>Cabina fondo: <strong>{fmt(elevatorCabDepthCm," cm")}</strong></div>
            <div>Interior: <strong>{indoor==="yes"?"Sí":"No"}</strong></div>
            <div>Inclinación: <strong>{jobParams.slopeDeg!=null ? `${jobParams.slopeDeg.toFixed(1)}°` : "—"}</strong></div>
          </div>

          <hr/>
          <div style={{fontWeight:800}}>Top sugerido</div>
          {top ? (
            <div className="small" style={{marginTop:8,lineHeight:1.6}}>
              <div><strong>{top.name}</strong></div>
              <div>Altura {top.maxWorkingHeightM}m · Alcance {top.maxOutreachM}m</div>
              <div>Acceso mín {top.minAccessWidthCm}cm · Altura plegada {Math.round(top.stowedHeightM*100)}cm</div>
              <div>Peso {top.weightKg}kg</div>
            </div>
          ) : <div className="small" style={{marginTop:8}}>Completa los datos del trabajo.</div>}
        </div>
      </div>
    </div>
  );
}
