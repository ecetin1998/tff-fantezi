create or replace function public.scout_model_bugfix_qa(p_run_id uuid)
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
with gk_cap as (
  select count(*)::int n
  from scout_squad_recommendations r
  join scout_squad_members m on m.recommendation_id=r.id and m.is_captain=true
  join scout_players p on p.id=m.player_id
  where r.run_id=p_run_id and p.position='GK'
), xi_bad as (
  select count(*)::int n
  from scout_player_projections
  where run_id=p_run_id and coalesce(xi_probability,0)>1.000001
), def_bad as (
  select count(*)::int n
  from scout_player_projections a
  join scout_players pa on pa.id=a.player_id and pa.position='DEF'
  join scout_player_projections b on b.run_id=a.run_id and b.player_id>a.player_id
  join scout_players pb on pb.id=b.player_id and pb.position='DEF' and pb.team_id=pa.team_id
  where a.run_id=p_run_id
    -- Clean-sheet/base scoring comparisons only make sense for projected 60+ minute defenders.
    -- Below 60, appearance and clean-sheet thresholds create legitimate discontinuities.
    and coalesce(a.x_minutes,0)>=60
    and coalesce(b.x_minutes,0)>=60
    and abs(coalesce(a.x_minutes,0)-coalesce(b.x_minutes,0))<=3
    and abs(coalesce(a.xi_probability,0)-coalesce(b.xi_probability,0))<=.05
    and abs(
      (coalesce(a.xfp,0)-coalesce(b.xfp,0))
      -(
        (coalesce(a.expected_goals,0)-coalesce(b.expected_goals,0))*6
        +(coalesce(a.expected_assists,0)-coalesce(b.expected_assists,0))*3
        +(coalesce(a.x_bonus,0)-coalesce(b.x_bonus,0))
      )
    )>.3
)
select jsonb_build_object(
  'pass',(select n=0 from gk_cap) and (select n=0 from xi_bad) and (select n=0 from def_bad),
  'gk_captain',(select n from gk_cap),
  'xi_over_1',(select n from xi_bad),
  'unexplained_same_team_def_xfp_diff',(select n from def_bad)
);
$function$;
