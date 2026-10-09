#!/usr/bin/env bash
# Read-only checker. Changes nothing. Usage: bash scripts/ananta-doctor.sh <setup|data|deployed>
# UNTESTED against real GCP at time of writing.
set -uo pipefail
STAGE="${1:-setup}"; : "${PROJECT_ID:?run: source ~/ananta.env}" "${REGION:?}" "${BUCKET:?}"
SA="ananta-run@${PROJECT_ID}.iam.gserviceaccount.com"; FAIL=0
chk(){ if eval "$2" >/dev/null 2>&1; then echo "  PASS  $1"; else echo "  FAIL  $1  ->  $3"; FAIL=1; fi; }
echo "Ananta doctor: stage=$STAGE project=$PROJECT_ID region=$REGION"
if [ "$STAGE" = setup ] || [ "$STAGE" = data ] || [ "$STAGE" = deployed ]; then
chk "project exists" "gcloud projects describe $PROJECT_ID" "run scripts/ananta-setup.sh"
chk "billing linked" "[ \"\$(gcloud billing projects describe $PROJECT_ID --format='value(billingEnabled)')\" = True ]" "setup step 2"
for A in run cloudbuild artifactregistry secretmanager firestore firebase storage; do
 chk "API $A enabled" "gcloud services list --enabled --project=$PROJECT_ID --filter=name:$A.googleapis.com --format='value(name)' | grep -q ." "setup step 3"; done
chk "Firestore exists in $REGION" "gcloud firestore databases describe --project=$PROJECT_ID --format='value(locationId)' | grep -qx $REGION" "wrong region? see guide 'wrong region'"
chk "bucket exists in $REGION" "gcloud storage buckets describe gs://$BUCKET --format='value(location)' | grep -qi ^$REGION\$" "setup step 5"
chk "service account exists" "gcloud iam service-accounts describe $SA" "setup step 6"
chk "SA can use Firestore" "gcloud projects get-iam-policy $PROJECT_ID --flatten=bindings --filter='bindings.role=roles/datastore.user AND bindings.members:$SA' --format='value(bindings.role)' | grep -q ." "setup step 6"
chk "SA can read secrets" "gcloud projects get-iam-policy $PROJECT_ID --flatten=bindings --filter='bindings.role=roles/secretmanager.secretAccessor AND bindings.members:$SA' --format='value(bindings.role)' | grep -q ." "setup step 6"
chk "secret GEMINI_API_KEY" "gcloud secrets versions list GEMINI_API_KEY --limit=1 --format='value(name)' | grep -q ." "setup step 7"
chk "secret ADMIN_TOKEN" "gcloud secrets versions list ADMIN_TOKEN --limit=1 --format='value(name)' | grep -q ." "setup step 7"
chk "photos public rule" "gcloud storage buckets get-iam-policy gs://$BUCKET --format=json | grep -q allUsers" "setup step 8"
chk "firebase-config.json matches project" "grep -q \"\\\"projectId\\\": *\\\"$PROJECT_ID\\\"\" firebase-config.json" "setup step 9 / guide fallback"
chk ".firebaserc matches project" "grep -q \"$PROJECT_ID\" .firebaserc" "edit .firebaserc"
chk "no old project id in repo" "! grep -rq sceneflow-f9529 firebase-config.json .firebaserc .env.example scripts/deploy-cloudrun.sh" "an old project id is still referenced"
chk "no .env with old key shipped" "[ ! -f .env ]" "delete .env in Cloud Shell: rm .env (use the Secret Manager key instead)"
fi
if [ "$STAGE" = data ] || [ "$STAGE" = deployed ]; then
chk "local data/ folder uploaded" "[ -f data/curricula.json ]" "your zip must include data/ (see guide Step 3)"
echo "  (data content check = npm run verify:migration - run it and read its last line)"
fi
if [ "$STAGE" = deployed ]; then
URL=$(gcloud run services describe ananta --region "$REGION" --format='value(status.url)' 2>/dev/null); echo "  URL: ${URL:-none}"
chk "service deployed" "[ -n \"$URL\" ]" "run npm run deploy:live"
chk "health OK" "curl -fsS $URL/api/health" "open Cloud Run logs"
chk "learners API returns 200" "[ \"\$(curl -s -o /dev/null -w %{http_code} $URL/api/learners)\" = 200 ]" "DEMO_MODE not applied"
chk "admin blocked without token" "[ \"\$(curl -s -o /dev/null -w %{http_code} $URL/api/admin/courses)\" = 401 ]" "admin route open!"
chk "min-instances is 0 (no idle bill)" "[ \"\$(gcloud run services describe ananta --region $REGION --format='value(spec.template.metadata.annotations.\"autoscaling.knative.dev/minScale\")')\" != 1 ]" "set back to 0 after demo"
fi
echo; [ $FAIL = 0 ] && echo "ALL PASS for stage '$STAGE'" || echo "SOME CHECKS FAILED - fix the FAIL lines, re-run. Do not continue until all pass."
exit $FAIL
