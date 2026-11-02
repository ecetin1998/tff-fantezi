-- MH11: defenders with similar XI probability and x_minutes can still have
-- materially different probabilities of reaching 60 minutes. The 60+ threshold
-- changes clean-sheet, appearance and conceded-goal expectation legitimately.
-- Compare like-for-like CB/CB, FB/FB, WB/WB only when those probabilities match;
-- preserve the existing strict 0.3 residual detection for genuinely equivalent pairs.
CREATE OR REPLACE FUNCTION public.scout_model_bugfix_qa(p_run_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $function$
WITH gk_cap AS (
 SELECT count(*)::int n
 FROM scout_squad_recommendations r
 JOIN scout_squad_members m ON m.recommendation_id=r.id AND m.is_captain=true
 JOIN scout_players p ON p.id=m.player_id
 WHERE r.run_id=p_run_id AND p.position='GK'
), xi_bad AS (
 SELECT count(*)::int n FROM scout_player_projections
 WHERE run_id=p_run_id AND coalesce(xi_probability,0)>1.000001
), def_bad AS (
 SELECT count(*)::int n
 FROM scout_player_projections a
 JOIN scout_players pa ON pa.id=a.player_id AND pa.position='DEF'
 JOIN scout_player_projections b ON b.run_id=a.run_id AND b.player_id>a.player_id
 JOIN scout_players pb ON pb.id=b.player_id AND pb.position='DEF' AND pb.team_id=pa.team_id
 WHERE a.run_id=p_run_id
   AND coalesce(pa.primary_role,'DEF_UNKNOWN')=coalesce(pb.primary_role,'DEF_UNKNOWN')
   AND coalesce(a.x_minutes,0)>=60
   AND coalesce(b.x_minutes,0)>=60
   AND abs(coalesce(a.x_minutes,0)-coalesce(b.x_minutes,0))<=3
   AND abs(coalesce(a.xi_probability,0)-coalesce(b.xi_probability,0))<=.05
   AND abs(coalesce(a.over60_probability,0)-coalesce(b.over60_probability,0))<=.03
   AND abs(coalesce(a.appearance_probability,0)-coalesce(b.appearance_probability,0))<=.02
   AND abs(
     (coalesce(a.xfp,0)-coalesce(b.xfp,0))
     -(
       (coalesce(a.expected_goals,0)-coalesce(b.expected_goals,0))*6
       +(coalesce(a.expected_assists,0)-coalesce(b.expected_assists,0))*3
       +(coalesce(a.x_bonus,0)-coalesce(b.x_bonus,0))
      )
   )>.3
)
SELECT jsonb_build_object(
 'pass',(SELECT n=0 FROM gk_cap) AND (SELECT n=0 FROM xi_bad) AND (SELECT n=0 FROM def_bad),
 'gk_captain',(SELECT n FROM gk_cap),
 'xi_over_1',(SELECT n FROM xi_bad),
 'unexplained_same_team_def_xfp_diff',(SELECT n FROM def_bad)
);
$function$;
