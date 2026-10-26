# MH9 result receipt and MH10 readiness — 27 October 2026

Source snapshot for season 2026–27. This is a provenance/accounting log,
**not** a claim that Fantasy scores, player minutes or official bonuses have
been ingested. Match results were reconciled with the public TFF match pages:
https://www.tff.org/?pageID=198 and `scout_match_external_ids`.

## Stage A: 9 MH9 football results — persisted (Fantasy OPEN)

| TFF match ID | Home | Away | Score |
|---:|---|---|---|
| 317858 | Alanyaspor | Kocaelispor | 1–2 |
| 317857 | Eyüpspor | Kasımpaşa | 0–1 |
| 317856 | Gaziantep | Erzurumspor | 1–3 |
| 317864 | Samsunspor | Amed | 1–2 |
| 317861 | Konyaspor | Gençlerbirliği | 2–0 |
| 317860 | Göztepe | Çorum FK | 2–0 |
| 317859 | Rizespor | Trabzonspor | 3–4 |
| 317863 | Beşiktaş | Başakşehir | 2–0 |
| 317862 | Galatasaray | Fenerbahçe | 2–1 |

Preflight asserted all nine IDs, nine home/away club matches, no prior score
conflicts, all nine corresponding local fixtures. Production results:
`scout_match_history` match_status=`Bitti` on nine; local `fixtures`
is_finished=true on nine. Crucially `fantasy_closure='Puan doğrulaması bekliyor'`
on all nine. **No fantasy point or player-minute actuals inserted.**

Each independently verifiable TFF match detail:
`https://www.tff.org/Default.aspx?macID=317858&pageID=29`
(substitute the listed TFF match ID).

## Stage B: 9 MH10 fixture rows — persisted, no promotion

MH10 fixtures in `fixtures` were linked to nine new, source-labelled
`scout_match_history` rows and `scout_match_external_ids` TFF maps
(ID 317865–317873), with accurate local time converted from
`Europe/Istanbul`; zero scored games, 18 unique clubs, all results NULL.
Scheduled 30 Oct–2 Nov; earliest Konyaspor–Galatasaray 30 Oct 20:00 local.
No MH10 model run, 50K, optimizer or publication was performed.

## Stage C: unresolved external official/fact-backed fantasy source

At audit time production lacked **all** of:
- MH9 `scout_player_weekly_points` (0/456 active players, zero final rows).
- MH9 `scout_player_advanced_weekly`, `scout_verified_weekly_attack`,
  `scout_match_attack_events` (all zero).
- `scout_team_season_stats` through MH9 (0/18).
- `scout_player_season_stats` through MH9 (0/456).
- The `SCOUT_INGEST_URL` upstream configuration:
  hourly signed run 40385679988 logged `upstream_configured:false` and
  `upstream_called:false` while returning GitHub job success.

**Never** treat green CI, football full-time result, team clean sheet, or
lack of stat observations as final TFF Fantasy data. Do not infer missing
player points, minutes, bonuses or score zeros from a player missing from
an external list. The valid `fresh_closed_actual` source_kind must
identify independently sourced full-week official score facts; the special
MH8 independently-calculated exception must not be relabelled as official
MH9 actuals. Unknown stats remain NULL. A third-party calculated points
dataset is not an official export.

## Source requirement before MH9→MH10

1. Acquire legitimate **complete and independent official Fantasy weekly**
   source: nine fixture sheets and identities; all active squad players
   (including verified nonparticipants), minutes, points, base, bonus,
   GK saves, cards, goals, assists and own-goal corrections. Securely
   obtain via the site's authenticated export/account or permitted provider.
2. Validate 9 distinct match IDs, at least 22 source-linked players
   in each fixture, 456 unique active player final rows with consistent
   identity/team and source timestamps; reject ambiguous names and
   inconsistent bonus/points.
3. Import exact verified actuals with `source_kind='fresh_closed_actual'`;
   close nine Fantasy rows only after point QA, then generate 18 team and
   456 player season-stats rollups through MH9.
4. Lifecycle `sourceStatus.complete_current && target_ready` must
   pass from real data; `close_backtest` compares to the **original**
   frozen MH9 pre-kickoff prediction run
   `932bfe0d-2fbe-4c44-8e79-ee4c4766975d`.
5. Prepare MH10 → run 50K NB2 → validate 18 teams/456 players/9 matches,
   role shares/CS and goal-assist allocation → optimize → promote if green.
   Save five user squads (75 players) untouched.

Project source-of-truth for current active run remains MH9
(`c1c64b5f-a602-4743-b994-969035042209` at receipt). Never manually
flip `is_current` or claim public MH10 until all gates and site tests pass.

The GitHub workflow now emits a per-run, human-readable source readiness
summary, rather than concealing missing official Fantasy data behind a
successful scheduler exit status.
