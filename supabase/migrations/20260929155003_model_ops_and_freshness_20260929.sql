begin;

alter table public.scout_goal_distribution_config
  add column if not exists alpha_raw double precision,
  add column if not exists alpha_used double precision;

update public.scout_goal_distribution_config
set alpha_raw=0.336748339592528,
    alpha_used=0.168374169796264
where version='goal-dist-v1'
  and distribution='NB2'
  and trained_through=6;

alter table public.scout_model_runs
  add column if not exists source_cutoff timestamptz,
  add column if not exists input_snapshot_hash text,
  add column if not exists code_sha text,
  add column if not exists config_version text;

create index if not exists scout_user_squad_snapshots_captain_id_idx
  on public.scout_user_squad_snapshots(captain_id);
create index if not exists scout_user_squad_snapshots_gameweek_idx
  on public.scout_user_squad_snapshots(gameweek);
create index if not exists scout_weekly_lifecycle_candidate_run_id_idx
  on public.scout_weekly_lifecycle(candidate_run_id);
create index if not exists scout_weekly_lifecycle_source_run_id_idx
  on public.scout_weekly_lifecycle(source_run_id);

create or replace view public.v_scout_public_freshness
with (security_invoker=true)
as
with current_run as (
  select id,gameweek,generated_at,source_updated_at
  from public.scout_model_runs
  where is_current=true
  order by generated_at desc
  limit 1
)
select
  r.id run_id,
  r.gameweek,
  r.generated_at model_generated_at,
  r.source_updated_at model_source_updated_at,
  (select max(a.checked_at) from public.scout_availability a where a.run_id=r.id) availability_checked_at,
  (select max(s.updated_at) from public.scout_player_season_stats s where s.season='2026-27' and s.through_gameweek<=greatest(r.gameweek-1,0)) player_stats_updated_at,
  (select max(s.source_updated_at) from public.scout_team_season_stats s where s.through_gameweek<=greatest(r.gameweek-1,0)) team_stats_updated_at,
  (select max(h.source_updated_at) from public.scout_match_history h where h.season='2026-27' and h.gameweek=r.gameweek) fixture_updated_at,
  (select max(w.source_updated_at) from public.scout_player_weekly_points w where w.gameweek<r.gameweek and w.is_final=true) weekly_points_updated_at
from current_run r;

revoke all on table public.v_scout_public_freshness from anon,authenticated;
grant select on table public.v_scout_public_freshness to anon,authenticated;

commit;
