<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/e4c5c0b9-f2e3-4bc2-9d82-d7b1e2c73301

# Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Production (Firebase + Cloud Run)

- **Hosting UI:** https://sceneflow-f9529.web.app  
- **API:** Hosting rewrites `/api/**` → Cloud Run `dr-marcus-live`  
- **Live voice WebSocket:** browser connects to Cloud Run  
  `wss://dr-marcus-live-45388528859.us-central1.run.app/ws/live`  
  (Hosting does not reliably upgrade WebSockets, so the client bypasses it for `/ws`)

Deploy / update Live voice stack:

```bash
npm run deploy:live
```

Local voice still works with:

```bash
PORT=3001 npm run dev
```
