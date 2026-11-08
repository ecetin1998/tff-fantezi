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


## POST-MERGE OPERATIONAL CHECKPOINT — 2026-11-09

- PR [#431](https://github.com/ecetin1998/tff-fantezi/pull/431) passed CI [42532021433](https://github.com/ecetin1998/tff-fantezi/actions/runs/42532021433) and was merged to main at `a87d8e39aa10d9d7ed4986d738e5d09426d72da0`. The 456-player frozen diagnostic PR [#430](https://github.com/ecetin1998/tff-fantezi/pull/430) also merged separately at `6cadb742c25fbb0b66b0ea6d2a3f6e98820d2878`.
- Supabase protected Edge runtime **deployed and read-back verified**: `run-live-sim-chunk` **v20**, `weekly-model-lifecycle` **v56**. The code contains 82/18 non-DEF xG/xA event-share allocation and MH11 independently calculated source gate. Both preserve GitHub OIDC and reject unauthorized operational calls. This prepares the **next** 50K, but it does **not** alter the existing published 50K MH11 snapshot.
- Source-controlled migration `20261109013000_mh11_independent_scoring_staging.sql` applied and RLS verified. **456 distinct MH11 independently calculated candidate rows**, 9 matches, 278 played, 178 DNP, 713 base +79 estimated bonus =792 candidate points, are kept solely in private `scout_independent_score_candidates` with `status=provisional`. Earlier redundant `is_final=false` candidate entries in `scout_player_weekly_points` were removed after confirming the secure table's 456-player coverage. **`scout_player_weekly_points`: zero MH11 final rows; no unverified score backtest learning.**
- `scout_learning_log` #35 documents the applied scorer recalibration, explicitly requiring MH12+ forward verification; #36 logs **confirmed MH11 participation** quality: 456 entries, 30+ minute forecast TP211/FP39/FN67/TN139, appearance Brier .1505, XI Brier .1499, provisional played-minute MAE 23.15. These participation facts are separated from provisional Fantasy score targets.
- `scout_gameweeks` MH12 deadline inserted and verified: **2026-11-21T09:30:00Z (12:30 Turkey)**, exactly one hour before the first verified 13:30 TSİ fixture. This does not activate MH12. The 9 future fixtures exist in `fixtures`, but a supported 9-match `scout_match_history` identity set and updated through-MH11 season player/team stats are still missing.
- New source comparisons retained **without silently changing candidate saves**: Deniz Dilmen =3 supported by Ludistat/FutbolRadar/Macveri (other provider 2), Marcos Felipe =2 supported by Çorum club report/Teleskor (other provider 1), Zafer Görgen =2 by Ligatable vs 1 by Playmakerstats. The 1/2 difference for Zafer and Marcos has **zero** effect on fantasy-save points under floor(saves/3); Deniz's 2/3 difference can change one save point and re-rank tentative bonuses. Ataberk Dadakdeniz and Ederson save evidence also remain contested.
- **BLOCKED, intentionally not misreported as done:** no MH11 certified final points, no closed `scout_backtest_weeks`, no MH12 50K run, no MH12 publication. Critical unresolved: official Fantasy player bonus/asist/penalty credits, exact minute and on-pitch concession reconciliation, sourced through-MH11 season statistics and target match-history fixtures. Do not mark source uncertainty as exact zero or use candidate points as training actuals.
