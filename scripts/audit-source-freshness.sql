-- Fantezi Lig Rehberi: read-only MH source freshness audit.
-- Run using a trusted admin SQL session. No source data or fantasy scores are modified.
-- Missing provider values are UNKNOWN; never COALESCE optional advanced fields to 0.

-- Layer-level coverage: completed match weeks vs. cumulative/model inputs.
WITH closed AS (
  SELECT max(gameweek) AS week FROM (
    SELECT gameweek
    FROM public.scout_match_history
    GROUP BY gameweek
    HAVING count(*)=9
       AND bool_and(match_status='Bitti' AND fantasy_closure='KAPANDI')
  ) completed
), player_base AS (
  SELECT p.id, p.full_name, p.role_confidence,
         s.through_gameweek AS core_week, s.advanced_through_gameweek AS advanced_week
  FROM public.scout_players p
  LEFT JOIN public.scout_player_season_stats s
    ON s.player_id=p.id AND s.season='2026-27'
  WHERE p.active
), team_base AS (
  SELECT t.id, t.name, s.through_gameweek AS core_week,
         p.advanced_profile_through_gameweek AS advanced_week,
         p.aggregate_through_gameweek AS aggregate_week
  FROM public.scout_teams t
  LEFT JOIN public.scout_team_season_stats s ON s.team_id=t.id
  LEFT JOIN public.scout_team_tactical_profiles p
    ON p.team_id=t.id AND p.season='2026-27'
  WHERE t.active
), audit AS (
  SELECT 'player_core' AS layer, count(*) AS total,
         count(*) FILTER (WHERE core_week IS NULL OR core_week < (SELECT week FROM closed)) AS lagging,
         min(core_week) AS min_week,max(core_week) AS max_week FROM player_base
  UNION ALL SELECT 'player_advanced',count(*),
         count(*) FILTER (WHERE advanced_week IS NULL OR advanced_week < (SELECT week FROM closed)),
         min(advanced_week),max(advanced_week) FROM player_base
  UNION ALL SELECT 'player_role_low_confidence',count(*),
         count(*) FILTER (WHERE role_confidence IS NULL OR role_confidence < 0.8),
         NULL::integer,NULL::integer FROM player_base
  UNION ALL SELECT 'team_core',count(*),
         count(*) FILTER (WHERE core_week IS NULL OR core_week < (SELECT week FROM closed)),
         min(core_week),max(core_week) FROM team_base
  UNION ALL SELECT 'team_advanced_detail',count(*),
         count(*) FILTER (WHERE advanced_week IS NULL OR advanced_week < (SELECT week FROM closed)),
         min(advanced_week),max(advanced_week) FROM team_base
  UNION ALL SELECT 'team_aggregate',count(*),
         count(*) FILTER (WHERE aggregate_week IS NULL OR aggregate_week < (SELECT week FROM closed)),
         min(aggregate_week),max(aggregate_week) FROM team_base
), weekly_attack AS (
  SELECT gameweek,count(*) AS entries,
         count(*) FILTER (WHERE xg IS NOT NULL) AS xg_observed,
         count(*) FILTER (WHERE xa IS NOT NULL) AS xa_observed
  FROM public.scout_verified_weekly_attack
  WHERE gameweek BETWEEN (SELECT week-3 FROM closed) AND (SELECT week FROM closed)
  GROUP BY gameweek
)
SELECT (SELECT week FROM closed) AS last_completed_week,
       (SELECT jsonb_agg(a ORDER BY layer) FROM audit a) AS layer_audit,
       (SELECT jsonb_agg(w ORDER BY gameweek) FROM weekly_attack w) AS last4_verified_attack;

-- Detailed queue: one row per stale active player / team.
WITH closed AS (
  SELECT max(gameweek) AS week FROM (
    SELECT gameweek
    FROM public.scout_match_history
    GROUP BY gameweek
    HAVING count(*)=9
       AND bool_and(match_status='Bitti' AND fantasy_closure='KAPANDI')
  ) completed
), stale AS (
  SELECT 'player'::text AS entity_kind, p.id::bigint AS entity_id,
         p.full_name AS entity_name,
         s.advanced_through_gameweek AS observed_through_week,
         (SELECT week FROM closed) AS expected_through_week,
         'advanced cumulative (verify source window before backfill)'::text AS gap_type
  FROM public.scout_players p
  LEFT JOIN public.scout_player_season_stats s
    ON s.player_id=p.id AND s.season='2026-27'
  WHERE p.active
    AND (s.advanced_through_gameweek IS NULL OR s.advanced_through_gameweek < (SELECT week FROM closed))
  UNION ALL
  SELECT 'team',t.id,t.name,tp.advanced_profile_through_gameweek,
         (SELECT week FROM closed),
         'detailed tactical/event profile (aggregate may be newer)'
  FROM public.scout_teams t
  LEFT JOIN public.scout_team_tactical_profiles tp
    ON tp.team_id=t.id AND tp.season='2026-27'
  WHERE t.active
    AND (tp.advanced_profile_through_gameweek IS NULL OR tp.advanced_profile_through_gameweek < (SELECT week FROM closed))
)
SELECT *,expected_through_week-observed_through_week AS lag_weeks
FROM stale ORDER BY entity_kind, lag_weeks DESC NULLS FIRST, entity_name;
