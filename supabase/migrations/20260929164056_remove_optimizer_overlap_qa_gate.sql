begin;

-- Recommended and ceiling squads may legitimately converge. Keep XI overlap as a diagnostic,
-- but do not fail publication only because the two optimizer objectives chose >8 common XI players.
CREATE OR REPLACE FUNCTION public.scout_run_qa(p_run_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
with
run_meta as (
  select id,gameweek,status,is_current,simulation_count
  from scout_model_runs where id=p_run_id
),
active_players as (
  select count(*)::int n from scout_players where active=true
),
fixture_counts as (
  select team_id,count(*)::numeric fixture_count
  from (
    select home_team_id team_id from scout_match_predictions where run_id=p_run_id
    union all
    select away_team_id team_id from scout_match_predictions where run_id=p_run_id
  ) f
  group by team_id
),
proj_stats as (
  select
    count(*)::int total_projection_count,
    count(*) filter(where sp.active)::int active_projection_count,
    count(*) filter(where not sp.active)::int inactive_projection_count,
    count(*) filter(
      where not sp.active and (
        coalesce(p.x_minutes,0)>.001 or coalesce(p.xfp,0)>.001
        or coalesce(p.xi_probability,0)>.001 or coalesce(p.appearance_probability,0)>.001
        or coalesce(p.over60_probability,0)>.001 or coalesce(p.six_plus_probability,0)>.001
        or coalesce(p.expected_goals,0)>.001 or coalesce(p.expected_assists,0)>.001
      )
    )::int inactive_positive_projections,
    count(*) filter(
      where sp.active and coalesce(p.availability_probability,0)<=0
        and (
          coalesce(p.x_minutes,0)>.001 or coalesce(p.xfp,0)>.001
          or coalesce(p.xi_probability,0)>.001 or coalesce(p.appearance_probability,0)>.001
          or coalesce(p.over60_probability,0)>.001 or coalesce(p.six_plus_probability,0)>.001
          or coalesce(p.expected_goals,0)>.001 or coalesce(p.expected_assists,0)>.001
        )
    )::int hard_zero_violations,
    count(*) filter(
      where sp.active and (
        p.x_minutes is null or p.xfp is null or p.xi_probability is null
        or p.appearance_probability is null or p.over60_probability is null
        or p.p25 is null or p.p75 is null or p.p90 is null
        or p.six_plus_probability is null
        or p.x_minutes<0 or p.x_minutes>90*coalesce(fc.fixture_count,0)
        or p.xi_probability<0 or p.xi_probability>1
        or p.appearance_probability<0 or p.appearance_probability>1
        or p.over60_probability<0 or p.over60_probability>1
        or p.six_plus_probability<0 or p.six_plus_probability>1
      )
    )::int projection_range_violations,
    count(*) filter(where sp.active and (p.p25>p.p75 or p.p75>p.p90))::int quantile_order_violations,
    count(*) filter(
      where sp.active and coalesce(p.availability_probability,0)>0
        and (p.top25_score is null or p.top25_rank is null or p.top25_model_version is null)
    )::int top25_missing
  from scout_player_projections p
  join scout_players sp on sp.id=p.player_id
  left join fixture_counts fc on fc.team_id=sp.team_id
  where p.run_id=p_run_id
),
missing_active_proj as (
  select count(*)::int n
  from scout_players sp
  where sp.active=true
    and not exists (
      select 1 from scout_player_projections p where p.run_id=p_run_id and p.player_id=sp.id
    )
),
role_stats as (
  select
    count(*)::int total_role_count,
    count(*) filter(where sp.active)::int active_role_count,
    count(*) filter(
      where not sp.active and (
        coalesce(s.predicted_xi_probability,0)>.001 or coalesce(s.x_minutes,0)>.001
        or coalesce(s.team_goal_share,0)>.001 or coalesce(s.team_assist_share,0)>.001
        or coalesce(s.availability_probability,0)>.001
      )
    )::int inactive_positive_roles
  from scout_role_signals s
  join scout_players sp on sp.id=s.player_id
  where s.run_id=p_run_id
),
missing_active_roles as (
  select count(*)::int n
  from scout_players sp
  where sp.active=true
    and not exists (
      select 1 from scout_role_signals s where s.run_id=p_run_id and s.player_id=sp.id
    )
),
availability_alignment as (
  select count(*) filter(
    where abs(coalesce(p.availability_probability,0)-coalesce(s.availability_probability,0))>.001
  )::int mismatch
  from scout_player_projections p
  join scout_role_signals s on s.run_id=p.run_id and s.player_id=p.player_id
  join scout_players sp on sp.id=p.player_id
  where p.run_id=p_run_id and sp.active
),
team_minutes as (
  select sp.team_id,coalesce(fc.fixture_count,0) fixture_count,sum(coalesce(p.x_minutes,0)) minute_sum
  from scout_player_projections p
  join scout_players sp on sp.id=p.player_id
  left join fixture_counts fc on fc.team_id=sp.team_id
  where p.run_id=p_run_id and sp.active
  group by sp.team_id,fc.fixture_count
),
minute_qa as (
  select
    count(*)::int team_count,
    count(*) filter(where fixture_count<1 or minute_sum<984*fixture_count or minute_sum>990.25*fixture_count)::int violations,
    coalesce(max(abs(minute_sum-990*fixture_count)),0)::numeric max_gap
  from team_minutes
),
role_team as (
  select sp.team_id,
         sum(coalesce(s.team_goal_share,0)) goal_share,
         sum(coalesce(s.team_assist_share,0)) assist_share
  from scout_role_signals s
  join scout_players sp on sp.id=s.player_id
  where s.run_id=p_run_id and sp.active and coalesce(s.availability_probability,0)>0
  group by sp.team_id
),
share_qa as (
  select count(*)::int team_count,
         count(*) filter(where abs(goal_share-1)>.01 or abs(assist_share-1)>.01)::int violations,
         coalesce(max(greatest(abs(goal_share-1),abs(assist_share-1))),0)::numeric max_gap
  from role_team
),
match_qa as (
  select
    count(*)::int match_count,
    count(distinct team_id)::int team_count,
    count(*) filter(
      where coalesce(home_xg,-1)<0 or coalesce(away_xg,-1)<0
        or home_win_probability is null or draw_probability is null or away_win_probability is null
        or home_win_probability<0 or home_win_probability>1
        or draw_probability<0 or draw_probability>1
        or away_win_probability<0 or away_win_probability>1
        or abs((home_win_probability+draw_probability+away_win_probability)-1)>.01
        or home_cs_probability<0 or home_cs_probability>1
        or away_cs_probability<0 or away_cs_probability>1
    )::int invalid_matches
  from scout_match_predictions m
  left join lateral (
    select unnest(array[m.home_team_id,m.away_team_id]) team_id
  ) t on true
  where m.run_id=p_run_id
),
member_rows as (
  select q.id recommendation_id,q.variant,q.budget,m.player_id,m.squad_slot,m.is_captain,
         sp.position,sp.team_id,sp.active,p.availability_probability
  from scout_squad_recommendations q
  left join scout_squad_members m on m.recommendation_id=q.id
  left join scout_players sp on sp.id=m.player_id
  left join scout_player_projections p on p.run_id=q.run_id and p.player_id=m.player_id
  where q.run_id=p_run_id
),
team_counts as (
  select recommendation_id,team_id,count(*)::int team_count
  from member_rows where player_id is not null
  group by recommendation_id,team_id
),
rec_agg as (
  select recommendation_id,max(variant) variant,max(budget) budget,
         count(player_id)::int member_count,count(distinct player_id)::int distinct_member_count,
         count(*) filter(where squad_slot='XI')::int xi_count,
         count(*) filter(where squad_slot='BENCH')::int bench_count,
         count(*) filter(where is_captain)::int captain_count,
         count(*) filter(where is_captain and squad_slot<>'XI')::int bench_captain_count,
         count(*) filter(where position='GK')::int gk_count,
         count(*) filter(where position='DEF')::int def_count,
         count(*) filter(where position='MID')::int mid_count,
         count(*) filter(where position='FWD')::int fwd_count,
         count(*) filter(where squad_slot='XI' and position='GK')::int xi_gk,
         count(*) filter(where squad_slot='XI' and position='DEF')::int xi_def,
         count(*) filter(where squad_slot='XI' and position='MID')::int xi_mid,
         count(*) filter(where squad_slot='XI' and position='FWD')::int xi_fwd,
         count(*) filter(where coalesce(active,false)=false or coalesce(availability_probability,0)<=0)::int invalid_members
  from member_rows group by recommendation_id
),
rec_checked as (
  select r.*,coalesce((select max(tc.team_count) from team_counts tc where tc.recommendation_id=r.recommendation_id),0) max_team_count
  from rec_agg r
),
rec_qa as (
  select
    count(*)::int recommendation_count,
    count(*) filter(where variant='recommended')::int recommended_count,
    count(*) filter(where variant='alternative')::int alternative_count,
    count(*) filter(
      where member_count<>15 or distinct_member_count<>15 or xi_count<>11 or bench_count<>4
        or captain_count<>1 or bench_captain_count<>0 or budget>100.0001
        or gk_count<>2 or def_count<>5 or mid_count<>5 or fwd_count<>3
        or xi_gk<>1 or xi_def<3 or xi_def>5 or xi_mid<2 or xi_mid>5 or xi_fwd<1 or xi_fwd>3
        or max_team_count>3 or invalid_members>0
    )::int invalid_recommendations,
    coalesce(max(max_team_count),0)::int max_team_count,
    coalesce(sum(invalid_members),0)::int invalid_recommendation_members
  from rec_checked
),
overlap as (
  select count(*)::int xi_overlap
  from member_rows a join member_rows b on b.player_id=a.player_id
  where a.variant='recommended' and b.variant='alternative'
    and a.squad_slot='XI' and b.squad_slot='XI'
),
checks as (
  select
    coalesce((select simulation_count>=50000 from run_meta),false) simulation_ok,
    coalesce((select active_projection_count=(select n from active_players) from proj_stats),false)
      and (select n=0 from missing_active_proj) coverage_ok,
    coalesce((select inactive_positive_projections=0 and hard_zero_violations=0
      and projection_range_violations=0 and quantile_order_violations=0 and top25_missing=0
      from proj_stats),false) projection_ok,
    coalesce((select active_role_count=(select n from active_players) and inactive_positive_roles=0 from role_stats),false)
      and (select n=0 from missing_active_roles) role_ok,
    coalesce((select mismatch=0 from availability_alignment),false) availability_ok,
    coalesce((select team_count=18 and violations=0 from minute_qa),false) minute_ok,
    coalesce((select team_count=18 and violations=0 from share_qa),false) share_ok,
    coalesce((select match_count>=18 and mod(match_count,2)=0 and team_count=18 and invalid_matches=0 from match_qa),false) match_ok,
    coalesce((select recommendation_count=2 and recommended_count=1 and alternative_count=1 and invalid_recommendations=0 from rec_qa),false) optimizer_ok
)
select jsonb_build_object(
  'pass',
    coalesce((select status='ready' from run_meta),false)
    and simulation_ok and coverage_ok and projection_ok and role_ok and availability_ok
    and minute_ok and share_ok and match_ok and optimizer_ok,
  'artifacts_pass',
    simulation_ok and coverage_ok and projection_ok and role_ok and availability_ok
    and minute_ok and share_ok and match_ok and optimizer_ok,
  'run_id',p_run_id,
  'gameweek',(select gameweek from run_meta),
  'status',(select status from run_meta),
  'simulation_count',(select simulation_count from run_meta),
  'active_player_count',(select n from active_players),
  'active_projection_count',(select active_projection_count from proj_stats),
  'inactive_projection_count',(select inactive_projection_count from proj_stats),
  'inactive_positive_projections',(select inactive_positive_projections from proj_stats),
  'missing_active_projections',(select n from missing_active_proj),
  'active_role_count',(select active_role_count from role_stats),
  'inactive_positive_roles',(select inactive_positive_roles from role_stats),
  'missing_active_roles',(select n from missing_active_roles),
  'hard_zero_violations',(select hard_zero_violations from proj_stats),
  'projection_range_violations',(select projection_range_violations from proj_stats),
  'quantile_order_violations',(select quantile_order_violations from proj_stats),
  'top25_missing',(select top25_missing from proj_stats),
  'availability_mismatch',(select mismatch from availability_alignment),
  'team_minute_violations',(select violations from minute_qa),
  'max_team_minute_gap',(select max_gap from minute_qa),
  'share_violations',(select violations from share_qa),
  'max_share_gap',(select max_gap from share_qa),
  'match_count',((select match_count from match_qa)/2),
  'team_count',(select team_count from match_qa),
  'invalid_matches',(select invalid_matches from match_qa),
  'recommendation_count',(select recommendation_count from rec_qa),
  'invalid_recommendations',(select invalid_recommendations from rec_qa),
  'invalid_recommendation_members',(select invalid_recommendation_members from rec_qa),
  'max_team_count',(select max_team_count from rec_qa),
  'xi_overlap',(select xi_overlap from overlap)
)
from checks;
$function$;

commit;
