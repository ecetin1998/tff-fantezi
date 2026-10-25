# Team form, expected-goal distribution and automated lifecycle integrity — 25 Oct 2026

## Findings from production

- Baseline match lambda had been built from team's **season xG/90**, opponent **season xGA**, historical finishing/conceding efficiency and home/away modifier. NB2 goal distribution (alpha=0.168374169796264) is the *actual current* clean sheet probability model. Using Poisson exp(-lambda) to audit that historical run would produce misleading 0.03–0.04 discrepancies.
- 18/18 team seasonal rows have `through_gameweek=8`, but xG/xGA samples reflect **7 advanced matches**, not all 8. This is disclosed via audit warning rather than wrongly assuming complete advanced source.
- The 18 tactical profiles report aggregate-only, inferred positional channels (not event-verified left/center/right concessions). **Do not use these guessed zone profiles to boost or cut a named winger/fullback**; continue to apply opponent effects via the match goal lambda.
- The live MH9 50K produces 456 player forecasts, 9 matches and 18 teams; player expected goals sum to 96.1–97.9% of team lambdas, consistent with the 3.1% own-goal event probability. Model role goal/assist shares are normalized per team (observed approximately 0.997–1.004).

## Bounded verified team form

- Use only TFF-scoreboard **final** completed matches **prior to target gameweek**; no current or future results. Official full-time team scores do **not** require the separate Fantasy player points/bonus closure. In MH1–5 the recorded score is `Bitti` while historical Fantasy closure remains `Kontrol bekliyor`; those team results are valid team-form observations.
- Need >=5 earlier games with 3 consecutive last-gameweek records, otherwise **no form adjustment**.
- For scoring and concession separately, calculate (last 3 mean + 1) / (preweek season mean + 1), clamped to 0.70–1.30 to reduce rare-game instability.
- Update the two match lambdas conservatively via exponent **0.2** times average log scoring/conceding ratio. Keep original season xG/xGA baseline, home/away, player tactical roles and registration.
- Both goal-expectation allocation and goalkeeper/defender clean sheets derive from the same matchup lambdas and the later **NB2 simulation finalizer**, not from inferred zone shares.
- Intraday refresh re-reads original **pre-kickoff non-intraday benchmark**, not last rolling match lambdas, avoiding compounding form effect.

## Leakage-safe historical shadow on MH7 and MH8

Frozen original pre-kickoff match-lambda inputs were compared to retrospective predictions using only matches with earlier gameweeks. Evaluation sample: 18 fixtures, 36 team-sides. The 0.2 exponent is a conservative fixed setting; this is *exploratory*, not a 34-week holdout study.

| Team-goal metric (lower better) | Original | Bounded team form |
|---|---:|---:|
| Goal MAE | 0.94575 | 0.92428 |
| Goal RMSE | 1.12237 | 1.09916 |
| Poisson NLL on mean only | 1.43171 | 1.41390 |
| Clean sheet Brier, Poisson comparison | 0.22048 | 0.21650 |
| **NB2 NLL (current production distribution)** | **1.44121** | **1.42687** |
| **NB2 clean sheet Brier** | **0.21521** | **0.21160** |

**Limitations:** this small historical comparison of team mean lambdas is NOT a measured improvement in NB2 50K Fantasy xFP, punt/squad optimization, captain accuracy, or region-specific player outcomes. Production already uses NB2; actual longitudinal scoring must be monitored prospectively. The draft recent player-activity PR #365 is intentionally not activated (MH8 xG MAE mildly worsened).

## Every lifecycle validation

1. At scheduled/manual lifecycle start, authenticated read-only `action:audit_run` checks the *actual current* replay inputs and match predictions: 9 fixtures / 18 unique clubs / 456 registered players, nonnegative rate channels, normalized team goal/assist shares, valid lambdas, correct NB2 CS probabilities, and team-allocated 50K expected goals accounting for own goals.
2. Both weekly and intraday *input preparation* applies the same fail-closed structural QA **before insertion**.
3. After each 50K simulation finalizes (including the mandatory NB2 match-probability RPC) and **before promotion**, repeat `audit_run` using the exact run ID + benchmark.
4. Source gaps (late advanced xG/xGA, inferred weak zones, incomplete data) are **named warnings**; fabricated zeroes and unverified side matchups remain prohibited. True structural/source contradictions fail the lifecycle.
5. These checks are **read-only**. No existing official Fantasy score, the original frozen MH9 backtest, or a saved user's squad is ever rewritten by the audit.

## Controlled deployment

Production Edge function must be updated with `teamRecentForm.mjs` before merging this PR because the GitHub Actions workflow starts calling its new `audit_run` endpoint on merge. Verify new CI, signed OIDC runtime QA, 50K candidate model QA, publication, and live readback. Do not label deploy complete on code merge alone.

### Release check / MH9 source coverage
At MH9, all **18 clubs have eight finished official match scores** through MH8, including 3/3 immediately previous GW6–8 fixtures. This was verified directly in production. The initial implementation incorrectly demanded `fantasy_closure='KAPANDI'` for team score form and consequently passed all tests but applied no form adjustment (all 456 new xFP unchanged). The corrected model uses the **official match result state** only and leaves Fantasy point closure and official scoring data untouched.
