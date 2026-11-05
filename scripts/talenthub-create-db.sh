#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Provision the Talent Hub Firestore database for PRODUCTION.
# Not run by the app. Dry run by default: prints every command first.
#
#   ./scripts/talenthub-create-db.sh            # dry run
#   ./scripts/talenthub-create-db.sh --apply    # enable APIs, create DB, deploy rules + indexes
#
# Override with env vars, e.g. LOCATION=me-central1 ./scripts/talenthub-create-db.sh --apply
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-csrm-nova-dev}"
DATABASE_ID="${DATABASE_ID:-talenthub}"
# Candidate data is personal data: pick the region your privacy review approves
# (other databases in this project live in us-west1; me-central1 = Doha).
LOCATION="${LOCATION:-us-west1}"
EDITION="${EDITION:-standard}"

export CLOUDSDK_METRICS_ENVIRONMENT="${CLOUDSDK_METRICS_ENVIRONMENT:+$CLOUDSDK_METRICS_ENVIRONMENT }datacloud.antigravity"
cd "$(dirname "$0")/.."

APPLY=false
[[ "${1:-}" == "--apply" ]] && APPLY=true
run() {
  printf '+ %s\n' "$*"
  if $APPLY; then "$@"; fi
}

echo "Talent Hub · project=$PROJECT_ID database=$DATABASE_ID location=$LOCATION edition=$EDITION"
$APPLY || echo "(dry run: nothing is changed. Re-run with --apply.)"
echo

echo "1/3 · Enable APIs (idempotent)"
run gcloud services enable \
  firestore.googleapis.com \
  firebase.googleapis.com \
  identitytoolkit.googleapis.com \
  firebasevertexai.googleapis.com \
  generativelanguage.googleapis.com \
  --project "$PROJECT_ID"
echo

echo "2/3 · Create the Firestore database (skipped if it already exists)"
if gcloud firestore databases describe --database="$DATABASE_ID" --project "$PROJECT_ID" >/dev/null 2>&1; then
  echo "Database '$DATABASE_ID' already exists. Skipping creation."
else
  run gcloud firestore databases create \
    --database="$DATABASE_ID" \
    --location="$LOCATION" \
    --type=firestore-native \
    --edition="$EDITION" \
    --delete-protection \
    --enable-pitr \
    --project "$PROJECT_ID"
fi
echo

echo "3/3 · Deploy security rules + indexes (firebase.json → database '$DATABASE_ID')"
run npx --yes firebase-tools@14 deploy --only firestore --project "$PROJECT_ID"
echo
echo "Next: add yourself to the allowlist →  ./scripts/talenthub-add-member.sh maboud@google.com u-layla '*'"
