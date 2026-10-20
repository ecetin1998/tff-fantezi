# MH9 defensive role / xA source audit — 21 October 2026

## Decision

- **No artificial CB/FB/WB Fantasy-points multiplier.** Clean sheets, goals and
  assists use the same official position-scoring rules for each defensive role.
- Do **not** rewrite historic closed Fantasy points or the live MH9 50K snapshot.
- Keep xA source disagreements as **diagnostic candidates**, pending confirmation
  of the time coverage of the upstream total and per-90 source.
- Do not convert suspicious shot counts to sourced zero; preserve raw evidence.

## Verified full-squad, real-run figures

The active MH9 model was 50,000-draw run
`441e9c4a-b5e9-474c-8ef9-dc4bb98c1e3b`. In active 2026-27 defence:

| Role | All players | Mean xFP | Mean projected goals | Mean projected assists |
|---|---:|---:|---:|---:|
| CB | 82 | 1.75 | 0.026 | 0.018 |
| FB | 59 | 2.01 | 0.026 | 0.061 |
| WB | 4 | 3.96 | 0.088 | 0.158 |

For projected >=70 minutes: CB n=31 mean xFP 3.16, FB n=20 mean
3.61, WB n=3 mean 4.84. No **global stoper-over-bek** model bias was shown.

## Source inconsistencies — not official adjudications

The `scout_player_season_stats` rows are currently through MH8, while
`advanced_through_gameweek=7`. For players with confirmed MH8 minutes,
audit the advanced-source time window at:
`covered_minutes = season_minutes - confirmed_MH8_minutes`.

- **Malcom Bokélé (291, CB):** `xa_total=0.30`,
  `xa_per90=0.29`, aligned 540 min => 0.050 xA/90 by total.
  Provider per-90 source: `fotmob_xa_per90_web_2026-09-28`.
- **Josafat Mendes (472, FB):** `xa_total=0.60`,
  `xa_per90=0.22`, aligned 618 min => 0.0874 xA/90 by total.
  Provider per-90 source: `fotmob_xa_per90_web_2026-09-28`.

Independent public-site cross-checks (these sites are not identical sources):
- xgEdge reports Bokélé's six matches, **540 minutes** and 0.36 xA
  (roughly 0.060 xA/90). This independently reinforces that the recorded
  **0.29 xA/90** is out of scale with season totals, even though independent
  event-based xA is not numerically identical to the database's 0.30 total.
  Source: https://www.xg-edge.com/players/malcom-bokele
- FotMob's dated Samsunspor xA/90 leaderboard reports Mendes at **0.22**,
  supporting that the value itself existed in an earlier provider snapshot.
  But it does not establish this rate has the same league-minute denominator
  as the later 0.60 xA total / 618 aligned minutes.
  Source: https://www.fotmob.com/en-GB/leagues/71/stats/season/42167/players/expected_assists_per_90/team/9750/samsunsporteams-players

These are NOT guaranteed errors in the reported provider per-90:
different source snapshots could cover different matches. Data needs upstream
reconciliation. The side-by-side candidate uses an explicit **shadow only**
blend: `0.8 * (xa_total*90 / aligned_minutes) + 0.2 * xa_model_per90`.
It does not update the database or production scorer.

An additional 15 CBs and 1 FB showed more than 35 recorded seasonal shots,
sometimes dozens of shots on target despite very low xG. E.g. Hrvoje Smolčić
`shots=110, SOT=108, xg_total=0.03`, while
`scout_player_advanced_baseline` stores 0/0 and no advanced weekly
row exists for him. A second source audit is necessary to locate where those
intermediate stats were introduced. **Current production
`run-live-sim-chunk` does not directly read shots/shot-on-target rates as
Fantasy scoring features**; these are quality and presentation concerns,
not grounds for overwriting xFP without evidence.

## Paired local 50K shadow sensitivity test

Identical MH9 456-player/9-fixture replay inputs, temperature, formation and
fixtures; local `model/simulateScout.js` and
`model/attackAllocation.js`, with the two xA/90 input changes *only*.
Each baseline and candidate used the same PRNG seed in each chunk.

| Chunk | Draws | Seed |
|---|---:|---:|
| A | 10,000 | 20261021 |
| B | 20,000 | 20261022 |
| C | 20,000 | 20261023 |
| **Total** | **50,000** | |

| Player | Shadow baseline xFP | Shadow adjusted xFP | Delta |
|---|---:|---:|---:|
| Bokélé (CB) | 4.950 | 4.206 | -0.744 |
| Mendes (FB) | 3.893 | 3.569 | -0.324 |

Role mean deltas over all active `sub_role` players:
CB `-0.0073`, FB `-0.0027`, WB `+0.0096`.
Cross-player deltas can occur from within-team redistribution
of sampled assists and bonuses.

### Essential limitation

**This is a reference-model shadow comparison, not a production-Edge model
release QA.** The Node scorer uses local 50K simulation logic but does not
replay the production Edge overdispersed goal/shot-adjustment implementation
identically, nor does this test re-run the live optimiser against the new
candidate. Baseline shadow xFP is therefore not numerically identical to the
published Edge xFP. It supports direction and sensitivity, not publishing.

## Required before publishing adjusted live MH9

1. Verify xA per-90 and total were measured over **identical match windows**,
   for both players; obtain their actual league-minute denominator.
2. Trace and quarantine impossible advanced shots in the raw ingestion path,
   without changing real zero/missing indicators.
3. Stage **full production Edge 50K simulation** with verified source inputs;
   compare all CB/FB/WB player-level component xFP, P25/P90, bonus and
   sample outcome plausibility to the currently active run.
4. Stage both optimised squads; run `scout_run_qa`,
   `scout_data_integrity_qa`, release gates, then promote only on PASS.
5. Preserve the frozen MH9 pre-match baseline for later backtests.

Read-only audit helper `model/defenderSourceAudit.js` and its regression
tests implement the coverage / mismatch checks and never modify data.
