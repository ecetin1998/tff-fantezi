-- POST-DEPLOY ONLY: apply after the application build that reads confidence/short_label/canonical_reason is live.
-- This narrows browser-visible columns without breaking the previous production build during rollout.

revoke select on table public.scout_players from anon,authenticated;
grant select(
  id,full_name,team_id,position,price,active,updated_at,display_name,shirt_number,short_label
) on public.scout_players to anon,authenticated;

revoke select on table public.scout_player_projections from anon,authenticated;
grant select(
  run_id,player_id,opponent_name,venue,xi_probability,appearance_probability,over60_probability,
  x_minutes,core_xfp,x_bonus,xfp,p25,p75,p90,six_plus_probability,value_score,confidence,
  expected_goals,expected_assists,mc_standard_error,availability_probability,
  top25_score,top25_rank,top25_model_version
) on public.scout_player_projections to anon,authenticated;

revoke select on table public.scout_availability from anon,authenticated;
grant select(
  run_id,player_id,availability_type,availability_probability,canonical_reason,checked_at,
  suspension_end,injury_date,expected_return_date,suspension_fixture
) on public.scout_availability to anon,authenticated;

revoke select on table public.scout_player_season_stats from anon,authenticated;
grant select(
  season,player_id,through_gameweek,matches_played,starts,minutes,goals,assists,clean_sheets,
  saves,yellow_cards,red_cards,own_goals,xg_total,actual_points,six_plus_count,updated_at
) on public.scout_player_season_stats to anon,authenticated;

revoke select on table public.scout_match_history from anon,authenticated;
grant select(
  season,match_id,gameweek,kickoff_at,home_team_id,home_team_name,away_team_id,away_team_name,
  home_goals,away_goals,match_status,fantasy_closure,source_updated_at
) on public.scout_match_history to anon,authenticated;
