-- Highlightly data is intentionally on its own provider scale, not mixed into official points or FotMob.
CREATE OR REPLACE VIEW public.scout_highlightly_player_rollup
WITH (security_invoker=true) AS
SELECT p.id AS player_id,p.full_name,p.team_id,
  count(pm.provider_player_id)::integer AS listed_match_count,
  count(pm.provider_player_id) FILTER (WHERE pm.minutes>0)::integer AS played_count,
  min(pm.gameweek) AS first_gameweek,max(pm.gameweek) AS through_gameweek,
  sum(pm.minutes)::integer AS provider_minutes,
  sum(pm.shots)::integer AS shots,sum(pm.shots_on_target)::integer AS shots_on_target,
  sum(pm.key_passes)::integer AS key_passes,
  sum(pm.dribbles)::integer AS takeons,sum(pm.successful_dribbles)::integer AS successful_takeons,
  sum(pm.saves)::integer AS saves,sum(pm.xg) AS xg_observed_sum,sum(pm.xa) AS xa_observed_sum,
  count(pm.xg) FILTER(WHERE pm.minutes>0)::integer AS games_with_explicit_xg,
  count(pm.xa) FILTER(WHERE pm.minutes>0)::integer AS games_with_explicit_xa,
  max(pm.observed_at) AS observed_at,
  'Highlightly (separate xG scale; unobserved inputs not zero)'::text AS provenance
FROM public.scout_players p
LEFT JOIN public.scout_highlightly_player_matches pm
 ON pm.player_id=p.id AND pm.season='2026-27'
WHERE p.active
GROUP BY p.id,p.full_name,p.team_id;
CREATE OR REPLACE VIEW public.scout_highlightly_team_rollup
WITH (security_invoker=true) AS
SELECT t.id AS team_id,t.name,count(tm.match_id)::integer AS provider_match_count,
 (SELECT count(*)::integer FROM public.scout_match_history h WHERE h.season='2026-27'
  AND h.match_status='Bitti' AND (h.home_team_id=t.id OR h.away_team_id=t.id))
  AS expected_completed_matches,
 min(tm.gameweek) AS first_gameweek,max(tm.gameweek) AS through_gameweek,
 sum(tm.xg) AS xg_total,sum(tm.xa) AS xa_total,
 avg(tm.xg) AS xg_per_match,avg(tm.xa) AS xa_per_match,
 avg(tm.possession) AS possession_average,
 sum(tm.shots)::integer AS shots,sum(tm.shots_on_target)::integer AS shots_on_target,
 sum(tm.key_passes)::integer AS key_passes,
 sum(tm.crosses)::integer AS crosses,sum(tm.successful_crosses)::integer AS successful_crosses,
 sum(tm.dribbles)::integer AS dribbles,sum(tm.successful_dribbles)::integer AS successful_dribbles,
 max(tm.observed_at) AS observed_at,
 'Highlightly (do not combine raw xG directly with FotMob)'::text AS provenance
FROM public.scout_teams t
LEFT JOIN public.scout_highlightly_team_matches tm ON tm.team_id=t.id AND tm.season='2026-27'
WHERE t.active
GROUP BY t.id,t.name;
REVOKE ALL ON public.scout_highlightly_player_rollup FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.scout_highlightly_team_rollup FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.scout_highlightly_player_rollup TO service_role;
GRANT SELECT ON public.scout_highlightly_team_rollup TO service_role;
