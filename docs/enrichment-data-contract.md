# Scout enrichment data contract

This layer adds **detailed football roles**, canonical **xA**, and **team tactical channels** without changing the fantasy scoring position.

## Player role

`scout_players.position` remains the fantasy position used for points and squad rules.

`primary_role` is the real on-pitch role:

- GK
- CB — stoper
- FB — full-back/bek
- WB — wing-back/kanat bek
- DM — ön libero
- CM — merkez orta saha
- AM — ofansif orta saha
- WM — kenar orta saha
- W — kanat
- SS — ikinci forvet
- ST — santrfor

Unknown placeholders are explicit (`DEF_UNKNOWN`, `MID_UNKNOWN`, `FWD_UNKNOWN`) so the model never invents a role. `role_side` stores L/C/R/BOTH/NA. The source and confidence are stored with the role.

## xA hierarchy

Observed current-season xA is stored separately from model fallback:

1. `xa_per90` / `xa_total`: observed current-season xA from an approved source.
2. `xa_model_per90`: model feature available for every active player.
3. If current observed xA is missing, fallback order is:
   - player-specific preseason prior;
   - position preseason prior;
   - zero only as a last-resort sentinel.

`v_scout_player_model_features.effective_xa_per90` shrinks small current-season samples toward the prior and becomes fully observed after 450 minutes.

Historical replay rows must snapshot `sub_role` and `effective_xa_per90` as they were known **before the target MH**. Never backfill replay inputs from today's data.

## Team tactical profile

`scout_team_tactical_profiles` always contains league-relative aggregate strength indices:

- attack xG strength
- defensive xGA strength
- shot volume
- opponent shots-on-target pressure

When approved event-level data exists, the same row also exposes:

- attack origin: left / center / right
- conceded attack origin: left / center / right
- goal zones: six-yard / box / outside box
- conceded goal zones
- set-piece and counter-attack goal shares

The raw event store is `scout_match_attack_events`. It is service-role only and is not exposed through the public API.

## Data ingestion

`ingest-scout-enrichment` accepts reviewed/licensed batches for roles, player advanced stats and attack events. It does **not** scrape a website itself. This keeps source licensing and provenance separate from the model.

After an import, the function refreshes team profiles and returns `scout_enrichment_qa()`.

## QA

`scout_enrichment_qa()` reports:

- active player count
- xA model coverage
- detailed role coverage / unknown-role count
- active team profile coverage
- event-level team coverage

Detailed role and event coverage are informational until an approved complete source is connected. Missing source data is shown as missing rather than fabricated.
