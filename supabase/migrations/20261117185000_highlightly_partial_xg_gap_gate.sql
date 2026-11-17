-- Keep two truths distinct:
-- (1) Highlightly endpoint was captured, and (2) trusted xG evidence exists.
-- Missing source xG or xA must remain NULL; never count as a verified zero.
CREATE OR REPLACE VIEW public.scout_highlightly_targeted_readiness
WITH (security_invoker=true) AS
WITH provider_team_xg AS (
  SELECT season, match_id,
    count(DISTINCT team_id) FILTER(WHERE xg IS NOT NULL)::integer AS complete_xg_teams
  FROM public.scout_highlightly_team_matches
  GROUP BY season,match_id
), provider_player_chance AS (
  SELECT season,match_id,
    count(DISTINCT provider_player_id) FILTER(WHERE xg IS NOT NULL OR xa IS NOT NULL)::integer AS chance_players
  FROM public.scout_highlightly_player_matches
  GROUP BY season,match_id
)
SELECT count(*)::integer AS matches,
    count(*) FILTER (
      WHERE (NOT r.need_box OR (m.box_done AND coalesce(pc.chance_players,0)>=10))
        AND (NOT r.need_stats OR (m.stats_done AND coalesce(pt.complete_xg_teams,0)=2))
        AND (NOT r.need_lineups OR m.lineups_done)
    )::integer AS sufficient_matches,
    count(*) FILTER (WHERE m.box_done AND m.stats_done AND m.lineups_done)::integer
      AS fully_captured_by_highlightly,
    count(*) FILTER (WHERE r.need_box AND NOT m.box_done)::integer AS pending_box,
    count(*) FILTER (WHERE r.need_stats AND NOT m.stats_done)::integer AS pending_stats,
    count(*) FILTER (WHERE r.need_lineups AND NOT m.lineups_done)::integer AS pending_lineups,
    count(*) FILTER (WHERE NOT r.need_box AND NOT m.box_done)::integer
      AS box_skipped_existing_evidence,
    count(*) FILTER (WHERE NOT r.need_stats AND NOT m.stats_done)::integer
      AS stats_skipped_existing_evidence,
    count(*) FILTER (WHERE NOT r.need_lineups AND NOT m.lineups_done)::integer
      AS lineups_deferred_or_verified,
    (count(*) FILTER (WHERE r.need_box AND NOT m.box_done)
     + count(*) FILTER (WHERE r.need_stats AND NOT m.stats_done)
     + count(*) FILTER (WHERE r.need_lineups AND NOT m.lineups_done))::integer
      AS pending_api_calls_minimum,
    count(*) FILTER (
      WHERE (NOT r.need_box OR (m.box_done AND coalesce(pc.chance_players,0)>=10))
        AND (NOT r.need_stats OR (m.stats_done AND coalesce(pt.complete_xg_teams,0)=2))
        AND (NOT r.need_lineups OR m.lineups_done)
    )=count(*) AS targeted_coverage_complete,
    false AS source_reconciled_to_player_and_team_profiles,
    count(*) FILTER (
      WHERE r.need_box AND m.box_done AND coalesce(pc.chance_players,0)<10
    )::integer AS unresolved_provider_player_xg,
    count(*) FILTER (
      WHERE r.need_stats AND m.stats_done AND coalesce(pt.complete_xg_teams,0)<2
    )::integer AS unresolved_provider_team_xg
FROM public.scout_highlightly_fetch_requirements r
JOIN public.scout_highlightly_matches m
  ON m.season=r.season AND m.match_id=r.match_id
LEFT JOIN provider_team_xg pt
  ON pt.season=m.season AND pt.match_id=m.match_id
LEFT JOIN provider_player_chance pc
  ON pc.season=m.season AND pc.match_id=m.match_id
WHERE r.gameweek <= (
  SELECT max(gameweek) FROM (
    SELECT gameweek FROM public.scout_match_history
    WHERE season='2026-27'
    GROUP BY gameweek HAVING count(*)=9 AND
      bool_and(match_status='Bitti' AND fantasy_closure='KAPANDI')
  ) closed
);
REVOKE ALL ON public.scout_highlightly_targeted_readiness FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.scout_highlightly_targeted_readiness TO service_role;