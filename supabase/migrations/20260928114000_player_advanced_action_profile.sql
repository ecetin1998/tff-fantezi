begin;

alter table public.scout_player_season_stats
  add column if not exists crosses integer,
  add column if not exists successful_crosses integer,
  add column if not exists takeons integer,
  add column if not exists successful_takeons integer,
  add column if not exists shot_share numeric,
  add column if not exists chance_creation_share numeric,
  add column if not exists advanced_source text,
  add column if not exists advanced_through_gameweek integer;

alter table public.scout_player_season_stats
  drop constraint if exists scout_player_season_stats_action_share_check;
alter table public.scout_player_season_stats
  add constraint scout_player_season_stats_action_share_check
  check(
    (shot_share is null or shot_share between 0 and 1)
    and (chance_creation_share is null or chance_creation_share between 0 and 1)
    and (advanced_through_gameweek is null or advanced_through_gameweek between 0 and 34)
  );

grant select(
  crosses,successful_crosses,takeons,successful_takeons,
  shot_share,chance_creation_share,advanced_source,advanced_through_gameweek
) on public.scout_player_season_stats to anon,authenticated;

create or replace function public.scout_player_enrichment_qa()
returns jsonb
language sql
stable
security invoker
set search_path='public'
as $qa$
with active as (
  select p.id,p.team_id,s.minutes,s.xa_per90,s.xa_model_per90,
         s.shots,s.shots_on_target,s.key_passes,s.crosses,s.successful_crosses,
         s.takeons,s.successful_takeons,s.shot_share,s.chance_creation_share,
         s.advanced_through_gameweek
  from scout_players p
  left join scout_player_season_stats s
    on s.player_id=p.id and s.season='2026-27'
  where p.active=true
), sums as (
  select team_id,
         sum(coalesce(shot_share,0)) shot_share_sum,
         sum(coalesce(chance_creation_share,0)) chance_share_sum
  from active
  group by team_id
)
select jsonb_build_object(
  'active_players',(select count(*) from active),
  'xa_model_covered',(select count(*) from active where xa_model_per90 is not null),
  'xa_observed_covered',(select count(*) from active where xa_per90 is not null),
  'shots_covered',(select count(*) from active where shots is not null),
  'sot_covered',(select count(*) from active where shots_on_target is not null),
  'key_passes_covered',(select count(*) from active where key_passes is not null),
  'crosses_covered',(select count(*) from active where crosses is not null),
  'takeons_covered',(select count(*) from active where takeons is not null),
  'advanced_gw5_covered',(select count(*) from active where advanced_through_gameweek>=5),
  'bad_shot_share_teams',(select count(*) from sums where shot_share_sum>0 and abs(shot_share_sum-1)>.01),
  'bad_chance_share_teams',(select count(*) from sums where chance_share_sum>0 and abs(chance_share_sum-1)>.01)
);
$qa$;

grant execute on function public.scout_player_enrichment_qa()
to anon,authenticated,service_role;

commit;
