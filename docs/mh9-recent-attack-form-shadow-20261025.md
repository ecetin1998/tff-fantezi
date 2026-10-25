# Last-three-week attack activity: MH9 shadow & leakage-safe MH8 audit
Date: 25 October 2026. Status: **NOT APPROVED FOR PRODUCTION PROMOTION**.

## Implementation
- Stage: [PR #365](https://github.com/ecetin1998/tff-fantezi/pull/365).
- The weekly and intraday model input preparation now supports a bounded, evidence-backed (+8% / -12%) shot -> xG and key-pass -> xA *forecast rate* signal.
- Only two or three independent final matchweeks including the latest, with verified minutes >=45 per observed match and total >=120, count; a single-match spike cannot earn positive uplift.
- Missing actions stay missing, not 0. Goal/Fantasy points do not become form evidence. GK, CS, existing team xG/xGA, Fantasy rules and recorded historic scoring remain untouched. Source-aligned evidence is paginated, and refreshes anchor to stable, not previously adjusted inputs.
- The opponent match effect remains the existing team xG/xGA-based joint match score and associated clean-sheet/goal environment. Side-specific conceded chances are currently inferred aggregate-only, not verified event-based; no invented role/opponent multiplier was introduced.

## Production dataset coverage (read-only)
Current MH9 active run when audited: 50,000 simulations, 456 player forecasts.
- Recent action source observations: MH6 160 player rows, MH7 164, MH8 286 independently matched.
- A minimum two-week last-three activity signal was present for 140 distinct players at the first broad coverage scan. For the strictly source-aligned, usable season baseline, shadow candidate had 66 shot-channel eligible field players and 111 pass-channel eligible field players. GK: no changes.
- Proposed activity rate changes would touch 51 shot forecasts and 72 key-pass forecasts across DEF/MID/FWD. These are **input-rate** changes, NOT proven xFP improvements or final simulated recommendations.
- All 456 season advanced rows were still lagging at MH7 with 152 missing xA totals; sparse missing coverage must not be treated as zeros.

## Leakage-safe retrospective on MH8
- Frozen pre-kickoff MH8 forecast: `scout_model_runs.id=c932984a-8433-4649-a0c9-8f9439dcf257`, frozen 16 Oct 2026 11:20 UTC.
- Input baseline taken from that recorded MH8 benchmark, not recomputed using MH9 season data.
- MH6 shot/pass source rows timestamped 3 Oct and MH7 rows timestamped 12 Oct, both **before** MH8's first kickoff on 16 Oct; only those rows were treated as predictor features.
- MH8 independently observed xG/xA after the matches were used **as evaluation targets only**, not as prediction inputs.
- Comparison is conditional-on-actual-minutes attacking xG/xA, **not** a 50K fantasy points backtest. It cannot establish true improvement in Fantasy xFP or optimizer recommendation quality.

| MH8 observed metric | Eligible outcome rows | Model changes | Prior MAE | Form MAE | Prior RMSE | Form RMSE |
|---|---:|---:|---:|---:|---:|---:|
| xG | 107 | 29 | 0.17087 | 0.17119 | 0.27555 | 0.27545 |
| xA | 160 | 0 | 0.09749 | 0.09749 | 0.15199 | 0.15199 |

**Decision:** xG MAE slightly worsened; xA has zero active historical feature updates. Evidence does not establish better forecast accuracy. **Do not merge, deploy updated Edge Function, run promotion or replace current MH9 xFP on the basis of this shadow alone**.

## Next unbiased validation gate
- Collect new **timely** match-by-match shot, chance and xA evidence. Require two independent valid weeks and before-kickoff source timestamps.
- Validate on future untouched weeks (not the same MH8 used to inspect this candidate) and compare xG/xA, Fantasy MAE/RMSE, 6+ Brier and top-25 hit rate against the frozen published baseline.
- Only with an actual demonstrated improvement: perform a non-current 50K A/B candidate, optimize and pass full model/integrity/bugfix/source/lineup QA. Then controlled publish. Never mutate `scout_backtest_weeks`, final Fantasy points or user squads.
