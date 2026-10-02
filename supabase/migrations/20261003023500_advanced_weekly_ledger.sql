create table if not exists public.scout_player_advanced_baseline (
  season text not null,
  player_id bigint not null references public.scout_players(id) on delete cascade,
  through_gameweek integer not null,
  shots integer not null default 0,
  shots_on_target integer not null default 0,
  key_passes integer not null default 0,
  crosses integer not null default 0,
  successful_crosses integer not null default 0,
  takeons integer not null default 0,
  successful_takeons integer not null default 0,
  primary key(season,player_id)
);
create table if not exists public.scout_player_advanced_weekly (
  season text not null,
  gameweek integer not null,
  player_id bigint not null references public.scout_players(id) on delete cascade,
  shots integer not null default 0,
  shots_on_target integer not null default 0,
  key_passes integer not null default 0,
  crosses integer not null default 0,
  successful_crosses integer not null default 0,
  takeons integer not null default 0,
  successful_takeons integer not null default 0,
  source text not null,
  source_updated_at timestamptz not null default now(),
  primary key(season,gameweek,player_id)
);
insert into public.scout_player_advanced_baseline(season,player_id,through_gameweek,shots,shots_on_target,key_passes,crosses,successful_crosses,takeons,successful_takeons)
select season,player_id,coalesce(advanced_through_gameweek,5),coalesce(shots,0),coalesce(shots_on_target,0),coalesce(key_passes,0),coalesce(crosses,0),coalesce(successful_crosses,0),coalesce(takeons,0),coalesce(successful_takeons,0)
from public.scout_player_season_stats
where season='2026-27' and coalesce(advanced_through_gameweek,0)<=5
on conflict(season,player_id) do nothing;
alter table public.scout_player_advanced_baseline enable row level security;
alter table public.scout_player_advanced_weekly enable row level security;
revoke all on public.scout_player_advanced_baseline from anon,authenticated;
revoke all on public.scout_player_advanced_weekly from anon,authenticated;
