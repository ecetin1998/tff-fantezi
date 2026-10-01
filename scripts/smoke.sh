#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://tff-fantezi.ecetin1998.workers.dev}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

fail(){
  echo "SMOKE FAIL: $*" >&2
  exit 1
}

curl_retry(){
  curl --retry 4 --retry-delay 2 --retry-all-errors --retry-max-time 60 --connect-timeout 10 --max-time 45 "$@"
}

status_code(){
  local url="$1"
  curl_retry -sS -o /dev/null -w '%{http_code}' "$url"
}

echo "Smoke target: $BASE_URL"

if [[ -n "${EXPECTED_SHA:-}" ]]; then
  live_sha="$(curl_retry -fsSL "$BASE_URL/api/health" | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).sha")"
  [[ "$live_sha" == "$EXPECTED_SHA" ]] || fail "live SHA $live_sha != expected $EXPECTED_SHA"
  echo "PASS deployed SHA $live_sha"
fi

PUBLIC_ROUTES=(
  "/"
  "/players"
  "/players/419"
  "/points"
  "/matches"
  "/teams"
  "/teams/14"
  "/squads"
  "/availability"
  "/roles"
  "/backtest"
  "/pricing"
  "/sss"
  "/squad"
  "/profile"
  "/login"
  "/signup"
  "/forgot-password"
  "/reset-password"
  "/confirm-email"
)

for path in "${PUBLIC_ROUTES[@]}"; do
  code="$(status_code "$BASE_URL$path")"
  [[ "$code" == "200" ]] || fail "$path returned HTTP $code"
  echo "PASS route $path"
done

echo "Checking visible Turkish UI language"
for path in "${PUBLIC_ROUTES[@]}"; do
  safe_name="$(printf '%s' "$path" | sed 's#^/$#home#; s#^/##; s#[/?&=]#_#g')"
  html_file="$TMP_DIR/lang-${safe_name}.html"
  curl_retry -fsSL "$BASE_URL$path" > "$html_file"

  node - "$html_file" "$path" <<'NODE'
const fs=require('node:fs')
const [,,file,path]=process.argv
let html=fs.readFileSync(file,'utf8')
html=html
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
  .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi,' ')
  .replace(/<[^>]+>/g,' ')
  .replace(/&nbsp;|&#160;/gi,' ')
  .replace(/&amp;/gi,'&')
  .replace(/&quot;/gi,'"')
  .replace(/&#39;|&apos;/gi,"'")
  .replace(/\s+/g,' ')
  .trim()

const forbidden=[
  [/\bFantasy\b/i,'Fantasy'],
  [/\bScout(?:Plus)?\b/i,'Scout'],
  [/\bFree\b/i,'Free'],
  [/\bPro\b/i,'Pro'],
  [/\bPremium\b/i,'Premium'],
  [/\bReady\b/i,'Ready'],
  [/\bPass\b/i,'Pass'],
  [/\bRefresh\b/i,'Refresh'],
  [/\bReplay\b/i,'Replay'],
  [/\bSnapshot\b/i,'Snapshot'],
  [/clean\s*sheet/i,'clean sheet'],
  [/Top-?25/i,'Top-25'],
  [/vice[- ]captain/i,'vice-captain'],
  [/\bCross\b/i,'Cross'],
  [/\bDripling\b/i,'Dripling'],
  [/\bSwap\b/i,'Swap'],
  [/\bHit\b/i,'Hit'],
  [/\bCeiling\b/i,'Ceiling'],
  [/\bBeta\b/i,'Beta'],
  [/\bAvailability\b/i,'Availability'],
  [/\bHome\b/i,'Home'],
  [/\bAway\b/i,'Away'],
  [/\bLogin\b/i,'Login'],
  [/\bSignup\b/i,'Signup'],
  [/\bPassword\b/i,'Password'],
  [/\bProfile\b/i,'Profile'],
  [/\bDashboard\b/i,'Dashboard'],
]
const leaks=forbidden.filter(([pattern])=>pattern.test(html)).map(([,label])=>label)
if(leaks.length){
  console.error(path+': visible English terms leaked: '+leaks.join(', '))
  process.exit(1)
}
NODE
  echo "PASS Turkish UI $path"
done

SECTIONS=(all summary players matches squads availability roles weekly performance)
declare -a HASHES=()

for section in "${SECTIONS[@]}"; do
  body="$TMP_DIR/$section.json"
  code="$(curl_retry -sS -o "$body" -w '%{http_code}' "$BASE_URL/api/scout-data?section=$section")"
  [[ "$code" == "200" ]] || fail "section=$section returned HTTP $code"

  node - "$body" "$section" <<'NODE'
const fs=require('node:fs')
const [,,file,section]=process.argv
const raw=fs.readFileSync(file,'utf8')
let body
try{body=JSON.parse(raw)}catch{console.error('invalid JSON for '+section);process.exit(1)}
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
if(body.schema_version!=='2.0')throw new Error(section+': wrong schema_version')
if(body.meta?.schema_version!=='2.0')throw new Error(section+': wrong meta schema_version')
if(!Array.isArray(body.meta?.sections)||!body.meta.sections.includes('summary'))throw new Error(section+': summary not advertised')
if(body.section!==section)throw new Error(section+': response section mismatch')
for(const key of expected[section]||[])if(!(key in body))throw new Error(section+': missing '+key)
if(/"notes"\s*:|"model_version"\s*:|detail_source_/i.test(raw))throw new Error(section+': internal field leaked')
if(section==='summary'&&Object.prototype.hasOwnProperty.call(body,'players'))throw new Error('summary must stay compact')
if(section==='players'&&Object.prototype.hasOwnProperty.call(body,'matches'))throw new Error('players section leaked matches')
NODE

  HASHES+=("$(shasum -a 256 "$body" | awk '{print $1}')")
  echo "PASS API section=$section"
done

unique_hashes="$(printf '%s\n' "${HASHES[@]}" | sort -u | wc -l | tr -d ' ')"
[[ "$unique_hashes" == "${#SECTIONS[@]}" ]] || fail "different sections returned duplicate payloads ($unique_hashes/${#SECTIONS[@]} unique)"

summary_size="$(wc -c < "$TMP_DIR/summary.json" | tr -d ' ')"
(( summary_size < 51200 )) || fail "summary payload is $summary_size bytes (must be < 51200)"
echo "PASS summary size $summary_size bytes"

cp "$TMP_DIR/players.json" "$TMP_DIR/players-live.json"
curl_retry -fsSL "$BASE_URL/players/419" > "$TMP_DIR/player-419.html"
curl_retry -fsSL "$BASE_URL/matches" > "$TMP_DIR/matches.html"
curl_retry -fsSL "$BASE_URL/" > "$TMP_DIR/home.html"
curl_retry -fsSL "$BASE_URL/robots.txt" > "$TMP_DIR/robots.txt"
curl_retry -fsSL "$BASE_URL/sitemap.xml" > "$TMP_DIR/sitemap.xml"

node - "$TMP_DIR/players-live.json" "$TMP_DIR/player-419.html" "$TMP_DIR/matches.html" "$TMP_DIR/home.html" "$TMP_DIR/robots.txt" "$TMP_DIR/sitemap.xml" <<'NODE'
const fs=require('node:fs')
const [,,playersFile,playerHtmlFile,matchesHtmlFile,homeHtmlFile,robotsFile,sitemapFile]=process.argv
const payload=JSON.parse(fs.readFileSync(playersFile,'utf8'))
const player=(payload.players||[]).find(p=>Number(p.id)===419)
if(!player)throw new Error('player 419 missing from public feed')
if(player.name!==player.full_name)throw new Error('API name must equal full_name outside the pitch')
const expected=Number(player.projection?.xfp||0).toFixed(2)
const playerHtml=fs.readFileSync(playerHtmlFile,'utf8')
if(!playerHtml.includes(expected))throw new Error('player 419 detail does not contain feed xFP '+expected)
const matches=fs.readFileSync(matchesHtmlFile,'utf8')
const home=fs.readFileSync(homeHtmlFile,'utf8')
const robots=fs.readFileSync(robotsFile,'utf8')
const sitemap=fs.readFileSync(sitemapFile,'utf8')
for(const [name,html] of [['player',playerHtml],['matches',matches],['home',home],['robots',robots],['sitemap',sitemap]]){
  if(html.includes('vercel.app'))throw new Error(name+' contains old Vercel domain')
}
if(matches.includes('%$'))throw new Error('matches HTML contains malformed %$ probability')
NODE
echo "PASS player/detail/domain regressions"

not_found_body="$TMP_DIR/player-not-found.html"
not_found_code="$(curl_retry -sS -o "$not_found_body" -w '%{http_code}' "$BASE_URL/players/99999")"
if [[ "$not_found_code" == "404" ]]; then
  echo "PASS real 404"
elif [[ "$not_found_code" == "200" ]] && grep -Fq 'Sayfa bulunamadı' "$not_found_body" && grep -Eiq 'name="robots"[^>]*content="noindex"|content="noindex"[^>]*name="robots"' "$not_found_body"; then
  echo "PASS streamed semantic 404 (200 + noindex)"
else
  fail "/players/99999 is not a valid not-found response (HTTP $not_found_code)"
fi

redirect_code="$(curl_retry -sS -o /dev/null -w '%{http_code}' "$BASE_URL/api/scout-data?utm_source=x")"
[[ "$redirect_code" == "308" ]] || fail "unknown query param returned HTTP $redirect_code instead of 308"
echo "PASS canonical 308"

if [[ "${SKIP_CDN_CHECK:-0}" == "1" ]]; then
  echo "SKIP CDN cache header check"
else
  curl_retry -sS -D "$TMP_DIR/cache.headers" -o /dev/null "$BASE_URL/api/scout-data?section=summary"
  grep -Eiq '^cache-control:.*s-maxage=60' "$TMP_DIR/cache.headers" || {
    cat "$TMP_DIR/cache.headers" >&2
    fail "summary response is missing shared-cache policy"
  }
  echo "PASS CDN cache policy"
fi

echo "SMOKE PASS"
