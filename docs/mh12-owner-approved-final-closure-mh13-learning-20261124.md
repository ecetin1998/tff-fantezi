# MH12 owner-approved independent Fantasy closure → MH13 learning

**2026-11-24. Source classification: independently calculated Fantasy scores, NOT official TFF Fantasy point export.** The project owner explicitly approved calculating goal/assist/minutes/clean sheet/keeper saves/card and tie-aware bonus points from verified events and using them as final independent actuals for weekly learning.

## Source integrity and arithmetic

- MH12 fixtures 9/9 full-time and source-verified. `scout_match_history.fantasy_closure='KAPANDI'` in all nine.
- `scout_player_weekly_points`: 456 distinct active players, 456 `is_final=true`, source_kind **`mh12_owner_approved_independent_score_events`**. **742 total = 661 base + 81 tie-aware rules-based bonuses**, not an official points export.
- Independently TFF official team sheets and completed substitute lists account for **278 playing**, **178 independently source-confirmed 0-minute / 0-point nonparticipants**. Twelve wrongly zero-minute late substitutes were restored to positive appearance scoring.
- Two exact 60-minute participants (Tayfur Bingöl / Makana Nsimba Baku) receive **2 appearance points** for 60+ minutes. The correction adds 2 points compared to the earlier 740-point candidate total. Tie-aware bonus rankings rechecked including all four source-positive players outside Fantasy pool; **81** computed bonuses unchanged.
- Source reconciliation includes two missed late goals and assists, nine conceded-on-pitch penalty corrections, yellow-card discrepancies checked against TFF, Uğurcan Çakır 6 saves (not provider 5), other goalkeeper saves crosschecks, and full-time minutes normalization.
- Full traceable source notes remain in `scout_independent_score_candidates` (all 456 `status='reviewed'`) and `scout_match_player_evidence`. Original audit documents predate owner approval: [first provisional audit](mh12-provisional-score-audit-20261124.md) and [official source crosswalk](mh12-official-source-reconciliation-20261124.md); this document supersedes their **status**, not their original evidence.

## Learning and calibration

- `scout_player_season_stats.through_gameweek=12`: 456/456 players. Updates cumulative playing minutes, starts, goals, assists, cards, saves, xG/xA where measured, season actual Fantasy points, 6+ counts. The 178 DNPs are **not** treated as successful model predictions in the aggregate MAE sample.
- `scout_team_season_stats.through_gameweek=12`: 18/18 teams. The 18 match-team source observations update goals scored/conceded, xG/xGA, shots and opponent shots on target. Historical deep PPDA retained where source is older, never invented.
- `scout_player_advanced_weekly` and `scout_verified_weekly_attack`: **266** directly observed player box metric rows (including 121 measured xG and 251 measured xA). Do not manufacture advanced metrics for 12 TFF-proven late substitutes who had provider-zero minutes; they retain historical source freshness labels. Exactly these twelve verified identities are guarded in the production `mh12OwnerApprovedAdvancedLagAccepted` function: 215, 220, 275, 284, 423, 428, 431, 443, 448, 515, 1372, 1504.
- Original immutable MH12 frozen forecast was created **2026-11-08 23:51:52 UTC**, run ID **`8cf7a178-22a3-4b04-9a1f-edcd8dc698af`**. MH12 was **closed** only after actuals became available (first match 2026-11-21 10:30 UTC). Source matching uses *frozen* predicted xFP/minutes; no post-kickoff run is substituted.
- `scout_backtest_players`: 456 recorded final actuals; `scout_backtest_weeks` status **closed**, `actual_count=456`, but MAE/calibration sample is **278 positive-minute players only**:
  - xFP MAE **1.9203**; minute MAE **25.5295**; xFP bias **-0.4788**; RMSE **2.8548**
  - 6+ Brier **0.1197**; Spearman (recorded rank correlation) **0.2953**, original top-25 overlap **5/25**.
  - No claim that a particular model learning action improved on an independently matched baseline; future closed weeks still required for those actions.

## MH13 preparation / safe promotion

- TFF official scheduled fixtures **317892–317900**, 9 matches, 18 clubs, kickoffs 27–30 November 2026, converted Istanbul-to-UTC correctly. E.g. Alanyaspor–Konyaspor 2026-11-27 17:00 UTC (20:00 Istanbul), Beşiktaş–Galatasaray 2026-11-30 18:00 UTC (21:00 Istanbul).
- Signed GitHub OIDC workflow: [MH13 new candidate 50K](https://github.com/ecetin1998/tff-fantezi/actions/runs/45282184894), candidate run **`d3ee6731-d0b0-426e-9e99-b1b33350cc06`**, benchmark `weekly-auto-mh13-4f1e0dbd-20261123224223`.
- Production source guards fixed in Supabase Edge Functions: `model-refresh-control` **v21** (12 explicit late-subs only) and `weekly-model-lifecycle` **v73** (recognizes the exact MH12 owner-approved independent `source_kind`, maintains frozen-week checks). CI: [source guard regression](https://github.com/ecetin1998/tff-fantezi/actions/runs/45281593873) successful.
- **50K QA and promotion MUST still pass independently**. A completed input stage does not mean the new run is ready/current. Do not manually promote or override failed release gates, and never rewrite the MH12 frozen predictions.

Reference: https://www.tff.org/Default.aspx?macId=317892&pageId=29 and all contiguous TFF official match reports through 317900 for MH13.
