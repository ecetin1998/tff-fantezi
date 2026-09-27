#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3100}"
BASE_URL="http://127.0.0.1:${PORT}"
LOG_FILE="$(mktemp)"
KEY="${SCOUT_DATA_API_KEY:-runtime-test-key-12345678901234567890}"

cleanup(){
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -f "$LOG_FILE"
}
trap cleanup EXIT

SCOUT_OFFLINE_BUILD=1 SCOUT_DATA_API_KEY="$KEY" npm start -- -p "$PORT" >"$LOG_FILE" 2>&1 &
SERVER_PID=$!

for _ in {1..40}; do
  if curl -fsS "$BASE_URL/api/scout-data?section=summary" >/dev/null 2>&1; then break; fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    cat "$LOG_FILE" >&2
    exit 1
  fi
  sleep 0.5
done

curl -fsS "$BASE_URL/api/scout-data?section=summary" >/dev/null || {
  cat "$LOG_FILE" >&2
  echo "runtime route server did not become ready" >&2
  exit 1
}

SECTIONS=(all summary players matches squads availability roles weekly performance)
for section in "${SECTIONS[@]}"; do
  headers="$(mktemp)"
  body="$(mktemp)"
  code="$(curl -sS -D "$headers" -o "$body" -w '%{http_code}' "$BASE_URL/api/scout-data?section=$section")"
  [[ "$code" == "200" ]] || { cat "$body" >&2; echo "section=$section HTTP $code" >&2; exit 1; }
  node - "$body" "$section" <<'NODE'
const fs=require('node:fs')
const [,,file,section]=process.argv
const body=JSON.parse(fs.readFileSync(file,'utf8'))
if(body.schema_version!=='2.0') throw new Error(section+': bad schema_version')
if(body.meta?.schema_version!=='2.0') throw new Error(section+': bad meta.schema_version')
if(!Array.isArray(body.meta?.sections)||!body.meta.sections.includes('summary')) throw new Error(section+': missing meta.sections')
if(body.section!==section) throw new Error(section+': response section mismatch')
NODE
  rm -f "$headers" "$body"
done

unknown_body="$(mktemp)"
unknown_code="$(curl -sS -o "$unknown_body" -w '%{http_code}' "$BASE_URL/api/scout-data?section=does-not-exist")"
[[ "$unknown_code" == "400" ]] || { cat "$unknown_body" >&2; echo "unknown section HTTP $unknown_code" >&2; exit 1; }
node - "$unknown_body" <<'NODE'
const fs=require('node:fs')
const body=JSON.parse(fs.readFileSync(process.argv[2],'utf8'))
if(body.schema_version!=='2.0') throw new Error('unknown section fallback missing schema_version')
NODE
rm -f "$unknown_body"

key_headers="$(mktemp)"
key_body="$(mktemp)"
key_code="$(curl -sS -D "$key_headers" -o "$key_body" -w '%{http_code}' -H "x-api-key: $KEY" "$BASE_URL/api/scout-data?section=performance")"
[[ "$key_code" == "200" ]] || { cat "$key_body" >&2; echo "keyed performance HTTP $key_code" >&2; exit 1; }
node - "$key_body" <<'NODE'
const fs=require('node:fs')
const body=JSON.parse(fs.readFileSync(process.argv[2],'utf8'))
if(body.schema_version!=='2.0') throw new Error('keyed performance missing schema_version')
if(!('full' in body)) throw new Error('keyed performance did not return full payload')
NODE
grep -Eiq '^cache-control:[[:space:]]*private, no-store' "$key_headers" || { cat "$key_headers" >&2; exit 1; }
grep -Eiq '^vary:[[:space:]]*x-api-key' "$key_headers" || { cat "$key_headers" >&2; exit 1; }
rm -f "$key_headers" "$key_body"

public_body="$(mktemp)"
curl -fsS "$BASE_URL/api/scout-data?section=performance" >"$public_body"
node - "$public_body" <<'NODE'
const fs=require('node:fs')
const body=JSON.parse(fs.readFileSync(process.argv[2],'utf8'))
if('full' in body) throw new Error('public performance leaked full payload after keyed request')
NODE
rm -f "$public_body"

filtered_body="$(mktemp)"
filtered_code="$(curl -sS -o "$filtered_body" -w '%{http_code}' "$BASE_URL/api/scout-data?section=players&position=DEF&limit=2&fields=id,name")"
[[ "$filtered_code" == "200" ]] || { cat "$filtered_body" >&2; exit 1; }
node - "$filtered_body" <<'NODE'
const fs=require('node:fs')
const body=JSON.parse(fs.readFileSync(process.argv[2],'utf8'))
if(!body.served_at)throw new Error('served_at missing')
if((body.players||[]).length>2)throw new Error('limit filter failed')
for(const row of body.players||[])for(const key of Object.keys(row))if(!['id','name'].includes(key))throw new Error('fields filter failed: '+key)
NODE
rm -f "$filtered_body"

echo "ROUTE RUNTIME PASS"
