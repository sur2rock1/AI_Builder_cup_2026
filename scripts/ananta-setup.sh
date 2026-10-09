#!/usr/bin/env bash
# Ananta one-time cloud setup. Safe to re-run: every step checks first.
# Run in Google Cloud Shell AFTER:  source ~/ananta.env
# UNTESTED against real GCP at time of writing - read the output of every step.
set -uo pipefail
: "${PROJECT_ID:?run: source ~/ananta.env}" "${REGION:?}" "${BUCKET:?}"
SA="ananta-run@${PROJECT_ID}.iam.gserviceaccount.com"
ok(){ echo "  OK   $*"; }; step(){ echo; echo "== $*"; }; die(){ echo "  STOP $*"; exit 1; }

step "1 Project"
if gcloud projects describe "$PROJECT_ID" >/dev/null 2>&1; then ok "project exists"
else gcloud projects create "$PROJECT_ID" --name="Ananta" || die "could not create project (id taken? pick another)"; fi
gcloud config set project "$PROJECT_ID" >/dev/null

step "2 Billing"
if [ "$(gcloud billing projects describe "$PROJECT_ID" --format='value(billingEnabled)' 2>/dev/null)" = "True" ]; then ok "billing linked"
else
  : "${BILLING_ACCOUNT:?set BILLING_ACCOUNT in ~/ananta.env (see: gcloud billing accounts list)}"
  gcloud billing projects link "$PROJECT_ID" --billing-account="$BILLING_ACCOUNT" || die "billing link failed"
fi

step "3 APIs (takes ~1-2 min)"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com firestore.googleapis.com firebase.googleapis.com storage.googleapis.com \
  || die "enabling APIs failed (billing?)"
ok "APIs enabled"

step "4 Firestore database ($REGION - cannot be changed later)"
if gcloud firestore databases describe --project="$PROJECT_ID" >/dev/null 2>&1; then ok "database exists"
else gcloud firestore databases create --location="$REGION" || die "firestore create failed"; fi

step "5 Photo bucket"
if gcloud storage buckets describe "gs://$BUCKET" >/dev/null 2>&1; then ok "bucket exists"
else gcloud storage buckets create "gs://$BUCKET" --location="$REGION" --uniform-bucket-level-access || die "bucket create failed (name taken?)"; fi

step "6 Service account + permissions"
gcloud iam service-accounts describe "$SA" >/dev/null 2>&1 || gcloud iam service-accounts create ananta-run --display-name="Ananta Cloud Run" || die "SA create failed"
for R in roles/datastore.user roles/secretmanager.secretAccessor; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$SA" --role="$R" --condition=None >/dev/null || die "grant $R failed"
done
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" --member="serviceAccount:$SA" --role=roles/storage.objectAdmin >/dev/null || die "bucket grant failed"
ok "permissions granted"

step "7 Secrets"
if ! gcloud secrets describe GEMINI_API_KEY >/dev/null 2>&1; then
  echo "  Paste your NEW Gemini API key (typing is hidden), then Enter:"; read -rs KEY; echo
  [ -n "$KEY" ] || die "empty key"; printf '%s' "$KEY" | gcloud secrets create GEMINI_API_KEY --data-file=- || die "secret failed"
else ok "GEMINI_API_KEY exists"; fi
if ! gcloud secrets describe ADMIN_TOKEN >/dev/null 2>&1; then
  openssl rand -base64 32 | tr -d '\n' | gcloud secrets create ADMIN_TOKEN --data-file=- || die "ADMIN_TOKEN failed"
else ok "ADMIN_TOKEN exists"; fi

step "8 Public read for lesson photos (whole bucket: it holds only lesson photos)"
# Google refuses conditional public bindings ("Conditions are not allowed on public resources"), so this is bucket-wide.
gcloud storage buckets update "gs://$BUCKET" --no-public-access-prevention >/dev/null 2>&1 || true
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" --member=allUsers --role=roles/storage.objectViewer >/dev/null \
  && ok "public read set" || echo "  WARN public read refused (organisation policy?) - photos will not load publicly"

step "9 Firebase web app config -> firebase-config.json"
if grep -q "\"projectId\": *\"$PROJECT_ID\"" firebase-config.json 2>/dev/null; then ok "firebase-config.json already matches"
else
  npx --yes firebase-tools projects:addfirebase "$PROJECT_ID" >/dev/null 2>&1 || true
  APP_ID=$(npx --yes firebase-tools apps:list WEB --project "$PROJECT_ID" 2>/dev/null | grep -o '1:[0-9]*:web:[0-9a-f]*' | head -1)
  [ -n "$APP_ID" ] || { npx --yes firebase-tools apps:create web "Ananta Web" --project "$PROJECT_ID" >/dev/null 2>&1
    APP_ID=$(npx --yes firebase-tools apps:list WEB --project "$PROJECT_ID" 2>/dev/null | grep -o '1:[0-9]*:web:[0-9a-f]*' | head -1); }
  if [ -n "$APP_ID" ]; then
    npx --yes firebase-tools apps:sdkconfig WEB "$APP_ID" --project "$PROJECT_ID" 2>/dev/null > /tmp/sdk.txt
    python3 - <<'PY' && ok "firebase-config.json written" || echo "  MANUAL: could not auto-write firebase-config.json - see guide, Step 9 fallback"
import re,json,os,sys
t=open('/tmp/sdk.txt').read(); m=re.search(r'\{.*\}',t,re.S)
if not m: sys.exit(1)
s=m.group(0)
try: d=json.loads(s)
except Exception:
    s=re.sub(r'(\w+):',r'"\1":',s).replace("'",'"'); d=json.loads(s)
if d.get('projectId')!=os.environ['PROJECT_ID']: sys.exit(1)
json.dump(d,open('firebase-config.json','w'),indent=2)
PY
  else echo "  MANUAL: no web app id found - see guide, Step 9 fallback"; fi
fi
sed -i "s/REPLACE_WITH_YOUR_PROJECT_ID/$PROJECT_ID/" .firebaserc 2>/dev/null && ok ".firebaserc set"
echo; echo "Setup finished. Now run:  bash scripts/ananta-doctor.sh setup"
