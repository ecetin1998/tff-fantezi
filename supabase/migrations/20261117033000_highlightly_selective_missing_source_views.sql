-- Highlightly selective backfill based on independent existing verified evidence.
-- "full provider capture" != "enough existing evidence". Do not relabel provider capture flags.
CREATE OR REPLACE VIEW public.scout_highlightly_fetch_requirements WITH (security_invoker=true) AS
 WITH last_closed AS (
         SELECT COALESCE(max(a_1.gameweek), 11) AS gw
           FROM ( SELECT scout_match_history.gameweek
                   FROM scout_match_history
                  WHERE scout_match_history.season = '2026-27'::text
                  GROUP BY scout_match_history.gameweek
                 HAVING count(*) = 9 AND bool_and(scout_match_history.match_status = 'Bitti'::text AND scout_match_history.fantasy_closure = 'KAPANDI'::text)) a_1
        ), weekly_attack AS (
         SELECT scout_verified_weekly_attack.season,
            scout_verified_weekly_attack.match_id,
            count(DISTINCT scout_verified_weekly_attack.player_id)::integer AS rows,
            count(DISTINCT scout_verified_weekly_attack.player_id) FILTER (WHERE scout_verified_weekly_attack.xg IS NOT NULL OR scout_verified_weekly_attack.xa IS NOT NULL)::integer AS chance_rows
           FROM scout_verified_weekly_attack
          WHERE scout_verified_weekly_attack.season = '2026-27'::text
          GROUP BY scout_verified_weekly_attack.season, scout_verified_weekly_attack.match_id
        ), team_evidence AS (
         SELECT scout_verified_team_match_advanced.season,
            scout_verified_team_match_advanced.match_id,
            count(DISTINCT scout_verified_team_match_advanced.team_id) FILTER (WHERE scout_verified_team_match_advanced.xg IS NOT NULL AND scout_verified_team_match_advanced.xga IS NOT NULL AND scout_verified_team_match_advanced.shots IS NOT NULL AND scout_verified_team_match_advanced.shots_on_target IS NOT NULL)::integer AS complete_teams
           FROM scout_verified_team_match_advanced
          WHERE scout_verified_team_match_advanced.season = '2026-27'::text
          GROUP BY scout_verified_team_match_advanced.season, scout_verified_team_match_advanced.match_id
        ), lineup_by_team AS (
         SELECT scout_player_tactical_role_observations.season,
            scout_player_tactical_role_observations.match_id,
            scout_player_tactical_role_observations.team_id,
            count(DISTINCT scout_player_tactical_role_observations.player_id) FILTER (WHERE scout_player_tactical_role_observations.verified AND scout_player_tactical_role_observations.started)::integer AS starters
           FROM scout_player_tactical_role_observations
          WHERE scout_player_tactical_role_observations.season = '2026-27'::text
          GROUP BY scout_player_tactical_role_observations.season, scout_player_tactical_role_observations.match_id, scout_player_tactical_role_observations.team_id
        ), lineup_evidence AS (
         SELECT lineup_by_team.season,
            lineup_by_team.match_id,
            count(*) FILTER (WHERE lineup_by_team.starters = 11)::integer AS complete_teams
           FROM lineup_by_team
          GROUP BY lineup_by_team.season, lineup_by_team.match_id
        )
 SELECT h.season,
    h.match_id,
    h.gameweek,
    COALESCE(a.rows, 0) AS verified_attack_players,
    COALESCE(a.chance_rows, 0) AS verified_attack_chance_players,
    COALESCE(t.complete_teams, 0) AS verified_advanced_teams,
    COALESCE(l.complete_teams, 0) AS verified_starting_elevens,
    COALESCE(a.rows, 0) < 22 OR COALESCE(a.chance_rows, 0) < 10 AS need_box,
    COALESCE(t.complete_teams, 0) < 2 AS need_stats,
    h.gameweek >= GREATEST(7, c.gw - 4) AND COALESCE(l.complete_teams, 0) < 2 AS need_lineups,
    'verified-existing-evidence-v1'::text AS policy
   FROM scout_match_history h
     CROSS JOIN last_closed c
     LEFT JOIN weekly_attack a ON a.season = h.season AND a.match_id = h.match_id
     LEFT JOIN team_evidence t ON t.season = h.season AND t.match_id = h.match_id
     LEFT JOIN lineup_evidence l ON l.season = h.season AND l.match_id = h.match_id
  WHERE h.season = '2026-27'::text AND h.match_status = 'Bitti'::text;;
REVOKE ALL ON public.scout_highlightly_fetch_requirements FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.scout_highlightly_fetch_requirements TO service_role;

CREATE OR REPLACE VIEW public.scout_highlightly_targeted_readiness WITH (security_invoker=true) AS
 SELECT count(*)::integer AS matches,
    count(*) FILTER (WHERE (NOT r.need_box OR m.box_done) AND (NOT r.need_stats OR m.stats_done) AND (NOT r.need_lineups OR m.lineups_done))::integer AS sufficient_matches,
    count(*) FILTER (WHERE m.box_done AND m.stats_done AND m.lineups_done)::integer AS fully_captured_by_highlightly,
    count(*) FILTER (WHERE r.need_box AND NOT m.box_done)::integer AS pending_box,
    count(*) FILTER (WHERE r.need_stats AND NOT m.stats_done)::integer AS pending_stats,
    count(*) FILTER (WHERE r.need_lineups AND NOT m.lineups_done)::integer AS pending_lineups,
    count(*) FILTER (WHERE NOT r.need_box AND NOT m.box_done)::integer AS box_skipped_existing_evidence,
    count(*) FILTER (WHERE NOT r.need_stats AND NOT m.stats_done)::integer AS stats_skipped_existing_evidence,
    count(*) FILTER (WHERE NOT r.need_lineups AND NOT m.lineups_done)::integer AS lineups_deferred_or_verified,
    (count(*) FILTER (WHERE r.need_box AND NOT m.box_done) + count(*) FILTER (WHERE r.need_stats AND NOT m.stats_done) + count(*) FILTER (WHERE r.need_lineups AND NOT m.lineups_done))::integer AS pending_api_calls_minimum,
    count(*) FILTER (WHERE (NOT r.need_box OR m.box_done) AND (NOT r.need_stats OR m.stats_done) AND (NOT r.need_lineups OR m.lineups_done)) = count(*) AS targeted_coverage_complete,
    false AS source_reconciled_to_player_and_team_profiles
   FROM scout_highlightly_fetch_requirements r
     JOIN scout_highlightly_matches m ON m.season = r.season AND m.match_id = r.match_id
  WHERE r.gameweek <= (( SELECT max(closed.gameweek) AS max
           FROM ( SELECT scout_match_history.gameweek
                   FROM scout_match_history
                  WHERE scout_match_history.season = '2026-27'::text
                  GROUP BY scout_match_history.gameweek
                 HAVING count(*) = 9 AND bool_and(scout_match_history.match_status = 'Bitti'::text AND scout_match_history.fantasy_closure = 'KAPANDI'::text)) closed));;
REVOKE ALL ON public.scout_highlightly_targeted_readiness FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.scout_highlightly_targeted_readiness TO service_role;
