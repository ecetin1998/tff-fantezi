-- Dynamic late-injury correction applies ONLY to the active current-card read surface.
-- The frozen 50K scouting and backtest tables remain physically unchanged.
-- For fixtures yet to start, cap actionable xFP/minutes/playing probability by
-- newly reduced availability. All historical/started team fixtures are immutable.
-- Partial injury mixtures have undefined P25/P75/P90 => NULL until a new 50K run.
-- Do not describe this as a newly-simulated 50K distribution.
-- The existing view column list and permission boundaries must be retained.
CREATE OR REPLACE VIEW public.v_current_player_cards AS
SELECT r.id AS run_id,
    r.gameweek,
    r.generated_at,
    r.source_updated_at,
    r.simulation_count,
    r.status AS run_status,
    r.is_current,
    p.id AS player_id,
    p.full_name,
    p.display_name,
    p.short_label,
    p.shirt_number,
    p.team_id,
    t.name AS team_name,
    t.slug AS team_slug,
    p."position",
    p.price,
    p.active,
    ss.actual_points AS total_points,
    pr.opponent_name,
    pr.venue,
    (pr.xi_probability * live_availability.factor) AS xi_probability,
    (pr.appearance_probability * live_availability.factor) AS appearance_probability,
    (pr.over60_probability * live_availability.factor) AS over60_probability,
    (pr.x_minutes * live_availability.factor) AS x_minutes,
    (pr.core_xfp * live_availability.factor) AS core_xfp,
    (pr.x_bonus * live_availability.factor) AS x_bonus,
    (pr.xfp * live_availability.factor) AS xfp,
    (CASE WHEN live_availability.factor = 1 THEN pr.p25 WHEN live_availability.factor = 0 THEN 0::numeric ELSE NULL::numeric END) AS p25,
    (CASE WHEN live_availability.factor = 1 THEN pr.p75 WHEN live_availability.factor = 0 THEN 0::numeric ELSE NULL::numeric END) AS p75,
    (CASE WHEN live_availability.factor = 1 THEN pr.p90 WHEN live_availability.factor = 0 THEN 0::numeric ELSE NULL::numeric END) AS p90,
    (pr.six_plus_probability * live_availability.factor) AS six_plus_probability,
    (pr.value_score * live_availability.factor) AS value_score,
    (pr.expected_goals * live_availability.factor) AS expected_goals,
    (pr.expected_assists * live_availability.factor) AS expected_assists,
    pr.availability_probability AS projection_availability_probability,
    (CASE WHEN live_availability.factor = 1 THEN pr.top25_score ELSE NULL END) AS top25_score,
    (CASE WHEN live_availability.factor = 1 THEN pr.top25_rank ELSE NULL END) AS top25_rank,
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
    (rs.x_minutes * live_availability.factor) AS role_x_minutes,
    rs.team_goal_share,
    rs.team_assist_share,
    rs.availability_probability AS role_availability_probability,
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
   FROM scout_model_runs r
     JOIN scout_players p ON p.active = true
     LEFT JOIN scout_teams t ON t.id = p.team_id
     LEFT JOIN scout_game_rules gr ON true
     LEFT JOIN scout_player_season_stats ss ON ss.player_id = p.id AND ss.season = gr.season
     LEFT JOIN scout_player_projections pr ON pr.run_id = r.id AND pr.player_id = p.id
     LEFT JOIN scout_availability a ON a.run_id = r.id AND a.player_id = p.id
     LEFT JOIN scout_role_signals rs ON rs.run_id = r.id AND rs.player_id = p.id
     LEFT JOIN LATERAL (
       SELECT CASE WHEN a.availability_probability IS NOT NULL
      AND pr.availability_probability > 0
      AND a.availability_probability < pr.availability_probability
      AND EXISTS (
        SELECT 1 FROM public.scout_match_predictions future
        WHERE future.run_id = r.id
          AND (future.home_team_id = p.team_id OR future.away_team_id = p.team_id)
          AND future.kickoff_at > now()
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.scout_match_predictions started
        WHERE started.run_id = r.id
          AND (started.home_team_id = p.team_id OR started.away_team_id = p.team_id)
          AND started.kickoff_at <= now()
      )
         THEN greatest(0::numeric, least(1::numeric, a.availability_probability / pr.availability_probability))
         ELSE 1::numeric END AS factor
     ) live_availability ON true
  WHERE r.is_current = true AND gr.season = (( SELECT max(scout_game_rules.season) AS max
           FROM scout_game_rules));
