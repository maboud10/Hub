#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Add or update a Talent Hub allowlist entry: talenthub/members/{email}
# (Google accounts not listed here cannot read or write anything.)
#
#   ./scripts/talenthub-add-member.sh <email> <nexusUserId> [permission ...]
#
# Examples (permissions are the member's EFFECTIVE NEXUS permissions):
#   admin            ./scripts/talenthub-add-member.sh maboud@google.com u-layla '*'
#   recruiter        ./scripts/talenthub-add-member.sh sara@company.com u-sara app:recruit app:hr \
#                      talent.manage talent.source talent.comp.view talent.offers.approve hr.onboarding.manage
#   hiring manager   ./scripts/talenthub-add-member.sh omar@company.com u-omar app:recruit app:hr talent.hire
#   employee/buddy   ./scripts/talenthub-add-member.sh mei@company.com u-mei app:hr
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-csrm-nova-dev}"
DATABASE_ID="${DATABASE_ID:-talenthub}"
export CLOUDSDK_METRICS_ENVIRONMENT="${CLOUDSDK_METRICS_ENVIRONMENT:+$CLOUDSDK_METRICS_ENVIRONMENT }datacloud.antigravity"

EMAIL="$(printf '%s' "${1:?usage: $0 <email> <nexusUserId> [permission ...]}" | tr '[:upper:]' '[:lower:]')"
HUB_USER_ID="${2:?NEXUS user id required, e.g. u-layla}"
shift 2
PERMS=("$@")
[[ ${#PERMS[@]} -eq 0 ]] && PERMS=("app:hr")

values=""
for p in "${PERMS[@]}"; do values+="{\"stringValue\":\"$p\"},"; done
values="[${values%,}]"
now_ms="$(($(date +%s) * 1000))"

echo "members/$EMAIL → hubUserId=$HUB_USER_ID perms=${PERMS[*]}"
curl -sS --fail-with-body -X PATCH \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "x-goog-user-project: $PROJECT_ID" \
  -H "Content-Type: application/json" \
  "https://firestore.googleapis.com/v1/projects/$PROJECT_ID/databases/$DATABASE_ID/documents/members/${EMAIL//@/%40}" \
  -d "{\"fields\":{
        \"email\":{\"stringValue\":\"$EMAIL\"},
        \"hubUserId\":{\"stringValue\":\"$HUB_USER_ID\"},
        \"active\":{\"booleanValue\":true},
        \"perms\":{\"arrayValue\":{\"values\":$values}},
        \"updatedAt\":{\"integerValue\":\"$now_ms\"}
      }}" >/dev/null
echo "Done."
