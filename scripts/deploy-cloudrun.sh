#!/usr/bin/env bash
# Deploy Ananta to Cloud Run (API + Gemini Live WebSocket proxy + the built web UI, all from one service).
#   export PROJECT_ID=<your-project-id> REGION=<same region as your Firestore database> BUCKET=<your GCS bucket>
#   npm run deploy:live
# Optional: WITH_HOSTING=yes also puts Firebase Hosting in front (static CDN). Not needed: the Node server
# already serves the web build, and Hosting adds a 60-second request limit on /api calls.
set -euo pipefail

: "${PROJECT_ID:?Set PROJECT_ID to your Google Cloud project id}"
: "${REGION:?Set REGION (e.g. asia-southeast1 or us-central1) — it must match the region you created Firestore in}"
: "${BUCKET:?Set BUCKET to the Cloud Storage bucket name that holds pregenerated photos}"
SERVICE="${SERVICE:-ananta}"
WITH_HOSTING="${WITH_HOSTING:-no}"
# DEMO_MODE=true skips Firebase ID-token checks on learner routes (the client does not sign learners in yet).
# Fine for simulated demo learners only: any caller who knows a studentId can read it, and GET /api/learners
# lists every profile. Use DEMO_MODE=false only once real sign-in is wired up.
DEMO_MODE="${DEMO_MODE:-true}"
# One instance by default: live-lesson state (sessions, the per-learner write lock, the curricula cache) is in memory,
# so a second instance would split a lesson. MIN_INSTANCES=1 keeps it warm for judging (billed while idle).
MIN_INSTANCES="${MIN_INSTANCES:-0}"
MAX_INSTANCES="${MAX_INSTANCES:-1}"
RUNTIME_SA="ananta-run@${PROJECT_ID}.iam.gserviceaccount.com"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Project=$PROJECT_ID Region=$REGION Service=$SERVICE Bucket=$BUCKET DEMO_MODE=$DEMO_MODE Hosting=$WITH_HOSTING"

# The web bundle is built from firebase-config.json: it must belong to THIS project.
CFG_PROJECT="$(node -p "require('./firebase-config.json').projectId")"
if [ "$CFG_PROJECT" != "$PROJECT_ID" ]; then
  echo "firebase-config.json is for project '$CFG_PROJECT', not '$PROJECT_ID'."
  echo "Register a web app in your project and paste its config:"
  echo "  npx firebase-tools apps:create web \"Ananta Web\" --project $PROJECT_ID"
  echo "  npx firebase-tools apps:sdkconfig web <APP_ID> --project $PROJECT_ID"
  exit 1
fi

gcloud storage buckets describe "gs://$BUCKET" --project "$PROJECT_ID" >/dev/null 2>&1 || {
  echo "Bucket gs://$BUCKET not found in $PROJECT_ID. See docs/ANANTA_CLOUD_RUN_PLAN.md, Phase B."; exit 1; }
for S in GEMINI_API_KEY ADMIN_TOKEN; do
  gcloud secrets describe "$S" --project "$PROJECT_ID" >/dev/null 2>&1 || {
    echo "Missing Secret Manager secret $S. See docs/ANANTA_CLOUD_RUN_PLAN.md, Phase C."; exit 1; }
done
gcloud iam service-accounts describe "$RUNTIME_SA" --project "$PROJECT_ID" >/dev/null 2>&1 || {
  echo "Missing service account $RUNTIME_SA. See docs/ANANTA_CLOUD_RUN_PLAN.md, Phase C."; exit 1; }

echo "==> Building & deploying Cloud Run service (a few minutes)..."
gcloud run deploy "$SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --source "$ROOT" \
  --service-account "$RUNTIME_SA" \
  --allow-unauthenticated \
  --session-affinity \
  --timeout=3600 \
  --concurrency=80 \
  --min-instances="${MIN_INSTANCES:-0}" \
  --max-instances="${MAX_INSTANCES:-1}" \
  --memory=1Gi \
  --cpu=1 \
  --no-cpu-throttling \
  --port=8080 \
  --set-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest,ADMIN_TOKEN=ADMIN_TOKEN:latest" \
  --set-env-vars="NODE_ENV=production,GOOGLE_CLOUD_PROJECT=${PROJECT_ID},GOOGLE_CLOUD_LOCATION=${REGION},FIREBASE_STORAGE_BUCKET=${BUCKET},USE_FIRESTORE_LEARNERS=true,GOOGLE_GENAI_USE_ENTERPRISE=false,LIVE_MODEL=gemini-3.8-live,DEMO_MODE=${DEMO_MODE}" \
  --quiet

URL="$(gcloud run services describe "$SERVICE" --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)')"
echo "==> Cloud Run URL: $URL"

echo "==> Deploying Firestore security rules and indexes..."
npx -y firebase-tools@latest deploy --only firestore:rules,firestore:indexes --project "$PROJECT_ID" --non-interactive

if [ "$WITH_HOSTING" = "yes" ]; then
  echo "==> Building web UI (voice WebSocket -> $URL) & deploying Firebase Hosting..."
  VITE_LIVE_WS_BASE="$URL" npm run build:web
  npx -y firebase-tools@latest deploy --only hosting --project "$PROJECT_ID" --non-interactive
fi

echo "==> Health check"
curl -fsS "$URL/api/health" && echo || echo "(health check failed — read the Cloud Run logs)"

echo ""
echo "Done."
echo "  App:      $URL"
echo "  Voice WS: ${URL/https:/wss:}/ws/live  (same address as the page)"
