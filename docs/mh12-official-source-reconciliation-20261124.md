# MH12 – TFF official source reconciliation, 24 November 2026

This is a **source audit of provisional Fantasy points, not permission to treat them as final actuals**. All data changes described here were applied only to `scout_independent_score_candidates` or `scout_match_player_evidence`; the release/backtest gates remain intact.

## Source base and counts

Nine TFF official match reports were accessed and reconciled with 9 scored Highlightly matches. TFF IDs 317883–317891 are MH12 reports, mapped by match/team. These report **198 starters** and **178 named substitutes**; 373/376 entries have a Highlightly source record (three extra TFF-only reserves: Ömer Doğan, Emir Arslan, Halil İbrahim Balta). Source records were mapped by *match, team, current match jersey and TFF person*, **never** `scout_players.shirt_number`, which is stale for many players. Four positive-minute Highlightly participants are outside the active 456-player Fantasy pool (Arda Çağan Çelik, Ahmet Taha Dağbaşı, Kutlay Satli Berhan, Musa Eren Karakaş), and were never assigned to false Fantasy IDs.

**DNP and appearance:** 178 fantasy-roster players were explicitly classified as 0-minute *with independent official sheet evidence*, separating the non-selected squad cases from the unused substitutes. The initially incorrect 12 zero-minute roster cases were independently found in official TFF substitution entries and assigned only a **provisional** participation point (+12 across candidates); inferred exact minute counts remain labelled. There are now 278 provisional active participants and 178 zero-minute candidates.

**Defensive conceded-goal windows:** 21 substitution-sensitive cases were matched against independent goal/substitution timelines, including 9 point corrections for +10 provisional points. The remaining 57 full-match GK/DEF cases were validated against TFF official XI/outgoing event logs (45 + the special Agbadou 88th-minute departure) or independently published completed substitutions in Başakşehir–Çorum and Trabzonspor–Eyüpspor (11). No `on_pitch_concession_window_unverified` flag remains.

**Minute clock:** Highlightly raw match-clock observations (81,82,88,89,94,96, etc.) do not consistently mean individual played time. A first pass normalized 75 apparent full-match players to 90 only in provisional calculations, and corrected 9 official substitution exits (8 shortened, one confirmed 90). The remaining full-match cases were confirmed against official TFF outgoing lists or full independent match timelines; `fullmatch_90_minute_inferred_from_lineup` flags reached 0. Some *non-full-match* players still retain `highlightly_box_provisional` minutes; exact playing-time ground truth is not complete.

**GK saves:** Additional source comparisons detected Uğurcan Çakır 6 vs provider 5, crossing a 3-save Fantasy scoring threshold (+1 point). Zafer Görgen 7 vs provider 6 and Alexander Nübel 4 vs provider 3 were also independently noted; neither crosses a Fantasy save-point threshold. Other provider shot-on-target minus goals inconsistencies were **not** blindly used as save corrections because individual shots can be recorded differently; disagreements require corroboration.

**Cards:** TFF official yellow-card list versus provider revealed 7 mismatches across 7 completed TFF event logs: Mehmet Yeşil, Cengiz Umut Meraş, Emrecan Bulut, Metehan Altunbaş, Fabio Miretti and Amir Murillo were missing yellow cards in provider data (corrected -6 provisional points). Fidan Aliti had provider yellow while omitted from TFF page; other independently published match timelines report his 39th-minute yellow, so his provider-card value was **preserved**, not falsely cleared. TFF official cards are therefore not assumed infallible. Başakşehir–Çorum and Trabzonspor–Eyüpspor external finished timelines independently cover the other two reports.

**Goals:** TFF seven finished match event logs account for the expected scorers in those seven games (20 goals, with three explicitly shown as penalties, no TFF-labeled own goals). The other two games' goal and assist discrepancies (Bertuğ Yıldırım 3 goals/Michał Karbownik assist; Václav Černý goal/Amir Murillo assist) were reconciled against separate full-time match sources and stored in `scout_match_player_evidence`.

## Provisional ledger checkpoint

At 2026-11-23 22:17 UTC, the private `scout_independent_score_candidates` ledger contained **456 distinct provisional rows** (278 played, 178 source-confirmed DNP candidates). **659 base + 81 calculated match bonuses = 740 provisional points**. All per-row arithmetic constraints and no-play/no-point constraints passed; the tie-aware provisional bonus recomputation, including four source-positive outside-pool players, found no allocation difference.

These numbers are a *calculation checkpoint* and may change following newer source adjudication. The 81 bonus points are a **rules-based computed estimate**, not an official published bonus allocation. A small public independent FanteFut sample previously matched 16 top scorers but cannot authenticate all 456 final scores.

## Release gate – remains blocked

- `scout_player_weekly_points` MH12 **0 independently certified final rows**.
- `scout_week_closure_status(12).pass = false`; 9 finished/scored games but 0 fantasy-closed.
- `scout_backtest_weeks` MH12 remains `open`; its pre-kickoff frozen snapshot/code SHA must never be overwritten.
- User requested independent calculation, but unresolved **official bonus/tie adjudication**, some source-only substituted player minute precision and any remaining match-event discrepancies should not be silently replaced with invented official values.
- MH13 fixtures exist but *no MH13 production promotion* is authorized until a genuinely source-verified completed final ledger and QA gate exists.
- The `test/mh12-provisional-close-source-guard.test.mjs` guard rejects provisional sources masquerading as final actuals.

## Primary links

Official TFF match reports:
- [Amed–Rizespor](https://www.tff.org/Default.aspx?macId=317886&pageId=29)
- [Trabzonspor–Eyüpspor](https://www.tff.org/Default.aspx?macId=317883&pageId=29)
- [Kasımpaşa–Alanyaspor](https://www.tff.org/Default.aspx?macId=317884&pageId=29)
- [Başakşehir–Çorum](https://www.tff.org/Default.aspx?macId=317885&pageId=29)
- [Gençlerbirliği–Gaziantep](https://www.tff.org/Default.aspx?macId=317887&pageId=29)
- [Konyaspor–Beşiktaş](https://www.tff.org/Default.aspx?macId=317888&pageId=29)
- [Galatasaray–Samsunspor](https://www.tff.org/Default.aspx?macId=317889&pageId=29)
- [Kocaelispor–Fenerbahçe](https://www.tff.org/Default.aspx?macId=317890&pageId=29)
- [Erzurumspor–Göztepe](https://www.tff.org/Default.aspx?macId=317891&pageId=29)

Independent finished-event sources:
- [Başakşehir–Çorum complete event timeline](https://www.rotascore.com/tr/match/basaksehir-corum/4jwq2ghnypjpm0v)
- [Trabzonspor–Eyüpspor substitutions](https://www.fotmob.com/tr/matches/eyupspor-vs-trabzonspor/1q0s6h)
- [Konyaspor–Beşiktaş goals](https://www.haberler.com/spor/canli-anlatim/konyaspor-besiktas-1878394/)
- [Galatasaray–Samsunspor Uğurcan saves](https://www.haberler.com/spor/galatasaray-taraftari-yildiz-isim-icin-o-20449480-haberi/)
