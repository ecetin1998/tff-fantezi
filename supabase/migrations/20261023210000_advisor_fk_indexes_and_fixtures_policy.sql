-- Performance advisor: cover the 14 unindexed foreign keys (mostly draft-room
-- tables used by live draft RPCs) and drop the redundant fixtures deny policy.
-- Tables are small (<500 rows), so plain CREATE INDEX holds locks only briefly.

create index if not exists scout_draft_auction_bids_room_id_idx on public.scout_draft_auction_bids (room_id);
create index if not exists scout_draft_auction_bids_team_id_idx on public.scout_draft_auction_bids (team_id);
create index if not exists scout_draft_auction_lots_leader_team_id_idx on public.scout_draft_auction_lots (leader_team_id);
create index if not exists scout_draft_auction_lots_player_id_idx on public.scout_draft_auction_lots (player_id);
create index if not exists scout_draft_hidden_rooms_room_id_idx on public.scout_draft_hidden_rooms (room_id);
create index if not exists scout_draft_lineups_captain_player_id_idx on public.scout_draft_lineups (captain_player_id);
create index if not exists scout_draft_lineups_team_id_idx on public.scout_draft_lineups (team_id);
create index if not exists scout_draft_picks_player_id_idx on public.scout_draft_picks (player_id);
create index if not exists scout_draft_picks_team_id_idx on public.scout_draft_picks (team_id);
create index if not exists scout_draft_rooms_model_run_id_idx on public.scout_draft_rooms (model_run_id);
create index if not exists scout_match_external_ids_internal_match_season_idx on public.scout_match_external_ids (internal_match_id, season);
create index if not exists scout_player_advanced_baseline_player_id_idx on public.scout_player_advanced_baseline (player_id);
create index if not exists scout_player_advanced_weekly_player_id_idx on public.scout_player_advanced_weekly (player_id);
create index if not exists scout_verified_weekly_attack_player_id_idx on public.scout_verified_weekly_attack (player_id);

-- fixtures had both "browser deny all" (ALL, using false) and
-- fixtures_public_read (SELECT, using true). Permissive policies are OR'ed,
-- so the deny never restricted reads; writes stay denied because no write
-- policy exists for anon/authenticated once it is gone.
drop policy if exists "browser deny all" on public.fixtures;
