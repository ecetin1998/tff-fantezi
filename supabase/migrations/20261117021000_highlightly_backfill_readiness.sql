-- Read-only quality gate for Highlightly historical ingestion.
-- "backfill_complete" only means all closed matches have all 3 source payloads.
-- It does NOT imply xFP recalibration or source-metric completeness.
CREATE OR REPLACE VIEW public.scout_highlightly_backfill_readiness
WITH (security_invoker=true) AS
WITH closed_week AS (
  SELECT max(gameweek) AS gameweek FROM (
    SELECT gameweek
    FROM public.scout_match_history
    WHERE season='2026-27'
    GROUP BY gameweek
    HAVING count(*)=9 AND bool_and(match_status='Bitti' AND fantasy_closure='KAPANDI')
  ) all_closed
), completed AS (
  SELECT count(*) AS total
  FROM public.scout_match_history h, closed_week c
  WHERE h.season='2026-27' AND h.gameweek <= c.gameweek AND h.match_status='Bitti'
), provider_matches AS (
  SELECT count(*) AS mapped,
         count(*) FILTER (WHERE m.box_done AND m.stats_done AND m.lineups_done) AS complete,
         count(*) FILTER (WHERE m.last_error IS NOT NULL) AS errors
  FROM public.scout_highlightly_matches m,closed_week c
  WHERE m.season='2026-27' AND m.gameweek<=c.gameweek
), players AS (
  SELECT count(*) AS entries,
    count(*) FILTER (WHERE player_id IS NOT NULL) AS resolved,
    count(*) FILTER (WHERE player_id IS NULL AND minutes>0) AS unmatched_played,
    count(*) FILTER (WHERE xg IS NOT NULL) AS xg_observed,
    count(*) FILTER (WHERE xa IS NOT NULL) AS xa_observed
  FROM public.scout_highlightly_player_matches p,closed_week c
  WHERE p.season='2026-27' AND p.gameweek<=c.gameweek
), team_stats AS (
  SELECT count(*) AS entries, count(*) FILTER(WHERE xg IS NOT NULL) AS xg_observed
  FROM public.scout_highlightly_team_matches t,closed_week c
  WHERE t.season='2026-27' AND t.gameweek<=c.gameweek
)
SELECT c.gameweek AS last_closed_gameweek,
 h.total::integer AS closed_matches,
 m.mapped::integer AS fixture_mapped,
 m.complete::integer AS fully_ingested,
 greatest(0,h.total-m.complete)::integer AS remaining,
 m.errors::integer AS match_errors,
 p.entries::integer AS player_entries,
 p.resolved::integer AS resolved_player_entries,
 p.unmatched_played::integer AS unmatched_played_player_entries,
 p.xg_observed::integer AS observed_player_xg,
 p.xa_observed::integer AS observed_player_xa,
 t.entries::integer AS team_match_rows,
 t.xg_observed::integer AS observed_team_xg,
 sc.quota_day,sc.requests_used,sc.daily_budget,sc.provider_remaining,
 sc.last_success_at,
 (h.total>0 AND m.mapped=h.total AND m.complete=h.total) AS source_backfill_complete,
 false AS xfp_model_recalibrated
FROM closed_week c CROSS JOIN completed h CROSS JOIN provider_matches m
CROSS JOIN players p CROSS JOIN team_stats t
LEFT JOIN public.scout_highlightly_sync_control sc ON sc.id=1;
REVOKE ALL ON public.scout_highlightly_backfill_readiness FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.scout_highlightly_backfill_readiness TO service_role;