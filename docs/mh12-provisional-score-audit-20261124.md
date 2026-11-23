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
| Conceded-goal windows awaiting *independent* full-match confirmation | 57 (14 GK + 43 full-duration DEF proxies) |
| Cross-checked scorer goals | 27 |
| Provisional assists | 19 |
| Calculated bonus points (NOT official bonus decisions) | 81 |
| Total provisional player fantasy points (after verified event-window corrections) | 733 |

**Do not use the 190 candidate zero-minute rows as successful DNP predictions or independent model evidence.** The Highlightly box is known to omit two late goals; extra-time minute observations and match-specific goal-concession timing are not fully trustworthy. Bonus tiers are inferred from estimated base points, not an official published player score export. Own-goal/penalty completeness still requires independent adjudication.

## Release gate (NOT MET)

1. Verify all 456 player identities and appearances / non-appearances independently, including the four unmatched positive-minute provider players and complete substitution evidence.
2. Verify minutes and on-pitch conceded goals against final full-time events, reconcile cards, goal assists, saves, own goals and penalties; separately verify awarded tie-aware match bonuses or obtain actual TFF Fantasy point export.
3. Only then create clearly labelled independent final source records with explicit owner authorization and individual provenance, run full QA and `scout_week_closure_status(12)`.
4. Close original immutable, pre-kickoff frozen MH12 backtest; preserve its actual code SHA and prohibit post-kickoff leakage. Do not promote MH13 unless full MH12 closure and season-stat freshness gates all pass.

As of this audit: **`scout_player_weekly_points` MH12 has 0 final rows, `scout_backtest_weeks` MH12 is `open`, the currently published model remains MH12.** The 9 MH13 fixtures exist, but MH13 has not been activated.

## Deeper source reconciliation — 24 November 2026

**Week release is still blocked; all rows remain `status=provisional`, not final.** These updates were applied only to `scout_independent_score_candidates` with a source URL and an uncertainty note for each affected player. No final `scout_player_weekly_points` rows or new model/backtest releases were written.

### 1. Nonparticipation/DNP audit

All 18 team sheets have eleven listed starters each. Across the 456 Fantasy roster, 190 players have an estimated 0-minute candidate. **89** appear by provider ID on the verified match-sheet bench, with 0 minutes in the separate Highlightly box feed. The remaining **101** are not on the provider's match sheet; they should not be labelled source-confirmed DNP without an independent official match sheet. Source-only verification is not independent DNP proof, and these 190 zero rows must not improve model accuracy metrics.

### 2. Minute-clock audit

**42** roster players have raw provider match-clock minute values over 90 (91, 94, 96), all already capped to 90 for provisional Fantasy scoring. The source clock is inconsistent in the opposite direction too: all players still in the match sometimes receive 81, 82, 88 or 89 instead of 90, even when both starting goalkeepers have the same apparent match length and no goalkeeper change is recorded.

Using complete lineup, box-score and goalkeeper duration matching, **125** mapped played starters share the uninterrupted goalkeeper's provider full-match time: 38 raw over 90, 12 exactly 90, and 75 raw between 61 and 89. The **75** provisional candidate minute values were changed to the *inferred* normalized 90 with explicit `fullmatch_90_minute_inferred_from_lineup` uncertainty flags; this changed **zero** Fantasy point components. These values remain ineligible as *independently verified minute ground truth* until matched to match reports/substitution timelines.

### 3. Defender/GK on-pitch concessions

Of the initial **78** positive-minute, conceded-goal GK/DEF rows, **21** substitution-exposed players were checked against independent goal and substitution chronology.

Nine provisional players had an incorrect whole-team concession penalty and were corrected, **+10 provisional base points total** (no bonus-tier changes):

| Match | Player | Source-supported on-pitch goals conceded | Old penalty | Corrected penalty |
|---|---|---:|---:|---:|
| Amed–Rizespor | Amadou Cissé | 1 | -1 | 0 |
| Başakşehir–Çorum | Emin Bayram | 0 | -1 | 0 |
| Başakşehir–Çorum | Onur Bulut | 1 | -1 | 0 |
| Başakşehir–Çorum | Sebastian Andrei Borza | 1 | -2 | 0 |
| Başakşehir–Çorum | Cemali Sertel | 3 | -2 | -1 |
| Kocaelispor–Fenerbahçe | Emir Ortakaya | 1 | -1 | 0 |
| Kocaelispor–Fenerbahçe | Mert Müldür | 0 | -1 | 0 |
| Konyaspor–Beşiktaş | Ahmet Oğuz | 2 | -2 | -1 |
| Konyaspor–Beşiktaş | Yhoan Andzouana | 2 | -2 | -1 |

Another twelve player windows were source-reviewed with **no change** to their Fantasy points: Orhan Ovacıklı, Guram Giorbelidze, Festy Ebosele, Eren Elmalı, Kazımcan Karataş, Kerim Çalhanoğlu, Leo Abena, Sabahattin Destici, Adem Arous, Ömer Bayram, Levent Mercan, Yiğit Demir.

The remaining **57** conceded-goal rows are 14 uninterrupted goalkeepers + 43 defenders with full-match duration equal to the source goalkeeper clock. Their point components are plausible but still flagged because source-aligned full duration alone is not independent 90-minute proof.

Independent chronology:
- Amed–Rizespor: https://beinsports.com.tr/haber/amedspor-caykur-rizespor
- Başakşehir–Çorum: https://www.aa.com.tr/tr/spor/istanbul-basaksehirden-geri-donusle-4-gollu-galibiyet/4135036
- Erzurumspor–Göztepe: https://www.dha.com.tr/foto-galeri/erzurumspor-fk-goztepe-0-1-2986534
- Galatasaray–Samsunspor: https://www.galatasaray.org/haber/futbol/galatasaray-2-1-samsunspor/61429
- Gençlerbirliği–Gaziantep: https://gaziantepfk.org/haberler/mac-sonucu-genclerbirligi-1-0-gaziantep-fk
- Kasımpaşa–Alanyaspor: https://www.aa.com.tr/tr/spor/kasimpasa-konuk-ettigi-alanyasporu-yendi/4133622
- Kocaelispor–Fenerbahçe: https://beinsports.com.tr/haber/kocaelispor-fenerbahce-2
- Konyaspor–Beşiktaş: https://www.konyaspor.org.tr/haber/tumosan-konyasporumuz-2-4-besiktas2811
- Trabzonspor–Eyüpspor: https://www.dha.com.tr/spor/trabzonspor-eyupspor-1-0-2986669

### 4. Outside-roster and bonus audit

Four source-positive players were explicitly identified but are not mapped to any of the active 456 Fantasy IDs: Arda Çağan Çelik (Gençlerbirliği, 96 raw minutes, one yellow), Ahmet Taha Dağbaşı (Kasımpaşa, 16), Kutlay Satli Berhan (Eyüpspor, 15), Musa Eren Karakaş (Eyüpspor, 4). Their estimated base scores were included when rechecking match-wide bonus tier ranking; **no Fantasy roster player's provisional bonus changed**, and their identities were never incorrectly mapped.

All **456** provisional candidates pass the base-component and total-point arithmetic constraints; all 190 candidate zero-minute rows have zero calculated points. Total is now **652 base + 81 tie-aware provisional bonuses = 733**. The provisional table covers 27 goals and 19 assists.

As an **independent partial cross-check, not official TFF confirmation**, the first two match-days' sixteen named top scorers and their individual points exactly matched the day-by-day lists from FanteFut (7 first day, 9 second day): https://www.sotwe.com/fantefutcom?lang=en . This does not verify the other 440 player outcomes or official bonus allocations.

### Final closure guard

`scout_week_closure_status(12)` still reports `pass=false` (9 finished matches, 0 closed Fantasy matches, 0 final weekly player rows). `scout_backtest_weeks` MH12 remains `open`. This report does **not** authorize converting the provisional 733 into final actuals or creating MH13 leakage-prone training data. For full closure, independent confirmed DNP, exact playing minutes, saves, own goals/penalties, and a final official or separately owner-approved, source-verified weekly points ledger remain necessary.
