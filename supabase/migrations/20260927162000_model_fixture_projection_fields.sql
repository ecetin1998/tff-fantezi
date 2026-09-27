-- Model v2 fixture-aware projection fields. Additive/pre-deploy safe.
alter table public.scout_player_projections
  add column if not exists fixture_count integer not null default 1 check (fixture_count >= 0),
  add column if not exists blank boolean not null default false;

create or replace view public.v_current_player_cards
with (security_invoker=true)
as
select
  r.id as run_id,r.gameweek,r.generated_at,r.source_updated_at,r.simulation_count,
  r.status as run_status,r.is_current,
  p.id as player_id,p.full_name,p.display_name,p.short_label,p.shirt_number,p.team_id,
  t.name as team_name,t.slug as team_slug,p.position,p.price,p.active,
  ss.actual_points as total_points,
  pr.opponent_name,pr.venue,pr.xi_probability,pr.appearance_probability,pr.over60_probability,
  pr.x_minutes,pr.core_xfp,pr.x_bonus,pr.xfp,pr.p25,pr.p75,pr.p90,pr.six_plus_probability,
  pr.value_score,pr.expected_goals,pr.expected_assists,
  pr.availability_probability as projection_availability_probability,
  pr.top25_score,pr.top25_rank,pr.confidence,pr.fixture_count,pr.blank,
  a.availability_type,a.availability_probability,a.canonical_reason,a.checked_at,
  a.suspension_end,a.injury_date,a.expected_return_date,a.suspension_fixture,
  rs.last2_xi_probability,rs.previous2_xi_probability,rs.last2_minutes,rs.previous2_minutes,
  rs.signal,rs.predicted_xi_probability,rs.x_minutes as role_x_minutes,
  rs.team_goal_share,rs.team_assist_share,rs.availability_probability as role_availability_probability
from public.scout_model_runs r
join public.scout_players p on p.active=true
left join public.scout_teams t on t.id=p.team_id
left join public.scout_game_rules gr on true
left join public.scout_player_season_stats ss on ss.player_id=p.id and ss.season=gr.season
left join public.scout_player_projections pr on pr.run_id=r.id and pr.player_id=p.id
left join public.scout_availability a on a.run_id=r.id and a.player_id=p.id
left join public.scout_role_signals rs on rs.run_id=r.id and rs.player_id=p.id
where r.is_current=true
  and gr.season=(select max(season) from public.scout_game_rules);

grant select on public.v_current_player_cards to anon,authenticated;
