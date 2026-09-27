begin;

-- Detailed on-pitch role. Fantasy position remains the scoring position and is never changed here.
alter table public.scout_players
  add column if not exists primary_role text,
  add column if not exists role_side text,
  add column if not exists role_source text,
  add column if not exists role_confidence numeric;

alter table public.scout_players drop constraint if exists scout_players_primary_role_check;
alter table public.scout_players
  add constraint scout_players_primary_role_check
  check (
    primary_role is null or primary_role in (
      'GK','CB','FB','WB','DM','CM','AM','WM','W','SS','ST',
      'DEF_UNKNOWN','MID_UNKNOWN','FWD_UNKNOWN'
    )
  );

alter table public.scout_players drop constraint if exists scout_players_role_side_check;
alter table public.scout_players
  add constraint scout_players_role_side_check
  check (role_side is null or role_side in ('L','C','R','BOTH','NA'));

alter table public.scout_players drop constraint if exists scout_players_role_confidence_check;
alter table public.scout_players
  add constraint scout_players_role_confidence_check
  check (role_confidence is null or role_confidence between 0 and 1);

update public.scout_players
set primary_role=case position
      when 'GK' then 'GK'
      when 'DEF' then 'DEF_UNKNOWN'
      when 'MID' then 'MID_UNKNOWN'
      when 'FWD' then 'FWD_UNKNOWN'
      else primary_role end,
    role_side=case when position='GK' then 'NA' else coalesce(role_side,'NA') end,
    role_source=coalesce(role_source,'fantasy_position_fallback'),
    role_confidence=coalesce(role_confidence,case when position='GK' then .99 else .20 end)
where active=true and primary_role is null;

grant select(primary_role,role_side,role_source,role_confidence)
on public.scout_players to anon,authenticated;

-- Canonical current-season attacking data.
-- xa_* is observed only when an approved source supplies it.
-- xa_model_per90 is always available through player-prior -> position-prior fallback.
alter table public.scout_player_season_stats
  add column if not exists xa_total numeric,
  add column if not exists xa_per90 numeric,
  add column if not exists xa_model_per90 numeric,
  add column if not exists xa_source text,
  add column if not exists xa_confidence numeric,
  add column if not exists shots integer,
  add column if not exists shots_on_target integer,
  add column if not exists key_passes integer,
  add column if not exists big_chances_created integer,
  add column if not exists touches_in_box integer,
  add column if not exists attack_contribution_share numeric,
  add column if not exists advanced_updated_at timestamptz;

alter table public.scout_player_season_stats drop constraint if exists scout_player_season_stats_xa_confidence_check;
alter table public.scout_player_season_stats
  add constraint scout_player_season_stats_xa_confidence_check
  check (xa_confidence is null or xa_confidence between 0 and 1);

with player_prior as (
  select player_id,xa_per90,prior_confidence
  from public.scout_preseason_player_priors
  where season='2026-27' and prior_version='cold-start-v1'
), position_prior as (
  select position,xa_per90
  from public.scout_preseason_position_priors
  where season='2026-27' and prior_version='cold-start-v1'
)
update public.scout_player_season_stats ss
set xa_model_per90=coalesce(pp.xa_per90,pos.xa_per90,0),
    xa_source=case
      when ss.xa_per90 is not null then 'current_observed'
      when pp.xa_per90 is not null then 'preseason_player_prior'
      when pos.xa_per90 is not null then 'position_prior'
      else 'zero_fallback'
    end,
    xa_confidence=case
      when ss.xa_per90 is not null then 1
      when pp.xa_per90 is not null then greatest(.25,least(1,coalesce(pp.prior_confidence,.55)))
      when pos.xa_per90 is not null then .25
      else .05
    end
from public.scout_players p
left join player_prior pp on pp.player_id=p.id
left join position_prior pos on pos.position=p.position
where ss.player_id=p.id and ss.season='2026-27';

update public.scout_player_season_stats
set xa_per90=case
      when xa_total is not null and coalesce(minutes,0)>0
        then xa_total*90/nullif(minutes,0)
      else xa_per90 end,
    advanced_updated_at=coalesce(advanced_updated_at,updated_at)
where season='2026-27';

grant select(
  xa_total,xa_per90,xa_model_per90,xa_source,xa_confidence,
  shots,shots_on_target,key_passes,big_chances_created,touches_in_box,
  attack_contribution_share,advanced_updated_at
) on public.scout_player_season_stats to anon,authenticated;

-- Event-grain store for future approved/licensed feeds. This is intentionally not public.
create table if not exists public.scout_match_attack_events (
  season text not null default '2026-27',
  match_id bigint not null,
  event_id text not null,
  gameweek integer not null check(gameweek between 1 and 34),
  team_id bigint not null references public.scout_teams(id) on delete cascade,
  opponent_team_id bigint not null references public.scout_teams(id) on delete cascade,
  player_id bigint references public.scout_players(id) on delete set null,
  assist_player_id bigint references public.scout_players(id) on delete set null,
  event_type text not null check(event_type in ('shot','goal','own_goal')),
  minute numeric,
  xg numeric,
  xa numeric,
  attack_side text check(attack_side is null or attack_side in ('LEFT','CENTER','RIGHT','UNKNOWN')),
  shot_zone text check(shot_zone is null or shot_zone in ('SIX_YARD','BOX','OUTSIDE_BOX','UNKNOWN')),
  situation text check(situation is null or situation in ('OPEN_PLAY','COUNTER','CORNER','FREE_KICK','SET_PIECE','PENALTY','THROW_IN','UNKNOWN')),
  body_part text,
  source_kind text not null,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  primary key(season,match_id,event_id)
);

create index if not exists scout_match_attack_events_team_gw_idx
  on public.scout_match_attack_events(season,team_id,gameweek);
create index if not exists scout_match_attack_events_player_gw_idx
  on public.scout_match_attack_events(season,player_id,gameweek)
  where player_id is not null;
create index if not exists scout_match_attack_events_opp_gw_idx
  on public.scout_match_attack_events(season,opponent_team_id,gameweek);

alter table public.scout_match_attack_events enable row level security;
revoke all on public.scout_match_attack_events from public,anon,authenticated;
grant select,insert,update,delete on public.scout_match_attack_events to service_role;

-- Team strengths/weaknesses: overall profile is populated today from canonical team stats.
-- Direction/zone/situation columns become populated as approved event-level data arrives.
create table if not exists public.scout_team_tactical_profiles (
  season text not null,
  team_id bigint not null references public.scout_teams(id) on delete cascade,
  through_gameweek integer not null check(through_gameweek between 0 and 34),
  matches_played integer not null default 0,
  attack_xg_per_match numeric,
  defense_xga_per_match numeric,
  shots_for_per_match numeric,
  opponent_sot_per_match numeric,
  attack_strength_index numeric,
  defense_strength_index numeric,
  shot_volume_index numeric,
  keeper_pressure_index numeric,
  attack_left_share numeric,
  attack_center_share numeric,
  attack_right_share numeric,
  conceded_left_share numeric,
  conceded_center_share numeric,
  conceded_right_share numeric,
  goals_box_share numeric,
  goals_outside_box_share numeric,
  goals_six_yard_share numeric,
  conceded_box_share numeric,
  conceded_outside_box_share numeric,
  conceded_six_yard_share numeric,
  goals_set_piece_share numeric,
  goals_counter_share numeric,
  conceded_set_piece_share numeric,
  conceded_counter_share numeric,
  event_shot_sample integer not null default 0,
  event_goal_sample integer not null default 0,
  coverage text not null default 'aggregate_only'
    check(coverage in ('aggregate_only','partial_events','event_complete')),
  source_updated_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key(season,team_id)
);

alter table public.scout_team_tactical_profiles enable row level security;
drop policy if exists scout_team_tactical_profiles_public_read on public.scout_team_tactical_profiles;
create policy scout_team_tactical_profiles_public_read
on public.scout_team_tactical_profiles for select to anon,authenticated
using(true);
grant select on public.scout_team_tactical_profiles to anon,authenticated;
grant all on public.scout_team_tactical_profiles to service_role;

create or replace function private.refresh_scout_team_tactical_profiles(
  p_season text default '2026-27',
  p_through_gameweek integer default null
)
returns void
language plpgsql
security definer
set search_path=''
as $fn$
declare
  v_gw integer;
begin
  select coalesce(
    p_through_gameweek,
    max(s.through_gameweek),
    0
  ) into v_gw
  from public.scout_team_season_stats s;

  with league as (
    select
      nullif(avg(xg_per_match),0) avg_xg,
      nullif(avg(xga_per_match),0) avg_xga,
      nullif(avg(shots::numeric/nullif(matches_played,0)),0) avg_shots,
      nullif(avg(opponent_sot::numeric/nullif(matches_played,0)),0) avg_opp_sot
    from public.scout_team_season_stats
  ), base as (
    select
      t.id team_id,
      coalesce(s.through_gameweek,v_gw) through_gameweek,
      coalesce(s.matches_played,0) matches_played,
      s.xg_per_match attack_xg_per_match,
      s.xga_per_match defense_xga_per_match,
      s.shots::numeric/nullif(s.matches_played,0) shots_for_per_match,
      s.opponent_sot::numeric/nullif(s.matches_played,0) opponent_sot_per_match,
      case when l.avg_xg is null then null else s.xg_per_match/l.avg_xg end attack_strength_index,
      case when l.avg_xga is null or s.xga_per_match is null or s.xga_per_match=0 then null else l.avg_xga/s.xga_per_match end defense_strength_index,
      case when l.avg_shots is null then null else (s.shots::numeric/nullif(s.matches_played,0))/l.avg_shots end shot_volume_index,
      case when l.avg_opp_sot is null then null else (s.opponent_sot::numeric/nullif(s.matches_played,0))/l.avg_opp_sot end keeper_pressure_index,
      s.source_updated_at
    from public.scout_teams t
    left join public.scout_team_season_stats s on s.team_id=t.id
    cross join league l
    where t.active=true
  ), ev as (
    select
      team_id,
      count(*) filter(where event_type in ('shot','goal')) shot_sample,
      count(*) filter(where event_type in ('goal','own_goal')) goal_sample,
      count(*) filter(where event_type in ('shot','goal') and attack_side='LEFT')::numeric
        /nullif(count(*) filter(where event_type in ('shot','goal') and attack_side in ('LEFT','CENTER','RIGHT')),0) attack_left_share,
      count(*) filter(where event_type in ('shot','goal') and attack_side='CENTER')::numeric
        /nullif(count(*) filter(where event_type in ('shot','goal') and attack_side in ('LEFT','CENTER','RIGHT')),0) attack_center_share,
      count(*) filter(where event_type in ('shot','goal') and attack_side='RIGHT')::numeric
        /nullif(count(*) filter(where event_type in ('shot','goal') and attack_side in ('LEFT','CENTER','RIGHT')),0) attack_right_share,
      count(*) filter(where event_type in ('goal','own_goal') and shot_zone='BOX')::numeric
        /nullif(count(*) filter(where event_type in ('goal','own_goal') and shot_zone in ('SIX_YARD','BOX','OUTSIDE_BOX')),0) goals_box_share,
      count(*) filter(where event_type in ('goal','own_goal') and shot_zone='OUTSIDE_BOX')::numeric
        /nullif(count(*) filter(where event_type in ('goal','own_goal') and shot_zone in ('SIX_YARD','BOX','OUTSIDE_BOX')),0) goals_outside_box_share,
      count(*) filter(where event_type in ('goal','own_goal') and shot_zone='SIX_YARD')::numeric
        /nullif(count(*) filter(where event_type in ('goal','own_goal') and shot_zone in ('SIX_YARD','BOX','OUTSIDE_BOX')),0) goals_six_yard_share,
      count(*) filter(where event_type in ('goal','own_goal') and situation in ('CORNER','FREE_KICK','SET_PIECE'))::numeric
        /nullif(count(*) filter(where event_type in ('goal','own_goal')),0) goals_set_piece_share,
      count(*) filter(where event_type in ('goal','own_goal') and situation='COUNTER')::numeric
        /nullif(count(*) filter(where event_type in ('goal','own_goal')),0) goals_counter_share
    from public.scout_match_attack_events
    where season=p_season and gameweek<=v_gw
    group by team_id
  ), opp as (
    select
      opponent_team_id team_id,
      count(*) filter(where event_type in ('shot','goal') and attack_side='LEFT')::numeric
        /nullif(count(*) filter(where event_type in ('shot','goal') and attack_side in ('LEFT','CENTER','RIGHT')),0) conceded_left_share,
      count(*) filter(where event_type in ('shot','goal') and attack_side='CENTER')::numeric
        /nullif(count(*) filter(where event_type in ('shot','goal') and attack_side in ('LEFT','CENTER','RIGHT')),0) conceded_center_share,
      count(*) filter(where event_type in ('shot','goal') and attack_side='RIGHT')::numeric
        /nullif(count(*) filter(where event_type in ('shot','goal') and attack_side in ('LEFT','CENTER','RIGHT')),0) conceded_right_share,
      count(*) filter(where event_type in ('goal','own_goal') and shot_zone='BOX')::numeric
        /nullif(count(*) filter(where event_type in ('goal','own_goal') and shot_zone in ('SIX_YARD','BOX','OUTSIDE_BOX')),0) conceded_box_share,
      count(*) filter(where event_type in ('goal','own_goal') and shot_zone='OUTSIDE_BOX')::numeric
        /nullif(count(*) filter(where event_type in ('goal','own_goal') and shot_zone in ('SIX_YARD','BOX','OUTSIDE_BOX')),0) conceded_outside_box_share,
      count(*) filter(where event_type in ('goal','own_goal') and shot_zone='SIX_YARD')::numeric
        /nullif(count(*) filter(where event_type in ('goal','own_goal') and shot_zone in ('SIX_YARD','BOX','OUTSIDE_BOX')),0) conceded_six_yard_share,
      count(*) filter(where event_type in ('goal','own_goal') and situation in ('CORNER','FREE_KICK','SET_PIECE'))::numeric
        /nullif(count(*) filter(where event_type in ('goal','own_goal')),0) conceded_set_piece_share,
      count(*) filter(where event_type in ('goal','own_goal') and situation='COUNTER')::numeric
        /nullif(count(*) filter(where event_type in ('goal','own_goal')),0) conceded_counter_share
    from public.scout_match_attack_events
    where season=p_season and gameweek<=v_gw
    group by opponent_team_id
  )
  insert into public.scout_team_tactical_profiles(
    season,team_id,through_gameweek,matches_played,
    attack_xg_per_match,defense_xga_per_match,shots_for_per_match,opponent_sot_per_match,
    attack_strength_index,defense_strength_index,shot_volume_index,keeper_pressure_index,
    attack_left_share,attack_center_share,attack_right_share,
    conceded_left_share,conceded_center_share,conceded_right_share,
    goals_box_share,goals_outside_box_share,goals_six_yard_share,
    conceded_box_share,conceded_outside_box_share,conceded_six_yard_share,
    goals_set_piece_share,goals_counter_share,conceded_set_piece_share,conceded_counter_share,
    event_shot_sample,event_goal_sample,coverage,source_updated_at,updated_at
  )
  select
    p_season,b.team_id,b.through_gameweek,b.matches_played,
    b.attack_xg_per_match,b.defense_xga_per_match,b.shots_for_per_match,b.opponent_sot_per_match,
    b.attack_strength_index,b.defense_strength_index,b.shot_volume_index,b.keeper_pressure_index,
    e.attack_left_share,e.attack_center_share,e.attack_right_share,
    o.conceded_left_share,o.conceded_center_share,o.conceded_right_share,
    e.goals_box_share,e.goals_outside_box_share,e.goals_six_yard_share,
    o.conceded_box_share,o.conceded_outside_box_share,o.conceded_six_yard_share,
    e.goals_set_piece_share,e.goals_counter_share,o.conceded_set_piece_share,o.conceded_counter_share,
    coalesce(e.shot_sample,0),coalesce(e.goal_sample,0),
    case
      when coalesce(e.shot_sample,0)=0 then 'aggregate_only'
      when coalesce(e.shot_sample,0)<greatest(25,b.matches_played*6) then 'partial_events'
      else 'event_complete'
    end,
    b.source_updated_at,now()
  from base b
  left join ev e on e.team_id=b.team_id
  left join opp o on o.team_id=b.team_id
  on conflict(season,team_id) do update set
    through_gameweek=excluded.through_gameweek,
    matches_played=excluded.matches_played,
    attack_xg_per_match=excluded.attack_xg_per_match,
    defense_xga_per_match=excluded.defense_xga_per_match,
    shots_for_per_match=excluded.shots_for_per_match,
    opponent_sot_per_match=excluded.opponent_sot_per_match,
    attack_strength_index=excluded.attack_strength_index,
    defense_strength_index=excluded.defense_strength_index,
    shot_volume_index=excluded.shot_volume_index,
    keeper_pressure_index=excluded.keeper_pressure_index,
    attack_left_share=excluded.attack_left_share,
    attack_center_share=excluded.attack_center_share,
    attack_right_share=excluded.attack_right_share,
    conceded_left_share=excluded.conceded_left_share,
    conceded_center_share=excluded.conceded_center_share,
    conceded_right_share=excluded.conceded_right_share,
    goals_box_share=excluded.goals_box_share,
    goals_outside_box_share=excluded.goals_outside_box_share,
    goals_six_yard_share=excluded.goals_six_yard_share,
    conceded_box_share=excluded.conceded_box_share,
    conceded_outside_box_share=excluded.conceded_outside_box_share,
    conceded_six_yard_share=excluded.conceded_six_yard_share,
    goals_set_piece_share=excluded.goals_set_piece_share,
    goals_counter_share=excluded.goals_counter_share,
    conceded_set_piece_share=excluded.conceded_set_piece_share,
    conceded_counter_share=excluded.conceded_counter_share,
    event_shot_sample=excluded.event_shot_sample,
    event_goal_sample=excluded.event_goal_sample,
    coverage=excluded.coverage,
    source_updated_at=excluded.source_updated_at,
    updated_at=now();
end;
$fn$;

revoke all on function private.refresh_scout_team_tactical_profiles(text,integer)
from public,anon,authenticated;
grant execute on function private.refresh_scout_team_tactical_profiles(text,integer)
to service_role;

create or replace function public.scout_refresh_enrichment_profiles(
  p_season text default '2026-27',
  p_through_gameweek integer default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $fn$
declare
  v_qa jsonb;
begin
  perform private.refresh_scout_team_tactical_profiles(p_season,p_through_gameweek);
  select public.scout_enrichment_qa() into v_qa;
  return v_qa;
end;
$fn$;

-- Function body references scout_enrichment_qa, which is defined later in this migration.
-- Recreate the wrapper after QA definition below.
drop function public.scout_refresh_enrichment_profiles(text,integer);

select private.refresh_scout_team_tactical_profiles('2026-27',null);

-- Keep the current public card view as the single fast read, with enrichment appended.
create or replace view public.v_current_player_cards
with (security_invoker=true)
as
select
  r.id as run_id,
  r.gameweek,
  r.generated_at,
  r.source_updated_at,
  r.simulation_count,
  r.status as run_status,
  r.is_current,
  p.id as player_id,
  p.full_name,
  p.display_name,
  p.short_label,
  p.shirt_number,
  p.team_id,
  t.name as team_name,
  t.slug as team_slug,
  p.position,
  p.price,
  p.active,
  ss.actual_points as total_points,
  pr.opponent_name,
  pr.venue,
  pr.xi_probability,
  pr.appearance_probability,
  pr.over60_probability,
  pr.x_minutes,
  pr.core_xfp,
  pr.x_bonus,
  pr.xfp,
  pr.p25,
  pr.p75,
  pr.p90,
  pr.six_plus_probability,
  pr.value_score,
  pr.expected_goals,
  pr.expected_assists,
  pr.availability_probability as projection_availability_probability,
  pr.top25_score,
  pr.top25_rank,
  pr.confidence,
  a.availability_type,
  a.availability_probability,
  a.canonical_reason,
  a.checked_at,
  a.suspension_end,
  a.injury_date,
  a.expected_return_date,
  a.suspension_fixture,
  rs.last2_xi_probability,
  rs.previous2_xi_probability,
  rs.last2_minutes,
  rs.previous2_minutes,
  rs.signal,
  rs.predicted_xi_probability,
  rs.x_minutes as role_x_minutes,
  rs.team_goal_share,
  rs.team_assist_share,
  rs.availability_probability as role_availability_probability,
  p.primary_role,
  p.role_side,
  p.role_source,
  p.role_confidence,
  ss.xa_total,
  ss.xa_per90,
  ss.xa_model_per90,
  ss.xa_source,
  ss.xa_confidence,
  ss.shots,
  ss.shots_on_target,
  ss.key_passes,
  ss.big_chances_created,
  ss.touches_in_box,
  ss.attack_contribution_share
from public.scout_model_runs r
join public.scout_players p on p.active=true
left join public.scout_teams t on t.id=p.team_id
left join public.scout_game_rules gr on true
left join public.scout_player_season_stats ss on ss.player_id=p.id and ss.season=gr.season
left join public.scout_player_projections pr on pr.run_id=r.id and pr.player_id=p.id
left join public.scout_availability a on a.run_id=r.id and a.player_id=p.id
left join public.scout_role_signals rs on rs.run_id=r.id and rs.player_id=p.id
where r.is_current=true
  and gr.season=(select max(season) from public.scout_game_rules);

grant select on public.v_current_player_cards to anon,authenticated;

-- Canonical feature view consumed by refresh/model code.
create or replace view public.v_scout_player_model_features
with (security_invoker=true)
as
select
  p.id player_id,
  p.team_id,
  p.position,
  p.primary_role,
  p.role_side,
  p.role_source,
  p.role_confidence,
  s.season,
  s.through_gameweek,
  s.minutes,
  s.goals,
  s.assists,
  s.xg_total,
  s.xa_total,
  s.xa_per90 observed_xa_per90,
  s.xa_model_per90,
  case
    when s.xa_per90 is null then s.xa_model_per90
    when coalesce(s.minutes,0)>=450 then s.xa_per90
    else (
      s.xa_per90*coalesce(s.minutes,0)
      +s.xa_model_per90*(450-coalesce(s.minutes,0))
    )/450
  end effective_xa_per90,
  s.xa_source,
  s.xa_confidence,
  s.shots,
  s.shots_on_target,
  s.key_passes,
  s.big_chances_created,
  s.touches_in_box,
  s.attack_contribution_share
from public.scout_players p
left join public.scout_player_season_stats s
  on s.player_id=p.id and s.season='2026-27'
where p.active=true;

grant select on public.v_scout_player_model_features to anon,authenticated;

-- Replay/live model inputs can now carry the detailed role explicitly.
alter table public.scout_replay_player_inputs
  add column if not exists sub_role text,
  add column if not exists role_side text,
  add column if not exists effective_xa_per90 numeric;

-- Do not backfill historical replay rows from today's roles/xA: that would leak future information.
-- The replay input builder must snapshot these fields using only data available before the target MH.

-- Enrichment QA is informational until approved source coverage is complete.
create or replace function public.scout_enrichment_qa()
returns jsonb
language sql
stable
security invoker
set search_path='public'
as $qa$
with active as (
  select p.id,p.primary_role,s.xa_model_per90
  from scout_players p
  left join scout_player_season_stats s on s.player_id=p.id and s.season='2026-27'
  where p.active=true
), teams as (
  select t.id,tp.coverage
  from scout_teams t
  left join scout_team_tactical_profiles tp on tp.team_id=t.id and tp.season='2026-27'
  where t.active=true
)
select jsonb_build_object(
  'active_players',(select count(*) from active),
  'xa_model_covered',(select count(*) from active where xa_model_per90 is not null),
  'detailed_role_covered',(select count(*) from active where primary_role not in ('DEF_UNKNOWN','MID_UNKNOWN','FWD_UNKNOWN')),
  'unknown_role',(select count(*) from active where primary_role in ('DEF_UNKNOWN','MID_UNKNOWN','FWD_UNKNOWN') or primary_role is null),
  'active_teams',(select count(*) from teams),
  'team_profile_covered',(select count(*) from teams where coverage is not null),
  'team_event_profile_covered',(select count(*) from teams where coverage in ('partial_events','event_complete'))
);
$qa$;

grant execute on function public.scout_enrichment_qa() to anon,authenticated,service_role;

create or replace function public.scout_refresh_enrichment_profiles(
  p_season text default '2026-27',
  p_through_gameweek integer default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $fn$
declare
  v_qa jsonb;
begin
  perform private.refresh_scout_team_tactical_profiles(p_season,p_through_gameweek);
  select public.scout_enrichment_qa() into v_qa;
  return v_qa;
end;
$fn$;
revoke all on function public.scout_refresh_enrichment_profiles(text,integer)
from public,anon,authenticated;
grant execute on function public.scout_refresh_enrichment_profiles(text,integer)
to service_role;

commit;
