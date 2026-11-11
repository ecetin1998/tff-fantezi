-- Recorded after Supabase migration verified_team_match_advanced_mh8_11.
-- Read-only source facts for replay and team season xG aggregation.
create table if not exists public.scout_verified_team_match_advanced (
 season text not null, gameweek integer not null check(gameweek between 1 and 38),
 match_id bigint not null,team_id bigint not null,
 opponent_team_id bigint not null check(opponent_team_id<>team_id),
 xg numeric not null check(xg between 0 and 10),
 xga numeric not null check(xga between 0 and 10),
 shots integer not null check(shots between 0 and 65),
 shots_on_target integer not null check(shots_on_target between 0 and shots),
 opponent_shots_on_target integer not null check(opponent_shots_on_target between 0 and 65),
 big_chances integer null check(big_chances between 0 and 40),
 big_chances_missed integer null check(big_chances_missed between 0 and 40),
 touches_in_opposition_box integer null check(touches_in_opposition_box between 0 and 300),
 set_piece_xg numeric null check(set_piece_xg between 0 and 10),
 possession_pct numeric null check(possession_pct between 0 and 100),
 keeper_saves integer null check(keeper_saves between 0 and 40),
 source_kind text not null, source_observed_at timestamptz not null,
 created_at timestamptz not null default now(),
 primary key(season,gameweek,match_id,team_id)
);
create index if not exists scout_verified_team_match_advanced_team_idx
 on public.scout_verified_team_match_advanced (season,team_id,gameweek);
alter table public.scout_verified_team_match_advanced enable row level security;
revoke all on table public.scout_verified_team_match_advanced from anon,authenticated;
grant select,insert,update,delete on public.scout_verified_team_match_advanced to service_role;
comment on table public.scout_verified_team_match_advanced is
 'Source-verified full-time per-team match facts with independent TFF fixture+kickoff checks; not fantasy scores or model outputs.';
