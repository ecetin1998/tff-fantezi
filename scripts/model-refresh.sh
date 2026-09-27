#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_FUNCTIONS_URL:?SUPABASE_FUNCTIONS_URL is required}"
: "${OIDC_TOKEN:?OIDC_TOKEN is required}"

call_json(){
  local path="$1"
  local body="$2"
  curl -fsS -X POST "${SUPABASE_FUNCTIONS_URL}/${path}"     -H "Authorization: Bearer ${OIDC_TOKEN}"     -H "Content-Type: application/json"     --data "$body"
}

stage="${1:?stage is required}"
case "$stage" in
  ingest)
    call_json model-refresh-control '{"stage":"ingest"}'
    ;;
  candidate)
    call_json model-refresh-control '{"stage":"candidate"}'
    ;;
  optimizer-recommended)
    : "${RUN_ID:?RUN_ID is required}"
    curl -fsS "${SUPABASE_FUNCTIONS_URL}/run-staging-optimizer?mode=recommended&run=${RUN_ID}"       -H "Authorization: Bearer ${OIDC_TOKEN}"
    ;;
  optimizer-alternative)
    : "${RUN_ID:?RUN_ID is required}"
    curl -fsS "${SUPABASE_FUNCTIONS_URL}/run-staging-optimizer?mode=alternative&run=${RUN_ID}"       -H "Authorization: Bearer ${OIDC_TOKEN}"
    ;;
  qa)
    : "${RUN_ID:?RUN_ID is required}"
    node -e 'process.stdout.write(JSON.stringify({stage:"qa",run_id:process.env.RUN_ID}))'       | curl -fsS -X POST "${SUPABASE_FUNCTIONS_URL}/model-refresh-control"           -H "Authorization: Bearer ${OIDC_TOKEN}"           -H "Content-Type: application/json"           --data-binary @-
    ;;
  integrity)
    : "${RUN_ID:?RUN_ID is required}"
    node -e 'process.stdout.write(JSON.stringify({stage:"integrity",run_id:process.env.RUN_ID}))'       | curl -fsS -X POST "${SUPABASE_FUNCTIONS_URL}/model-refresh-control"           -H "Authorization: Bearer ${OIDC_TOKEN}"           -H "Content-Type: application/json"           --data-binary @-
    ;;
  replay)
    : "${GAMEWEEK:?GAMEWEEK is required}"
    replay_gw=$(( GAMEWEEK > 1 ? GAMEWEEK - 1 : 1 ))
    curl -fsS "${SUPABASE_FUNCTIONS_URL}/run-replay-distribution-test?gw=${replay_gw}&draws=50000&target=scheduled-refresh-${GITHUB_SHA:0:12}"       -H "Authorization: Bearer ${OIDC_TOKEN}"
    ;;
  replay-gate)
    : "${RUN_ID:?RUN_ID is required}"
    : "${REPLAY_FILE:?REPLAY_FILE is required}"
    node -e '
      const fs=require("fs");
      const details=JSON.parse(fs.readFileSync(process.env.REPLAY_FILE,"utf8"));
      process.stdout.write(JSON.stringify({stage:"replay",run_id:process.env.RUN_ID,pass:true,details}));
    ' | curl -fsS -X POST "${SUPABASE_FUNCTIONS_URL}/model-refresh-control"           -H "Authorization: Bearer ${OIDC_TOKEN}"           -H "Content-Type: application/json"           --data-binary @-
    ;;
  promote)
    : "${RUN_ID:?RUN_ID is required}"
    node -e 'process.stdout.write(JSON.stringify({stage:"promote",run_id:process.env.RUN_ID}))'       | curl -fsS -X POST "${SUPABASE_FUNCTIONS_URL}/model-refresh-control"           -H "Authorization: Bearer ${OIDC_TOKEN}"           -H "Content-Type: application/json"           --data-binary @-
    ;;
  *)
    echo "unknown stage: $stage" >&2
    exit 2
    ;;
esac
