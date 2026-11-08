# MH11 independent-calculated closure readiness — 2026-11-09

**Source policy:** The owner explicitly requests an MH11 close using independently calculated match statistics and model learning; `mh11_owner_approved_independent_score_events` is a separate source lineage. It must **never** be represented as `fresh_closed_actual` or an official TFF Fantasy export.

## Verified currently
- 9/9 final football results, with TFF crosswalk already in `scout_match_external_ids`.
- 456 player IDs: 278 participated, 178 DNP (full XI/substitute comparison); all 456 have evidence rows.
- **Calculated independent score file (NOT official):** 456 candidate totals, 713 base + 79 candidate dense-tier bonus = **792 provisional points**. `test/mh11-independent-closure-calibration.test.mjs` recomputes all point components, guards 0-minute rows and verifies bonus tier consistency across nine matches.
- Four off-pool participants never mapped to active players.
- 2 Nov frozen 456-player pre-kickoff model snapshot is immutable; avoid leaking late MH11 actuals into it.
- MH12 nine team pairings and kickoff times exist in `fixtures`, verified against [TFF week 12](https://www.tff.org/Default.aspx?hafta=12&macId=249253&pageId=198), but `scout_match_history` week 12 and new season stats were not ready as of this checkpoint.

## Still conditional, no hidden zero default
1. Goal, card and substitute events are source-backed; 165 minutes use substitution clocks and 105 full-match minutes are inferred from complete lineups/events. They are **not an official Fantasy minutes export**. For discrepant 83/84 readings, preserve higher supported minute and source evidence.
2. Saves require unresolved source arbitration: Deniz Dilmen 2/3 (candidate 3), Zafer Görgen 1/2 (candidate 2), Marcos Felipe 1/2 (candidate 2), Ataberk Dadakdeniz 2/3 (candidate 3), Ederson's provider count. A missing save value must never be filled with zero; a disputed candidate must retain its source note.
3. Independent bonus tiers are consistent with current simulator, **not official Fantasy bonus allocation**. Goals conceded during actual on-pitch minutes and possible penalty events remain important.
4. Never treat the 792-point provisional result as official. On owner-approved final independent import, use **only** `mh11_owner_approved_independent_score_events` with verified full 456-player coverage and `points=base_points+bonus_points`. Keep source evidence/provenance and record dispute notes; the source status is an *independently computed* final tally, not an official export.
5. Rollover requires season player and team stats through MH11, MH12 `scout_match_history` fixtures with verified identity, availability freshness, closure-status `KAPANDI`, frozen backtest close, CI, 50K complete draws and gated optimizer/promote. Don't forge these fields merely to make the gate green.

## 2026/27 calibrated forecast event-share weight (staged)
- Non-DEF goals: **xG 75% → 82%**, realized goals: **25% → 18%**.
- Non-DEF assists: **xA 70% → 82%**, realized assists: **30% → 18%**.
- DEF stays source-opportunity-weighted 90/10, GK save/CS joint scenarios unchanged; official Fantasy points and match-goal scoring unchanged.
- This shrinks short scoring streaks without inventing extra goals. Closed MH7–MH10 forecasts exhibit repeated played-only role/minute bias; simple blanket role uplifts did **not** consistently improve held-out MAE, so this change **does not add** such multipliers.
- Formula parity is enforced in Node local calculator, lifecycle role shares and Supabase Edge 50K scorer. **This is a candidate until CI, scorer deployment, matched 50K paired rerun and QA prove value.** Never call it a demonstrated MAE improvement in advance.
- Edge scorer version changes to `gk-sot-source-age-decay-v4-attack-reliability`; six GitHub Actions lifecycle checks reject the old deployed v3. Deploy the Edge scorer from the reviewed source before starting a new 50K, otherwise fail safely.
