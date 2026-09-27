-- Projection integrity must validate real probability/minute bounds, not penalize stable 90-minute starters.
-- The checks below are DGW-aware: a player can legitimately have up to 90 minutes per team fixture.

create or replace function public.scout_data_integrity_qa(p_run_id uuid)
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
with run_meta as (
  select id,gameweek,generated_at from scout_model_runs where id=p_run_id
),
rules_meta as (
  select season from scout_game_rules order by season desc limit 1
),
fx as (
  select m.run_id,m.match_id,m.home_team_id team_id,at.name opponent,'HOME' venue
  from scout_match_predictions m
  join scout_teams at on at.id=m.away_team_id
  where m.run_id=p_run_id
  union all
  select m.run_id,m.match_id,m.away_team_id,ht.name opponent,'AWAY' venue
  from scout_match_predictions m
  join scout_teams ht on ht.id=m.home_team_id
  where m.run_id=p_run_id
),
fixture_counts as (
  select run_id,team_id,count(*)::int fixture_count,
         min(opponent) single_opponent,min(venue) single_venue
  from fx
  group by run_id,team_id
),
fixture_check as (
  select count(*)::int mismatch_count
  from scout_player_projections p
  join scout_players sp on sp.id=p.player_id and sp.active
  left join fixture_counts fc on fc.team_id=sp.team_id and fc.run_id=p.run_id
  where p.run_id=p_run_id
    and (
      fc.team_id is null
      or (
        fc.fixture_count=1
        and (
          coalesce(p.opponent_name,'')<>coalesce(fc.single_opponent,'')
          or coalesce(p.venue,'')<>coalesce(fc.single_venue,'')
        )
      )
    )
),
actual_check as (
  select count(*)::int nonzero_points_zero_minutes
  from scout_player_weekly_points w
  cross join run_meta r
  where w.is_final=true
    and w.gameweek<r.gameweek
    and coalesce(w.points,0)<>0
    and coalesce(w.minutes,0)<=0
),
weekly_totals as (
  select player_id,sum(points)::int total_points
  from scout_player_weekly_points w
  cross join run_meta r
  where w.is_final=true and w.gameweek<r.gameweek
  group by player_id
),
season_points_check as (
  select count(*)::int mismatch_count
  from scout_players sp
  left join scout_player_season_stats s
    on s.player_id=sp.id and s.season=(select season from rules_meta)
  left join weekly_totals w on w.player_id=sp.id
  where sp.active=true
    and coalesce(s.actual_points,0)<>coalesce(w.total_points,0)
),
suspension_check as (
  select count(*)::int mismatch_count
  from scout_availability a
  join scout_players sp on sp.id=a.player_id and sp.active
  where a.run_id=p_run_id
    and a.availability_type='suspensions'
    and not exists (
      select 1
      from scout_match_predictions m
      join scout_teams ht on ht.id=m.home_team_id
      join scout_teams at on at.id=m.away_team_id
      where m.run_id=a.run_id
        and sp.team_id in (m.home_team_id,m.away_team_id)
        and coalesce(a.suspension_fixture,'') =
          to_char(m.kickoff_at at time zone 'Europe/Istanbul','DD.MM.YYYY')
          || ' • ' || ht.name || ' - ' || at.name
    )
),
public_texts as (
  select sp.id::text entity_id,sp.short_label txt from scout_players sp where sp.active
  union all
  select p.player_id::text,p.opponent_name from scout_player_projections p where p.run_id=p_run_id
  union all
  select p.player_id::text,p.role_note from scout_player_projections p where p.run_id=p_run_id
  union all
  select a.player_id::text,a.canonical_reason from scout_availability a where a.run_id=p_run_id
  union all
  select r.player_id::text,r.signal from scout_role_signals r where r.run_id=p_run_id
),
stale_gw_check as (
  select count(*)::int mismatch_count
  from public_texts t
  cross join run_meta r
  cross join lateral regexp_matches(coalesce(t.txt,''),'GW([0-9]+)','gi') m
  where (m[1])::int<>r.gameweek
),
xi_check as (
  select count(*)::int violation_count
  from scout_player_projections p
  join scout_players sp on sp.id=p.player_id and sp.active
  where p.run_id=p_run_id
    and (coalesce(p.xi_probability,0)<0 or coalesce(p.xi_probability,0)>1.000001)
),
minute_check as (
  select count(*)::int violation_count
  from scout_player_projections p
  join scout_players sp on sp.id=p.player_id and sp.active
  left join fixture_counts fc on fc.team_id=sp.team_id and fc.run_id=p.run_id
  where p.run_id=p_run_id
    and (
      coalesce(p.x_minutes,0)<0
      or coalesce(p.x_minutes,0)>90*coalesce(fc.fixture_count,0)+0.001
    )
),
shirt_check as (
  select count(*)::int violation_count from scout_players where shirt_number=0
),
name_check as (
  select count(*)::int violation_count
  from scout_players
  where position(chr(775) in coalesce(full_name,''))>0
     or position(chr(775) in coalesce(display_name,''))>0
     or position(chr(775) in coalesce(short_label,''))>0
)
select jsonb_build_object(
  'pass',
    (select mismatch_count=0 from fixture_check)
    and (select nonzero_points_zero_minutes=0 from actual_check)
    and (select mismatch_count=0 from season_points_check)
    and (select mismatch_count=0 from suspension_check)
    and (select mismatch_count=0 from stale_gw_check)
    and (select violation_count=0 from xi_check)
    and (select violation_count=0 from minute_check)
    and (select violation_count=0 from shirt_check)
    and (select violation_count=0 from name_check),
  'fixture_mismatch',(select mismatch_count from fixture_check),
  'nonzero_points_zero_minutes',(select nonzero_points_zero_minutes from actual_check),
  'season_points_mismatch',(select mismatch_count from season_points_check),
  'suspension_fixture_mismatch',(select mismatch_count from suspension_check),
  'stale_gw_text',(select mismatch_count from stale_gw_check),
  'xi_probability_out_of_bounds',(select violation_count from xi_check),
  'x_minutes_out_of_bounds',(select violation_count from minute_check),
  -- Legacy aliases retained for existing dashboards; semantics are now the true legal bounds.
  'xi_probability_over_097',(select violation_count from xi_check),
  'x_minutes_over_88',(select violation_count from minute_check),
  'shirt_number_zero',(select violation_count from shirt_check),
  'combining_dot_names',(select violation_count from name_check)
);
$function$;
