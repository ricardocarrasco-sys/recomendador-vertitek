# Recomendador Spider – VertiTek (v2) – Apptivo Leads

## Qué cambia en v2
- Fotos eliminadas en esta etapa (se piden luego si aplica).
- Botón principal: **Solicitar cotización** → crea Lead en Apptivo.
- WhatsApp queda como respaldo opcional.

## Variables de entorno (Vercel → Settings → Environment Variables)
Crear estas 2 variables (Production):
- `APPTIVO_API_KEY`
- `APPTIVO_ACCESS_KEY`

Luego Redeploy.

## Backend
- `/api/apptivo-lead` crea un Lead en Apptivo con la información en la descripción.

