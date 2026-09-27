begin;

create or replace function public.scout_enrichment_qa()
returns jsonb
language sql
stable
security invoker
set search_path='public'
as $qa$
with active as (
  select p.id,p.primary_role,
         s.xa_model_per90,s.xa_per90,s.attack_contribution_share
  from scout_players p
  left join scout_player_season_stats s
    on s.player_id=p.id and s.season='2026-27'
  where p.active=true
), teams as (
  select t.id,tp.coverage,tp.big_chances,tp.shots_on_target_per_match,
         tp.touches_in_opposition_box,tp.possession_percentage,tp.shot_conversion_rate
  from scout_teams t
  left join scout_team_tactical_profiles tp
    on tp.team_id=t.id and tp.season='2026-27'
  where t.active=true
)
select jsonb_build_object(
  'active_players',(select count(*) from active),
  'xa_model_covered',(select count(*) from active where xa_model_per90 is not null),
  'xa_observed_covered',(select count(*) from active where xa_per90 is not null),
  'xa_fallback_only',(select count(*) from active where xa_per90 is null and xa_model_per90 is not null),
  'attack_share_covered',(select count(*) from active where attack_contribution_share is not null),
  'detailed_role_covered',(select count(*) from active where primary_role not in ('DEF_UNKNOWN','MID_UNKNOWN','FWD_UNKNOWN')),
  'unknown_role',(select count(*) from active where primary_role in ('DEF_UNKNOWN','MID_UNKNOWN','FWD_UNKNOWN') or primary_role is null),
  'active_teams',(select count(*) from teams),
  'team_profile_covered',(select count(*) from teams where coverage is not null),
  'team_aggregate_profile_covered',(select count(*) from teams
    where big_chances is not null
      and shots_on_target_per_match is not null
      and touches_in_opposition_box is not null
      and possession_percentage is not null
      and shot_conversion_rate is not null),
  'team_event_profile_covered',(select count(*) from teams where coverage in ('partial_events','event_complete'))
);
$qa$;

grant execute on function public.scout_enrichment_qa() to anon,authenticated,service_role;

commit;
