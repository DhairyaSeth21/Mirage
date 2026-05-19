# Mirage — Landing Page

Pre-launch teaser site for Mirage.

## Setup

```bash
cd website
npx create-react-app . --template minimal
# OR drop these files into an existing React/Vite/Next app

npm install three framer-motion react-router-dom
npm start
```

## Dependencies

- `react`, `react-dom` — framework
- `three` — 3D obsidian sphere
- `framer-motion` — hero animations
- `react-router-dom` — routing
- `tailwindcss` — utility CSS

## Deploy

Works on Vercel, Netlify, or any static host. Just `npm run build` and deploy the `build/` folder.
