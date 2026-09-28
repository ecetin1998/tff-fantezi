begin;

alter table public.scout_team_tactical_profiles
  add column if not exists advanced_profile_through_gameweek integer,
  add column if not exists advanced_profile_matches integer,
  add column if not exists advanced_profile_source text,
  add column if not exists possession_avg numeric,
  add column if not exists touches_in_box_per_match numeric,
  add column if not exists shot_accuracy numeric,
  add column if not exists xg_per_shot numeric,
  add column if not exists set_piece_xg_per_match numeric,
  add column if not exists set_piece_xg_share numeric,
  add column if not exists crosses_per_match numeric,
  add column if not exists cross_success_rate numeric,
  add column if not exists takeons_per_match numeric,
  add column if not exists takeon_success_rate numeric,
  add column if not exists chances_created_per_match numeric,
  add column if not exists ppda_avg numeric,
  add column if not exists big_chances_missed_per_match numeric,
  add column if not exists opponent_touches_in_box_per_match numeric,
  add column if not exists opponent_shots_per_match numeric,
  add column if not exists opponent_set_piece_xg_per_match numeric,
  add column if not exists opponent_set_piece_xg_share numeric,
  add column if not exists opponent_crosses_per_match numeric,
  add column if not exists opponent_takeons_per_match numeric,
  add column if not exists inferred_attack_left_share numeric,
  add column if not exists inferred_attack_center_share numeric,
  add column if not exists inferred_attack_right_share numeric,
  add column if not exists inferred_conceded_left_share numeric,
  add column if not exists inferred_conceded_center_share numeric,
  add column if not exists inferred_conceded_right_share numeric,
  add column if not exists channel_method text,
  add column if not exists channel_sample_actions integer,
  add column if not exists conceded_channel_sample_actions integer;

alter table public.scout_team_tactical_profiles drop constraint if exists scout_team_tactical_profiles_advanced_gw_check;
alter table public.scout_team_tactical_profiles
  add constraint scout_team_tactical_profiles_advanced_gw_check
  check(advanced_profile_through_gameweek is null or advanced_profile_through_gameweek between 0 and 34);

alter table public.scout_team_tactical_profiles drop constraint if exists scout_team_tactical_profiles_share_bounds_check;
alter table public.scout_team_tactical_profiles
  add constraint scout_team_tactical_profiles_share_bounds_check
  check(
    (shot_accuracy is null or shot_accuracy between 0 and 1)
    and (set_piece_xg_share is null or set_piece_xg_share between 0 and 1)
    and (cross_success_rate is null or cross_success_rate between 0 and 1)
    and (takeon_success_rate is null or takeon_success_rate between 0 and 1)
    and (opponent_set_piece_xg_share is null or opponent_set_piece_xg_share between 0 and 1)
    and (inferred_attack_left_share is null or inferred_attack_left_share between 0 and 1)
    and (inferred_attack_center_share is null or inferred_attack_center_share between 0 and 1)
    and (inferred_attack_right_share is null or inferred_attack_right_share between 0 and 1)
    and (inferred_conceded_left_share is null or inferred_conceded_left_share between 0 and 1)
    and (inferred_conceded_center_share is null or inferred_conceded_center_share between 0 and 1)
    and (inferred_conceded_right_share is null or inferred_conceded_right_share between 0 and 1)
  );

grant select(
  advanced_profile_through_gameweek,advanced_profile_matches,advanced_profile_source,
  possession_avg,touches_in_box_per_match,shot_accuracy,xg_per_shot,
  set_piece_xg_per_match,set_piece_xg_share,crosses_per_match,cross_success_rate,
  takeons_per_match,takeon_success_rate,chances_created_per_match,ppda_avg,
  big_chances_missed_per_match,opponent_touches_in_box_per_match,
  opponent_shots_per_match,opponent_set_piece_xg_per_match,opponent_set_piece_xg_share,
  opponent_crosses_per_match,opponent_takeons_per_match,
  inferred_attack_left_share,inferred_attack_center_share,inferred_attack_right_share,
  inferred_conceded_left_share,inferred_conceded_center_share,inferred_conceded_right_share,
  channel_method,channel_sample_actions,conceded_channel_sample_actions
) on public.scout_team_tactical_profiles to anon,authenticated;

create or replace function public.scout_team_profile_qa()
returns jsonb
language sql
stable
security invoker
set search_path='public'
as $qa$
with p as (
  select *
  from scout_team_tactical_profiles
  where season='2026-27'
)
select jsonb_build_object(
  'teams',count(*),
  'aggregate_covered',count(*) filter(where attack_strength_index is not null and defense_strength_index is not null),
  'advanced_covered',count(*) filter(where advanced_profile_matches>0),
  'channel_inferred_covered',count(*) filter(
    where inferred_attack_left_share is not null
      and inferred_attack_center_share is not null
      and inferred_attack_right_share is not null
      and inferred_conceded_left_share is not null
      and inferred_conceded_center_share is not null
      and inferred_conceded_right_share is not null
  ),
  'observed_event_covered',count(*) filter(where coverage in ('partial_events','event_complete')),
  'invalid_attack_share',count(*) filter(
    where inferred_attack_left_share is not null
      and abs(
        inferred_attack_left_share+inferred_attack_center_share+inferred_attack_right_share-1
      )>.01
  ),
  'invalid_conceded_share',count(*) filter(
    where inferred_conceded_left_share is not null
      and abs(
        inferred_conceded_left_share+inferred_conceded_center_share+inferred_conceded_right_share-1
      )>.01
  )
)
from p;
$qa$;

grant execute on function public.scout_team_profile_qa() to anon,authenticated,service_role;

commit;
