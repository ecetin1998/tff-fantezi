# MH12 — Independent provisional fantasy scoring audit (2026-11-24)

**NOT A FINAL / OFFICIAL FANTASY POINT EXPORT.** No scores from this audit are eligible for training, closed-week accuracy, automatic MH13 model advancement, or the public points view.

## Observed and source-checked

- 2026–27 MH12: nine full-time matches, nine scored fixtures, and all nine Highlightly match box / lineup / team-stat packages ingested. The football results in `scout_match_history` are confirmed; `fantasy_closure` remains `PUAN KONTROLÜ BEKLENİYOR`.
- Source box has 373 match-player records, 355 mapped to the 456 active Fantasy roster, and four *playing* participants who are not mapped to that roster.
- Missing source goal components were corrected **only in independent, explicitly partial** `scout_match_player_evidence`: Bertuğ Özgür Yıldırım 3 goals instead of Highlightly 2 (Başakşehir–Çorum, match 34038); Václav Černý 1 goal instead of 0 (Konyaspor–Beşiktaş, match 34044).
- Corresponding confirmed goal assists corrected in the same partial evidence table: Michał Karbownik 1 and Amir Murillo 1.
- Source examples: https://www.aa.com.tr/tr/spor/istanbul-basaksehirden-geri-donusle-4-gollu-galibiyet/4135036 ; https://www.fotmob.com/tr/matches/basaksehir-vs-corum-fk/tmysb3a ; https://beinsports.com.tr/haber/tumosan-konyaspor-besiktas-4.
- Fantezi scoring rules: https://tfffantezilig.com/yardim?tab=kurallar-1

## Temporary calculation, no production release

The separate private table `public.scout_independent_score_candidates` contains exactly **456** provisional rows for MH12, `source_kind='mh12_highlightly_independent_provisional'`, `status='provisional'`. The arithmetic/reconciliation guard passes.

| Metric | Temporary result |
|---|---:|
| Source-observed roster players with positive minutes | 266 |
| Source-positive playing players not mapped to Fantasy pool | 4 |
| Roster players with 0-minute *candidate*, **not verified DNP** | 190 |
| Of those with no provider player record | 101 |
| Of those with explicit 0 in box | 89 |
| Source minutes over 90 normalized for provisional calculations only | 42 |
| On-pitch conceded-goal windows still not proven | 78 |
| Cross-checked scorer goals | 27 |
| Provisional assists | 19 |
| Calculated bonus points (NOT official bonus decisions) | 81 |
| Total provisional player fantasy points | 723 |

**Do not use the 190 candidate zero-minute rows as successful DNP predictions or independent model evidence.** The Highlightly box is known to omit two late goals; extra-time minute observations and match-specific goal-concession timing are not fully trustworthy. Bonus tiers are inferred from estimated base points, not an official published player score export. Own-goal/penalty completeness still requires independent adjudication.

## Release gate (NOT MET)

1. Verify all 456 player identities and appearances / non-appearances independently, including the four unmatched positive-minute provider players and complete substitution evidence.
2. Verify minutes and on-pitch conceded goals against final full-time events, reconcile cards, goal assists, saves, own goals and penalties; separately verify awarded tie-aware match bonuses or obtain actual TFF Fantasy point export.
3. Only then create clearly labelled independent final source records with explicit owner authorization and individual provenance, run full QA and `scout_week_closure_status(12)`.
4. Close original immutable, pre-kickoff frozen MH12 backtest; preserve its actual code SHA and prohibit post-kickoff leakage. Do not promote MH13 unless full MH12 closure and season-stat freshness gates all pass.

As of this audit: **`scout_player_weekly_points` MH12 has 0 final rows, `scout_backtest_weeks` MH12 is `open`, the currently published model remains MH12.** The 9 MH13 fixtures exist, but MH13 has not been activated.
