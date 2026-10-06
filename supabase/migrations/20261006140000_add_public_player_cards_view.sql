-- Public player-card surface: Pro percentile/ceiling, role signals and advanced attacking metrics stay off the anonymous API.
drop view if exists public.v_current_player_cards_public;
create view public.v_current_player_cards_public
with (security_invoker = true)
as
select
  run_id, gameweek, generated_at, source_updated_at, simulation_count, run_status, is_current,
  player_id, full_name, display_name, short_label, shirt_number, team_id, team_name, team_slug,
  "position", price, active, total_points, opponent_name, venue,
  xi_probability, appearance_probability, over60_probability, x_minutes,
  core_xfp, x_bonus, xfp, value_score, expected_goals, expected_assists,
  projection_availability_probability, confidence,
  availability_type, availability_probability, canonical_reason, checked_at,
  suspension_end, injury_date, expected_return_date, suspension_fixture,
  primary_role, role_side, role_source, role_confidence
from public.v_current_player_cards;

revoke all on table public.v_current_player_cards_public from public, anon, authenticated;
grant select on table public.v_current_player_cards_public to anon, authenticated;

comment on view public.v_current_player_cards_public is
  'Public player-card API surface. Excludes percentile/ceiling, Top-25, role-signal and advanced attacking metrics.';
