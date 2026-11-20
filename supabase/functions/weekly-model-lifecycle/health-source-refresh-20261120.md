# MH12 health-source refresh request — 2026-11-20

Reason: re-run the existing signed 50,000-draw weekly lifecycle after verified Galatasaray SK health bulletin. No scorer-policy change.

Official source: https://x.com/galatasaraysk/status/2123766305798979676
Database source table: public.scout_verified_health_observations
Season/gameweek: 2026-27 / MH12
Verified player ids: 507, 511, 516, 529, 542, 877, 1306
Source observations and current live availability rows: 7, with audit tag gs_official_health_mh12_20261120.

Safety: Follow the existing workflow QA, optimizer, model_gate and promote controls. Do not change or replace the original immutable frozen backtest. Never publish a partly simulated run.

This documentation-only commit is intentionally within the existing workflow's push path to request its normal signed 50K refresh, without modifying the workflow or deployed model code.
