# MH11 — owner-approved independent final closure (2026-11-09)

**Decision:** The project owner explicitly accepts the team's independently collected match-event statistics and its calculated fantasy points as final actuals for MH11. No additional TFF Fantasy export verification is required. **Do not mislabel these records as an official TFF score export.**

## Production DB closure

- **Season** 2026-27; **MH11** nine fixtures all `Bitti` and `fantasy_closure = KAPANDI` (9/9).
- **456/456** active players in `scout_player_weekly_points` with `is_final=true`; each has exact unique `player_id`, `match_id`, derived `minutes`, `base_points`, `bonus_points`, and `points`. No row-score mismatches.
- Exact source provenance: `source_kind = mh11_owner_approved_independent_score_events`; accepted by `weekly-model-lifecycle/closureSource.mjs`. **Not** `fresh_closed_actual` or an official provider.
- Scoring: **727 base + 79 awarded by internal bonus tie rules = 806 total**. 39 bonus recipients, bonus re-ranking mismatch count 0.
- **456** `scout_independent_score_candidates` staging records now `status='reviewed'` and carry `[MH11_OWNER_APPROVED_FINAL_20261109]`. Historical minute and provider caveats remain documented in `uncertainty_flags` / `evidence_note`, because user-approved independent actuals are not official TFF award exports.
- **456** `scout_player_season_stats` rows advanced from through MH10 to MH11, adding actual starts, minutes, goals, assists, clean sheets, saves, yellow/red cards, own goals, fantasy points, and 6+ matches; preserves pre-existing advanced xG/xA/shots rather than manufacturing unobserved values. **18** `scout_team_season_stats` rows advanced to through MH11, with +1 match and sourced goals for/against per club; advanced coverage and underlying measured values intentionally unchanged, provenance noted.
- Match data includes **278 played / 178 DNP**, 27 directly credited goals and one own goal for 28 match goals, 22 assists, 57 keeper saves, 30 yellow and 1 red card; source-event reconstruction for 456 rows passed QA. Five user-approved keeper save counts: Ataberk Dadakdeniz 3, Deniz Dilmen 3, Ederson 9, Zafer Görgen 3, Marcos Felipe 2. Zafer 2→3 increased total from 805 to 806.
- Previous 11 defender on-pitch goals conceded penalties corrected (+13) and 126 further flagged defensive rows reconciled; assists reviewed 20 players / 22 assists. See `docs/mh11-805-on-pitch-goals-and-closure-audit-20261109.md` for intermediate history.
- No new kickoff-unsupported source statistics were generated.

## Frozen live backtest

The project already froze the MH11 backtest on **2026-11-02 22:33 UTC**, **before earliest MH11 kickoff 2026-11-06 17:00 UTC**, using original run `5407863b-eb54-4100-a5bb-e992982c5087`, not the later rolling MH11 run.

Executed existing `public.scout_close_live_backtest(p_run_id)` with the original frozen run. Result was `ok=true`, 9 matches, 456 actuals. `scout_backtest_weeks.gameweek=11` now `status='closed'`:
- Whole-cohort FP MAE: **1.5419167**
- Minute MAE: **20.7513158**
- Rank correlation (function's `corr` of ranks): **0.5093754**
- Top25 hit: **0.20** (5/25)
- Six-plus probability Brier: **0.0872980**
- Recommended XI actual: **57**; captain points: **10**
- All 456 backtest player records have 806 actual points total and 17,576 actual minutes.

## MH12 source preflight

`scout_weekly_lifecycle.target_gameweek=12` records **MH11 fully source-complete** with the independent provenance above. `fixtures` contains nine MH12 fixtures covering 18 teams, first kickoff Saturday **2026-11-21 13:30 Istanbul**, deadline **12:30 Istanbul**. **MH12 `scout_match_history` has zero rows** pending verifiable match identities: do not assume `fixtures.id` values or fabricate sequential match IDs. Model's full `ready_to_advance` gate remains blocked by this independent schedule mapping, not by MH11 fantasy points. No MH12 candidate 50K run or live promotion was performed as part of this MH11 closure.
