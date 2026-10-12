#!/usr/bin/env bash
# Production guard: the domain must show the exact model week that Supabase
# reports as current. Only call this after the Cloudflare SHA health check.
set -euo pipefail

BASE_URL="${BASE_URL:-https://fanteziligrehberi.com}"
EXPECTED_GAMEWEEK="${EXPECTED_GAMEWEEK:?Require verified Supabase current gameweek}"
BUILD_SHA="${GITHUB_SHA:-diagnostic}"
test "$EXPECTED_GAMEWEEK" -ge 1

for attempt in $(seq 1 8); do
  # Both URLs intentionally bypass stale Cloudflare/Next shared responses.
  home="$(curl --fail --silent --show-error --retry 2 --max-time 30 \
    -H 'Cache-Control: no-cache' "$BASE_URL/?mh-probe=$BUILD_SHA-$attempt")"
  payload="$(curl --fail --silent --show-error --retry 2 --max-time 30 \
    -H 'Cache-Control: no-cache' "$BASE_URL/api/scout-data?section=summary&limit=1")"
  published="$(printf '%s' "$payload" | jq -er '.gameweek')"
  found_home="$(printf '%s' "$home" | grep -F -o "MH${EXPECTED_GAMEWEEK} xFP lideri" | head -1 || true)"

  if [[ "$published" == "$EXPECTED_GAMEWEEK" && -n "$found_home" ]]; then
    printf 'Production week verified: Supabase MH%s, public API MH%s, homepage MH%s\n' \
      "$EXPECTED_GAMEWEEK" "$published" "$EXPECTED_GAMEWEEK"
    exit 0
  fi
  printf 'Production week mismatch attempt=%s expected=MH%s api=MH%s home_has_expected=%s\n' \
    "$attempt" "$EXPECTED_GAMEWEEK" "$published" "$([[ -n "$found_home" ]] && echo yes || echo no)" >&2
  sleep 5
done

echo "Blocking false-positive deploy: homepage and public API are not on the current model week." >&2
exit 1
