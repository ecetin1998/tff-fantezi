# MH9 defender advanced-input audit — 2026-10-21

**Status:** read-only quality review and **candidate sensitivity**. NO official xA correction, current-run mutation, optimizer update, backtest rewrite or production deployment.

## Why this matters

DEF positions receive the same TFF Fantasy goal and clean-sheet awards. Wing/full-backs should gain relative xFP when their source-grounded xA is higher; CBs can still have high clean-sheet + bonus expectations. Current 50K MH9 model includes 82 CB, 59 FB, 4 WB among active defenders. At xMinutes >= 70 the mean xFP values are CB **3.16**, FB **3.61**, WB **4.84**. Thus the model does **not** globally privilege CB above wide defenders.

## Issues requiring source reconciliation

The season summary has `through_gameweek=8` and the attack enrichment has `advanced_through_gameweek=7`. These exact two rows have **inconsistent xA-per-90 and xA-total** over the 7-week recorded exposure if the sources cover the same period:

| Player | Role | Historical xA total | Exposure through MH7 | Reported xA/90 | Total-derived xA/90 | Candidate rate, 80% total-derived + 20% existing prior |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Malcom Bokélé, id 291 | CB | 0.30 | 540 min | 0.290 | 0.050 | 0.05252 |
| Josafat Mendes, id 472 | FB | 0.60 | 618 min | 0.220 | 0.08738 | 0.08233 |

**Sources can have different cutoff dates and match scopes.** Reported rate and total are both source-labelled values, not necessarily false; the candidate is a preview to bound sensitivity, NOT a replacement observation.

Additional data-quality flag: 15 CBs have greater than 35 recorded season shots, some accompanied by implausible shots-on-target counts. Example: Hrvoje Smolčić (id 239) has 110 shots / 108 on target with season xG of 0.03. Verify original category and source rows. Never rewrite uncertain shot counts to zero. In the current Edge scoring implementation `rates[10]` and `rates[11]` do not directly allocate goals or assists.

## Paired 50,000-draw sensitivity check

We used the repository `model/simulateScout.js`, unchanged formations and fixture expectations from `scout_replay_*_inputs` benchmark
`intraday-mh9-20261020071900-5036f969-goal-dist-v1-69d4a748`.
Exactly two rows' `rates[3]` (xA/90) were changed **in memory only**, to the preview values above, with every other replay input held constant. Same seed per baseline/candidate pair. Execute 3 reproducible shards (10k + 20k + 20k) with seeds **20261021**, **20261022**, **20261023**, respectively. Weighted averages:

| Player | Baseline local Node xFP | Candidate local Node xFP | Delta |
| --- | ---: | ---: | ---: |
| Malcom Bokélé (CB) | 4.95030 | 4.20632 | **−0.74398** |
| Josafat Mendes (FB) | 3.89292 | 3.56858 | **−0.32434** |

The simulator redistributes assisted goal events inside each team, so other teammates can shift as well. These are NOT the displayed/current run's xFP: the live run uses production Edge model, including goal-distribution overdispersion and source-linked single-shot adjustments not fully reproduced by this standalone local Node input. The local baseline differing from live MH9 proves why this should **not** be directly patched into a published projection.

## Guardrails and next checks

1. Reconcile dated xA total, xA/90, season minutes and original source evidence before any permanent rate change.
2. Verify the exceptional `shots` and `shots_on_target` mappings in fresh Sahadan match actions; do not change Fantasy scoring weights.
3. Produce a production-engine candidate with 50K, recommended and alternative squads, and run model QA plus data integrity and release gates before any current-run promotion.
4. Preserve frozen predictions and MH7/MH8 observed Fantasy scoring; no retroactive re-rating.
5. `model/defenderRateInputAudit.js` only flags and previews conflicts; it intentionally contains no write logic. A future ingestion/rollover must use source-aligned rates explicitly, not silently apply this candidate.

### Read-only investigation query

```sql
SELECT p.id, p.full_name, p.primary_role, s.xa_total, s.xa_per90,
       s.xa_model_per90, s.advanced_through_gameweek,
       s.minutes - coalesce(w.minutes, 0) AS pre_mh8_minutes,
       s.shots, s.shots_on_target
FROM public.scout_players p
JOIN public.scout_player_season_stats s ON s.player_id = p.id AND s.season = '2026-27'
LEFT JOIN public.scout_player_weekly_points w ON w.player_id = p.id AND w.gameweek = 8
WHERE p.position = 'DEF' AND p.active
ORDER BY p.primary_role, p.id;
```
