#!/usr/bin/env bash
# Verify the public production site actually renders the DB-backed current MH.
# A promoted Supabase run alone is not evidence of a successful HTML release.
set -euo pipefail

BASE_URL="${BASE_URL:-https://fanteziligrehberi.com}"
EXPECTED_GAMEWEEK="${EXPECTED_GAMEWEEK:?Require expected published gameweek}"
BUILD_SHA="${GITHUB_SHA:-diagnostic}"
[[ "$EXPECTED_GAMEWEEK" =~ ^[0-9]+$ ]] && (( EXPECTED_GAMEWEEK >= 1 ))

for attempt in $(seq 1 8); do
  nonce="$BUILD_SHA-$attempt"
  tmp="$(mktemp -d)"
  success=true

  fetch(){
    local route="$1" outfile="$2"
    curl --fail --silent --show-error --location --retry 2 --retry-delay 2 \
      --connect-timeout 10 --max-time 45 \
      -H 'Cache-Control: no-cache' "$BASE_URL$route" > "$outfile"
  }

  if ! fetch "/api/scout-data?section=matches&limit=9" "$tmp/api"; then success=false; fi

  published="error"
  if [[ "$success" == true ]]; then
    published="$(jq -er '.current_run.gameweek' "$tmp/api" 2>/dev/null || echo error)"
    jq -e '.current_run.is_current == true and .current_run.status == "ready" and (.matches|length) == 9' "$tmp/api" >/dev/null || success=false
    [[ "$published" == "$EXPECTED_GAMEWEEK" ]] || success=false
  fi

  # Dynamic SSR pages must show the LIVE model week, never old ISR/R2 HTML.
  for entry in 'home:/:xFP lideri' 'players:/players:Oyuncu Analizi' 'matches:/matches:Maç Tahminleri' 'squads:/squads:Kadro Önerileri'; do
    IFS=':' read -r name route label <<< "$entry"
    if ! fetch "$route?mh-probe=$nonce" "$tmp/$name"; then
      success=false
      continue
    fi
    # Preserve the exact homepage-week invariant used in lifecycle contract tests.
    expected_marker="MH$EXPECTED_GAMEWEEK $label"
    if [[ "$name" == home ]]; then
      expected_marker="MH${EXPECTED_GAMEWEEK} xFP lideri"
    fi
    # Parse React's comment-separated SSR text nodes; do not search Flight
    # scripts or mistake a display-correct MH8 heading for missing raw bytes.
    if ! python3 scripts/check-rendered-week.py "$tmp/$name" "$expected_marker"; then
      echo "MH mismatch on $route: missing $expected_marker in rendered text" >&2
      success=false
    fi
  done

  if [[ "$success" == true ]]; then
    echo "PASS: production API, home, players, matches and squads all render MH$EXPECTED_GAMEWEEK"
    rm -rf "$tmp"
    exit 0
  fi
  echo "Production MH mismatch attempt=$attempt expected=$EXPECTED_GAMEWEEK api=$published" >&2
  rm -rf "$tmp"
  sleep 5
done

echo "BLOCKED: production HTML/API disagree with the verified live model week." >&2
exit 1
