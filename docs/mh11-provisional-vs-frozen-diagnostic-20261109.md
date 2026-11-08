# MH11: Frozen 50K forecast vs provisional 456-player scores (2026-11-09)

**Classification: DIAGNOSTIC ONLY / NOT OFFICIAL ACTUALS / NOT TRAINING DATA.**
This is a fresh join of the immutable 2026-11-02T22:33:20Z MH11 `scout_backtest_players` (`prediction_mode=live_frozen`) and `docs/mh11-provisional-fantasy-scores-20261109.csv`, matched by `player_id`.
The CSV uses derived clocks, candidate assists, disputed goalkeeper saves, candidate tied bonuses and unverified penalty/individual concession rules. **Do not write these numbers into `scout_player_weekly_points`, `scout_backtest_weeks` or `scout_learning_log` as verified actuals.** Nothing in this report authorizes closure or MH12 promotion.

## Source accounting
- Frozen predictions: 456 distinct player rows; matched provisional scores: 456/456.
- Provisional participants: 278 with minutes > 0; non-participants: 178.
- Match results: 9/9 `Bitti`, 9/9 `fantasy_closure=Puan doğrulama bekleniyor`.
- `scout_player_weekly_points`: MH11 has **zero** final rows; the MH11 frozen backtest remains **open**.
- Official final Fantasy bonus/assist, exact minutes and penalty/goal-concession attribution are unverified. The 456 CSV **is not** an official Fantasy-points feed.

## Descriptive errors (2026-11-09 provisional; not fitted)
Metric definitions: xFP MAE = mean absolute(predicted_xfp − provisional estimated_total); signed bias = mean(predicted_xfp − provisional estimated_total). Participants-only errors exclude every `minutes=0` player. Minutes MAE = absolute(predicted_minutes − provisional minutes), participants only; 6+ Brier = mean((six_plus_probability − I(provisional points >= 6))²), participants only. Probability must be in [0,1].

| Segment | Players | Played | MAE, all | MAE, played | Signed bias, played | Minutes MAE, played | 6+ Brier, played |
|---|---:|---:|---:|---:|---:|---:|---:|
| All | 456 | 278 | 1.57 | 2.07 | -0.60 | 23.15 | 0.138 |
| GK | 50 | 18 | 1.43 | 2.85 | -0.67 | 23.97 | 0.202 |
| DEF | 152 | 88 | 1.66 | 2.32 | +0.16 | 20.14 | 0.156 |
| MID | 190 | 130 | 1.57 | 1.91 | -1.06 | 24.60 | 0.128 |
| FWD | 64 | 42 | 1.45 | 1.73 | -0.73 | 24.64 | 0.105 |

**Provisional Top 25:** 5/25 unique-player overlap when both lists are ranked by predicted xFP and provisional points, respectively; tie handling can change the exact set. This is **not** a validated official Top-25 hit rate.

| Sourced sub-role | Played | Played MAE | Signed bias |
|---|---:|---:|---:|
| W | 48 | 2.73 | -1.86 |
| AM | 30 | 2.14 | -0.71 |
| DM | 39 | 1.08 | -0.38 |
| ST | 39 | 1.81 | -1.02 |
| FB | 36 | 2.11 | -0.24 |
| CB | 46 | 2.48 | +0.22 |

## Independent closed-week comparison (descriptive only)
Finalized MH9/MH10 rows, not provisional MH11, show played-only MID bias (forecast minus actual) **-0.42 / -1.12**, while DEF bias is **+0.05 / -0.01**. Thus the continued provisional MH11 MID negative bias (-1.06) is a **hypothesis to test with official MH11**, not proof that an arbitrary role multiplier should be applied. In contrast, GK played-only MAE was 2.86 / 3.20 for MH9/MH10 and is provisionally 2.85 in MH11. A football-event-consistent correction to playing probabilities, minutes and goal-assist shares is preferable to an after-the-fact xFP offset.

## Highest provisional errors (absolute xFP vs provisional points)
| Player | xFP | Provisional pts | Predicted minus provisional |
|---|---:|---:|---:|
| Mason Greenwood | 3.957 | 16 | -12.04 |
| Wagner Pina | 3.761 | 15 | -11.24 |
| Ali Sowe | 2.074 | 13 | -10.93 |
| Leandro Trossard | 4.395 | 15 | -10.61 |
| Oğuz Aydın | 2.752 | 13 | -10.25 |
| İrfan Can Kahveci | 2.805 | 13 | -10.20 |
| Haris Hajradinović | 1.606 | 11 | -9.39 |

These are outlier illustrations, not enough evidence to increase each player's goal-assist forecast or to retrospectively rewrite their frozen predictions.

## Open MH11 source blockers
1. **Official Fantasy final per-player awarded points and tie bonus** have not been independently retrieved. Provisional CSV sums: base 713, *estimated* tied bonuses +79, candidate total 792.
2. 165 substitute/dismissal minutes are event-clock derivations; 105 additional full-90 minutes are lineup/event derivations. Minute discrepancies use the higher source minute where supported but are not automatically exact Fantasy awarded minutes; three 60+ thresholds remain sensitive.
3. **Saves conflicts:** Deniz Dilmen (2 vs provisional 3), Zafer Görgen (1 vs provisional 2), Marcos Felipe (1 vs provisional 2). Ataberk Dadakdeniz (2 vs provisional 3) and Ederson also need source reconciliation. In none of the first three is zero supported. A saved-shot team total cannot unconditionally be attributed to a keeper.
4. 22 assists, 30 yellows, 1 red, 27 standard goals, 1 OG, possible penalty events and in-/out-of-play goal concessions still need Fantasy-specific award confirmation.
5. Four external lineup/substitute participants are outside the current 456-player pool and must not be aliased to another active player.

## Safety boundary
- Frozen kickoff snapshot is immutable. *Current* MH11 runs updated during MH11 are not valid pre-kickoff backtest baselines.
- Never optimize the same MH11 forecast using MH11 final outcomes as if they were information known before kickoff.
- Only after full sourced, final weekly-points coverage, valid snapshot and lifecycle gates pass, close MH11 and prepare MH12's independent 50,000-draw run; recheck current fixtures, injury/suspension, role signals and published-week SSR/API.
- **No engine weights, live model run, official result rows or production deployment were changed by this diagnostic.**

References: `docs/mh11-provisional-score-audit-20261109.md`; `docs/mh11-participation-reconciliation-20261109.md`; `docs/mh11-provisional-fantasy-scores-20261109.csv`.
