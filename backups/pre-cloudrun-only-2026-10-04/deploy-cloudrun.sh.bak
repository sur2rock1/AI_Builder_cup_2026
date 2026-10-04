#!/usr/bin/env bash
# Deploy Ananta: Cloud Run first (API + Gemini Live WebSocket proxy), then Firebase Hosting (static UI).
#   export PROJECT_ID=<your-project-id> BUCKET=<your-storage-bucket>
#   npm run deploy:live
set -euo pipefail

: "${PROJECT_ID:?Set PROJECT_ID to your Google Cloud project id}"
: "${BUCKET:?Set BUCKET to the exact Cloud Storage bucket name (Firebase console -> Storage)}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-ananta}"
# DEMO_MODE=true skips Firebase ID-token checks on learner routes (the client does not sign learners in yet).
# Fine for simulated demo learners only: any caller who knows a studentId can read it, and GET /api/learners
# lists every profile. Use DEMO_MODE=false only once real sign-in is wired up.
DEMO_MODE="${DEMO_MODE:-true}"
RUNTIME_SA="ananta-run@${PROJECT_ID}.iam.gserviceaccount.com"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Project=$PROJECT_ID Region=$REGION Service=$SERVICE Bucket=$BUCKET DEMO_MODE=$DEMO_MODE"

# The web bundle must talk to THIS project, not whichever one firebase-config.json was copied from.
CFG_PROJECT="$(node -p "require('./firebase-config.json').projectId")"
if [ "$CFG_PROJECT" != "$PROJECT_ID" ]; then
  echo "firebase-config.json is for project '$CFG_PROJECT', not '$PROJECT_ID'."
  echo "Register a web app in your project and paste its config:"
  echo "  npx firebase-tools apps:create web \"Ananta Web\" --project $PROJECT_ID"
  echo "  npx firebase-tools apps:sdkconfig web <APP_ID> --project $PROJECT_ID"
  exit 1
fi

for S in GEMINI_API_KEY ADMIN_TOKEN; do
  gcloud secrets describe "$S" --project "$PROJECT_ID" >/dev/null 2>&1 || {
    echo "Missing Secret Manager secret $S. See docs/ANANTA_MIGRATION_PLAN.md, Phase 2."; exit 1; }
done
gcloud iam service-accounts describe "$RUNTIME_SA" --project "$PROJECT_ID" >/dev/null 2>&1 || {
  echo "Missing service account $RUNTIME_SA. See docs/ANANTA_MIGRATION_PLAN.md, Phase 2."; exit 1; }

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
  --min-instances=0 \
  --max-instances=3 \
  --memory=1Gi \
  --cpu=1 \
  --no-cpu-throttling \
  --port=8080 \
  --set-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest,ADMIN_TOKEN=ADMIN_TOKEN:latest" \
  --set-env-vars="NODE_ENV=production,GOOGLE_CLOUD_PROJECT=${PROJECT_ID},GOOGLE_CLOUD_LOCATION=${REGION},FIREBASE_STORAGE_BUCKET=${BUCKET},USE_FIRESTORE_LEARNERS=true,GOOGLE_GENAI_USE_ENTERPRISE=false,LIVE_MODEL=gemini-3.8-live,DEMO_MODE=${DEMO_MODE}" \
  --quiet

URL="$(gcloud run services describe "$SERVICE" --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)')"
echo "==> Cloud Run URL: $URL"

echo "==> Building web UI (voice WebSocket -> $URL) & deploying Hosting, rules and indexes..."
VITE_LIVE_WS_BASE="$URL" npm run build:web
npx -y firebase-tools@latest deploy --only hosting,firestore:rules,firestore:indexes,storage --project "$PROJECT_ID" --non-interactive

echo ""
echo "Done."
echo "  UI:        https://${PROJECT_ID}.web.app"
echo "  Cloud Run: $URL"
echo "  Voice WS:  ${URL/https:/wss:}/ws/live  (browser connects directly)"
