#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://tff-fantezi.ecetin1998.workers.dev}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

fail(){
  echo "SMOKE FAIL: $*" >&2
  exit 1
}

status_code(){
  local url="$1"
  curl -sS -o /dev/null -w '%{http_code}' "$url"
}

echo "Smoke target: $BASE_URL"

PUBLIC_ROUTES=(
  "/"
  "/players"
  "/points"
  "/matches"
  "/teams"
  "/squads"
  "/availability"
  "/roles"
  "/backtest"
  "/pricing"
  "/sss"
)

for path in "${PUBLIC_ROUTES[@]}"; do
  code="$(status_code "$BASE_URL$path")"
  [[ "$code" == "200" ]] || fail "$path returned HTTP $code"
  echo "PASS route $path"
done

SECTIONS=(all summary players matches squads availability roles weekly performance)
declare -a HASHES=()

for section in "${SECTIONS[@]}"; do
  body="$TMP_DIR/$section.json"
  code="$(curl -sS -o "$body" -w '%{http_code}' "$BASE_URL/api/scout-data?section=$section")"
  [[ "$code" == "200" ]] || fail "section=$section returned HTTP $code"

  node - "$body" "$section" <<'NODE'
const fs=require('node:fs')
const [,,file,section]=process.argv
const raw=fs.readFileSync(file,'utf8')
let body
try{ body=JSON.parse(raw) }catch{ console.error('invalid JSON for '+section); process.exit(1) }

const expected={
  all:['players','matches','squads','availability_issues'],
  summary:['top_players','matches','squads','availability_issues'],
  players:['players'],
  matches:['matches'],
  squads:['recommended','alternative'],
  availability:['rows'],
  roles:['rows'],
  weekly:['players'],
  performance:['replay_weeks','learning']
}
if(body.schema_version!=='2.0'){
  console.error(section+': missing/wrong top-level schema_version')
  process.exit(1)
}
if(body.meta?.schema_version!=='2.0'){
  console.error(section+': missing/wrong meta.schema_version')
  process.exit(1)
}
if(!Array.isArray(body.meta?.sections)||!body.meta.sections.includes('summary')){
  console.error(section+': meta.sections does not advertise summary')
  process.exit(1)
}
if(body.section!==section){
  console.error(section+': response section mismatch: '+body.section)
  process.exit(1)
}
for(const key of expected[section]||[]){
  if(!(key in body)){
    console.error(section+': missing key '+key)
    process.exit(1)
  }
}
if(/"notes"\s*:|"model_version"\s*:|detail_source_/i.test(raw)){
  console.error(section+': internal/provenance field leaked')
  process.exit(1)
}
if(section==='summary' && Object.prototype.hasOwnProperty.call(body,'players')){
  console.error('summary: players key must not be present')
  process.exit(1)
}
if(section==='players' && Object.prototype.hasOwnProperty.call(body,'matches')){
  console.error('players: matches key must not be present')
  process.exit(1)
}
NODE

  HASHES+=("$(shasum -a 256 "$body" | awk '{print $1}')")
  echo "PASS API section=$section"
done

unique_hashes="$(printf '%s\n' "${HASHES[@]}" | sort -u | wc -l | tr -d ' ')"
[[ "$unique_hashes" == "${#SECTIONS[@]}" ]] || fail "different sections returned duplicate payloads ($unique_hashes/${#SECTIONS[@]} unique)"

summary_size="$(wc -c < "$TMP_DIR/summary.json" | tr -d ' ')"
(( summary_size < 51200 )) || fail "summary payload is ${summary_size} bytes (must be < 51200)"
echo "PASS summary size ${summary_size} bytes"

not_found="$(status_code "$BASE_URL/players/99999")"
[[ "$not_found" == "404" ]] || fail "/players/99999 returned HTTP $not_found instead of 404"
echo "PASS real 404"

redirect_headers="$TMP_DIR/redirect.headers"
redirect_code="$(curl -sS -D "$redirect_headers" -o /dev/null -w '%{http_code}' "$BASE_URL/api/scout-data?utm_source=x")"
[[ "$redirect_code" == "308" ]] || fail "unknown query param returned HTTP $redirect_code instead of 308"
echo "PASS canonical 308"

if [[ "${SKIP_CDN_CHECK:-0}" == "1" ]]; then
  echo "SKIP CDN cache header check (SKIP_CDN_CHECK=1)"
else
  curl -sS -D "$TMP_DIR/cache.headers" -o /dev/null "$BASE_URL/api/scout-data?section=summary"
  grep -Eiq '^cache-control:.*s-maxage=300' "$TMP_DIR/cache.headers" || {
    cat "$TMP_DIR/cache.headers" >&2
    fail "summary response is missing shared-cache policy"
  }
  echo "PASS CDN cache policy"
fi

echo "SMOKE PASS"
