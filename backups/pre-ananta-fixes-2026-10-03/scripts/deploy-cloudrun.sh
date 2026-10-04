#!/usr/bin/env bash
# Deploy the Live voice + API server to Cloud Run, then point Hosting at it.
set -euo pipefail

PROJECT="${GOOGLE_CLOUD_PROJECT:-sceneflow-f9529}"
REGION="${CLOUD_RUN_REGION:-us-central1}"
SERVICE="${CLOUD_RUN_SERVICE:-dr-marcus-live}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Project=$PROJECT Region=$REGION Service=$SERVICE"

gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  --project "$PROJECT" >/dev/null

if ! gcloud secrets describe GEMINI_API_KEY --project "$PROJECT" >/dev/null 2>&1; then
  echo "Missing secret GEMINI_API_KEY. Create it with:"
  echo "  npx -y firebase-tools@latest functions:secrets:set GEMINI_API_KEY --project $PROJECT"
  exit 1
fi

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --project "$PROJECT" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/secretmanager.secretAccessor" \
  --quiet >/dev/null || true

echo "==> Building & deploying Cloud Run service (this may take a few minutes)..."
gcloud run deploy "$SERVICE" \
  --project "$PROJECT" \
  --region "$REGION" \
  --source "$ROOT" \
  --allow-unauthenticated \
  --session-affinity \
  --timeout=3600 \
  --concurrency=80 \
  --min-instances=0 \
  --max-instances=10 \
  --memory=1Gi \
  --cpu=1 \
  --no-cpu-throttling \
  --port=8080 \
  --set-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest" \
  --set-env-vars="NODE_ENV=production,GOOGLE_CLOUD_PROJECT=${PROJECT},GOOGLE_CLOUD_LOCATION=${REGION},LIVE_MODEL=gemini-3.8-live,GOOGLE_GENAI_USE_ENTERPRISE=false,FIREBASE_STORAGE_BUCKET=${PROJECT}.firebasestorage.app,USE_FIRESTORE_LEARNERS=true" \
  --quiet

URL="$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format='value(status.url)')"
echo "==> Cloud Run URL: $URL"

echo "==> Building web UI & deploying Hosting rewrites..."
npm run build:web
npx -y firebase-tools@latest deploy --only hosting --project "$PROJECT" --non-interactive

echo ""
echo "Done."
echo "  Hosting:  https://${PROJECT}.web.app"
echo "  Cloud Run: $URL"
echo "  Voice WS:  wss://${PROJECT}.web.app/ws/live  (via Hosting → Cloud Run)"
