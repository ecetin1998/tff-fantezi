# MH9 defender source-integrity review (2026-10-21)

**Status: REVIEW / NO MODEL PROMOTION.** All database and published MH9 projections remain unchanged.

## Why

Across all active defenders the current MH9 mean xFP is **CB 1.75, FB 2.01, WB 3.96**. Among players projected for at least 70 minutes, the corresponding means are **CB 3.16 (31), FB 3.61 (20), WB 4.84 (3)**. There is no evidence for a blanket extra full-back points multiplier: clean sheet and goal/assist awards must remain governed by the Fantasy scoring rules.

The leading individual CB ranks nevertheless prompted investigation of *source as-of mismatch*:

| Player | Raw xa_per90 field | xa_total | Reconciled minutes at GW7 | Implied total / 90 | MH9 production xFP |
| --- | ---: | ---: | ---: | ---: | ---: |
| Malcom Bokélé, CB, id 291 | .290 | .300 | 540 | .050 | 5.13 |
| Josafat Mendes, FB, id 472 | .220 | .600 | 618 | .087 | 4.07 |

The raw per90 sources were collected around **2026-09-28**, whereas gameweek-seven totals and minute ledgers may have different as-of dates. This **flags a potentially incompatible comparison, not a proven false published number**. Do not overwrite official/sourced fields without same-snapshot verification.

**Reproducible diagnostics:** `scripts/audit_defender_features_2026_27.sql`. This query is read-only. `model/defenderFeatureAudit.js` and its unit test implement the same *review flags* and optionally produce a scenario-only proposed xA rate, not a data correction.

### Hypothesis only: paired replay

Using the MH9 benchmark `intraday-mh9-20261020071900-5036f969-goal-dist-v1-69d4a748`, a 10,000-draw paired local Node simulation with seed `20261021`, 456 player input rows and nine original fixtures changed only two defender xA input rates:

- CB Bokélé: `.290 -> .05252`: isolated simulation xFP `4.891 -> 4.172` (difference `-0.719`).
- FB Mendes: `.220 -> .08233`: isolated simulation xFP `3.920 -> 3.592` (difference `-0.328`).

These paired local simulation numbers **are not** the same as the deployed Edge 50K values. The local Node simulator did not replay full production goal-distribution overdispersion or all production single-shot adjustments. An attempt to execute the complete 50K comparison in one tool invocation timed out; no 50K result has been certified.

This exercise shows the importance of checking xA provenance but is insufficient for production score promotion. Do not adopt these scenario values as sourced xA or modify the current run.

### Shot-stat discrepancies

Sixteen active defenders (15 CB, 1 FB) have `shots > 35` in the season table; all sixteen **fail to reconcile** with `scout_player_advanced_baseline + scout_player_advanced_weekly` through gameweek seven. Fifteen of sixteen also fail the shots-on-target reconciliation. The currently deployed Edge attacker allocation uses rates from historical xG, goal, assist, xA, not the raw season shot count directly; this does not justify masking the bad display/source fields.

## Release gate for a defender adjustment

1. Re-fetch matching date-stamped xA totals, per90 and minutes for both flagged defenders and check source identity/season. If snapshots are unequal, avoid treating their ratio as a confirmed corrected rate.
2. Reconcile season shot and shot-on-target counts against real match event ledgers; never bulk-replace with zero.
3. Use the exact same MH9 input snapshot and deterministic 50K seeds for **production Edge scoring**, including single-shot adjustment, keeper save/penalty and calibrated goal distribution.
4. Compare per-player xFP/P25/P75/P90, 6+ probability, CB/FB/WB mean MAE on closed weeks, XI membership and recommended/aggressive optimizer results. Confirm zero effect on unchanged input/history snapshots.
5. Pass all release gates and promote a newly staged run; do not edit historical frozen forecasts or live projections in place.

No positional artificial bonus, positional clean sheet change, production DB mutation, or Cloudflare deploy is part of this PR.
