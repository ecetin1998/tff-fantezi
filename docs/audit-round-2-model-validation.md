# Audit Round 2 — Model Validation Evidence

Date: 2026-09-27 (Europe/Istanbul)  
Branch: `fix/audit-round-2`

No historical replay table and no production current-run flag was modified while producing these measurements.

## Current MH7 run

- model: `ScoutPlus 3.3 RC2 / GW7 • attack-share • 50K`
- simulation count: 50,000
- active projections: 449 / 449
- active roles: 449 / 449
- matches: 9
- teams: 18
- `scout_run_qa`: PASS
- `scout_data_integrity_qa`: PASS

The stale `do not publish until full QA and backtest` marker was cleared only after QA, data-integrity and 50K replay evidence were recorded. The production release gate is PASS and an idempotent `scout_promote_run` verification completed successfully.

## Walk-forward replay — exact branch simulator, 50K

Inputs:
- canonical `scout_replay_player_inputs`
- canonical `scout_replay_match_inputs`
- canonical `scout_replay_input_meta`
- finalized actual points/minutes
- Fresh control sheet `Oyuncu Maçları` xG/shots
- only player-match history with MH < target MH
- deterministic player/match ordering before seeded simulation

The existing replay Edge Function was not accepted as evidence for this model commit because its simulator revision does not match the branch motor.

| MH | New MAE | Old MAE | New rank | Old rank | New Top25 | Old Top25 | New min MAE | Old min MAE | New P25–P90 | Old P25–P90 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 1.619 | 1.622 | 0.270 | 0.232 | 20% | 24% | 33.13 | 33.04 | 86.35% | 86.56% |
| 2 | 1.539 | 1.566 | 0.599 | 0.543 | 28% | 24% | 23.63 | 24.43 | 87.37% | 86.35% |
| 3 | 1.420 | 1.453 | 0.587 | 0.525 | 16% | 16% | 21.20 | 21.92 | 84.11% | 83.91% |
| 4 | 1.444 | 1.461 | 0.614 | 0.556 | 20% | 8% | 18.00 | 18.27 | 79.84% | 82.48% |
| 5 | 1.351 | 1.360 | 0.644 | 0.596 | 12% | 8% | 16.17 | 16.05 | 81.19% | 83.11% |
| 6 | 1.489 | 1.497 | 0.604 | 0.548 | 24% | 24% | 15.20 | 15.81 | 80.72% | 81.85% |
| **Mean** | **1.477** | **1.493** | **0.553** | **0.500** | **20.0%** | **17.3%** | **21.22** | **21.59** | **83.26%** | **84.04%** |

Interpretation:
- mean point MAE improves by about 0.016;
- mean rank alignment improves by about 0.053;
- mean Top25 hit rate improves by about 2.7 percentage points;
- mean minute MAE improves by about 0.37 minutes;
- P25–P90 coverage declines by about 0.8 percentage points, so distribution calibration remains an open learning item.

## MH7 paired delta — attack allocation

The paired comparison uses the same 449-player input, 50,000 draws, seed `2026092607`, and canonical `player_id` / `match_id` ordering for both policies.

Population mean xFP:
- baseline: 1.674474
- candidate: 1.674263
- delta: about **-0.00021/player**

Top25 membership is unchanged; only ordering moves.

Selected players:

| Player | Baseline xFP | Candidate xFP | Δ xFP | Baseline P90 | Candidate P90 | Δ xGoal | Δ xAssist |
|---|---:|---:|---:|---:|---:|---:|---:|
| Fatih Aksoy | 5.288 | 4.983 | **-0.305** | 11 | 9 | -0.0380 | +0.0008 |
| Florent Hadërgjonaj | 4.814 | 4.836 | **+0.022** | 9 | 9 | +0.0001 | +0.0037 |
| Deian Sorescu | 5.265 | 5.273 | **+0.008** | 11 | 11 | +0.0012 | -0.0001 |

This is a targeted redistribution rather than global xFP inflation. It materially reduces the isolated high-xG chance effect on Fatih while preserving Hadërgjonaj's sustained assist role and Sorescu's attacking role.

## Event-rule and optimizer checks

- own-goal scorer does not receive an attacking goal;
- a separately credited assist remains eligible for +3, matching the project's closed MH5 Murillo/Yakup Kırtay record;
- simultaneous yellow+red flag is treated as a second-yellow dismissal for -3 total rather than -4;
- 11 starters / 990 player-minutes per club are regression tested;
- no-match quantiles stay finite;
- alternative captain uses P90;
- optimizer checks solver success, legal squad constraints and bench expected value;
- replay input construction sorts players, matches and player-match history deterministically.

## Release decision

The evidence does not support reverting the attack-share correction. Distribution-band calibration remains open.

Production DB hardening, RLS isolation, release-gate recording and idempotent promote verification are complete. The remaining release blocker is the Vercel Preview deployment/smoke pass; the current Vercel status is blocked by build-rate-limit.
