# Signed MH12 → MH13 model lifecycle — 24 November 2026

This is an audit-only trigger document in an existing signed GitHub Actions path; it does **not** modify scoring code, Supabase database schema, or manual Cloudflare deploy settings.

## Owner-approved independent MH12 final actuals

- MH12 has 9/9 TFF-confirmed football results, 9/9 Fantasy-closed match rows.
- `scout_player_weekly_points`: 456/456 final, exactly 742 owner-approved **independently calculated** points (661 base, 81 tie-aware calculated bonuses), source_kind `mh12_owner_approved_independent_score_events`. These are NOT claimed to be TFF Fantasy official exports.
- 278 actual playing participants, 178 independently verified DNPs. 60-minute scoring edge fixed for two players before closure.
- 266 observed real Highlightly player attack/shot/creative inputs in `scout_player_advanced_weekly` and `scout_verified_weekly_attack`. Null xG/xA have NOT been replaced with invented zeros.
- 12 explicitly named late substitute players have TFF-verified appearances but 0 minutes in erroneous provider box: 215,220,275,284,423,428,431,443,448,515,1372,1504. Preserve their historical advanced freshness; no fake xG/xA. The newly deployed `model-refresh-control` v21 uses `mh12OwnerApprovedAdvancedLagAccepted` to permit **only** these twelve stale markers, under strict all-week source checks.
- `scout_backtest_weeks`: MH12 **closed**, original immutable kickoff-before snapshot at 2026-11-08 23:51:52 UTC, run `8cf7a178-22a3-4b04-9a1f-edcd8dc698af`. Learned QA metrics use **only** 278 minutes-positive players; xFP MAE 1.9203, minutes MAE 25.5295, 6+ Brier 0.1197, Spearman 0.2953.

## MH13 independent official fixtures

Nine TFF official match IDs `317892` through `317900` are in `scout_match_history` with official match times converted correctly from Istanbul local to UTC. All nine start on/after 27 November 2026. Source: https://www.tff.org/Default.aspx?macId=317892&pageId=29 (and contiguous confirmed official links through macId 317900).

## Safety

Run the standard signed OIDC GitHub Actions lifecycle, do not bypass source freshness, QA, strict 50,000-draw completeness, optimizer, backtest/forecast gate, or promotion. Never rewrite the MH12 frozen prediction or invent future MH13 match outcomes. Deploy MH13 only after every existing gate reports pass. Do not silently reinterpret owner-approved independent points as official.

This document is intentionally within `supabase/functions/model-refresh-control/**` so a commit requests the existing workflow through its declared push trigger.
