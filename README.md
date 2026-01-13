# Recomendador Spider – VertiTek (Vite + React)

## Requisitos
- Node.js 18+

## Correr local
```bash
npm install
npm run dev
```

## Build
```bash
npm run build
npm run preview
```

## Deploy en Vercel (gratis)
1) Crea cuenta en Vercel y conéctala a GitHub.
2) Sube esta carpeta a un repo GitHub.
3) En Vercel: Add New Project → Import repo → Deploy.
- Framework preset: Vite
- Build command: `npm run build`
- Output dir: `dist`

## Integración en Wix
En Wix agrega una página `/recomendador` y pega un embed HTML:

```html
<iframe
  src="https://TU-PROYECTO.vercel.app"
  style="width:100%; height:100vh; border:none;"
  allow="camera; microphone; clipboard-write"
></iframe>
```

## Notas
- WhatsApp configurado a +56942600557.
- Para adjuntar fotos automáticamente a WhatsApp se requiere backend; en este MVP el cliente las envía manualmente.
