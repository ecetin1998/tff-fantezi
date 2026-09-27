# Model v2 — GW1–GW6 50K Replay Evidence

Candidate: `model-v2-2026-09-27`  
Baseline: `scoutplus-3.3-replay-v1-2026-09-26`  
Replay input: `fresh-current-logic+cold-start-v1-2026-09-24`  
Draws: **50,000 per matchweek**

| MH | Point MAE old | Point MAE new | Rank old | Rank new | Top25 old | Top25 new | Band old | Band new | Minute MAE old | Minute MAE new | Brier old | Brier new |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 1.62155 | 1.61568 | 0.23220 | 0.27609 | 0.24 | 0.20 | 0.86558 | 0.85947 | 33.04175 | 32.95652 | 0.24500 | 0.24154 |
| 2 | 1.56624 | 1.53327 | 0.54253 | 0.59401 | 0.24 | 0.20 | 0.86354 | 0.86558 | 24.43257 | 23.17292 | 0.20569 | 0.21153 |
| 3 | 1.45301 | 1.40867 | 0.52527 | 0.58867 | 0.16 | 0.16 | 0.83910 | 0.84318 | 21.91507 | 21.05278 | 0.19467 | 0.19323 |
| 4 | 1.46063 | 1.44729 | 0.55617 | 0.61051 | 0.08 | 0.24 | 0.82485 | 0.80448 | 18.27386 | 18.32340 | 0.20094 | 0.19651 |
| 5 | 1.35985 | 1.36321 | 0.59588 | 0.64175 | 0.08 | 0.16 | 0.83109 | 0.81190 | 16.05019 | 16.90517 | 0.17598 | 0.17459 |
| 6 | 1.49748 | 1.50557 | 0.54850 | 0.60343 | 0.24 | 0.24 | 0.81853 | 0.81853 | 15.81355 | 16.60118 | 0.20887 | 0.20733 |
| **Mean** | **1.49313** | **1.47895** | **0.50009** | **0.55241** | **0.17333** | **0.20000** | **0.84045** | **0.83386** | **21.58783** | **21.50200** | **0.20519** | **0.20412** |

## Gate

- Mean point MAE: **PASS** (lower by 0.01418).
- Mean 1-X-2 Brier: **PASS** (lower by 0.00107).
- Ranking alignment: improved by **+0.05232**.
- Top25 hit rate: improved by **+0.02667**.
- Minute MAE: improved by **0.08584**.
- Band hit rate: lower by **0.00659**; this is tracked as a calibration follow-up and is not allowed to override the explicit MAE/Brier release gate.

The replay is evidence only. It does not mutate or promote the current run.
