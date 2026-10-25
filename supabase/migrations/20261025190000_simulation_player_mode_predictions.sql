-- Current and future 50K simulations: most-frequent exact Fantasy points.
-- Uses existing 256-bin histogram indexed as (score + 40).
-- No new Monte Carlo run, historical score edits, or saved-squad mutations.
ALTER TABLE public.scout_player_projections
  ADD COLUMN IF NOT EXISTS mode_points integer,
  ADD COLUMN IF NOT EXISTS mode_probability numeric(7,6);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='scout_projection_mode_probability_bounds') THEN
    ALTER TABLE public.scout_player_projections
      ADD CONSTRAINT scout_projection_mode_probability_bounds
      CHECK (mode_probability IS NULL OR mode_probability BETWEEN 0 AND 1);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.scout_apply_modal_predictions(
  p_run_id uuid, p_gameweek integer, p_benchmark text
)
RETURNS integer LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_updated integer;
  v_expected integer;
BEGIN
  SELECT COUNT(*) INTO v_expected FROM public.scout_player_projections p WHERE p.run_id=p_run_id;
  IF v_expected=0 THEN
    RAISE EXCEPTION 'modal predictions: run has no player projections';
  END IF;
  WITH histogram AS (
    SELECT a.player_id,a.draws,a.hist
    FROM public.scout_replay_sim_accum a
    WHERE a.gameweek=p_gameweek AND a.benchmark_version=p_benchmark
      AND a.draws>=50000 AND jsonb_typeof(a.hist)='array'
      AND jsonb_array_length(a.hist)=256
  ),
  frequency AS (
    SELECT a.player_id,a.draws, (h.ord::integer - 41) AS points,
      h.count_text::integer AS observed
    FROM histogram a
    CROSS JOIN LATERAL jsonb_array_elements_text(a.hist)
       WITH ORDINALITY AS h(count_text,ord)
  ),
  ranked AS (
    SELECT f.*,
      ROW_NUMBER() OVER (PARTITION BY f.player_id ORDER BY f.observed DESC,f.points ASC) AS score_rank,
      SUM(f.observed) OVER (PARTITION BY f.player_id) AS histogram_total
    FROM frequency f
  ),
  modal AS (
    SELECT player_id, points, observed::numeric / draws AS probability
    FROM ranked
    WHERE score_rank=1 AND histogram_total=draws
  )
  UPDATE public.scout_player_projections p
     SET mode_points=m.points,mode_probability=m.probability
    FROM modal m
   WHERE p.run_id=p_run_id AND p.player_id=m.player_id;
  GET DIAGNOSTICS v_updated=ROW_COUNT;
  IF v_updated<>v_expected THEN
    RAISE EXCEPTION 'modal predictions coverage failed: % / %',v_updated,v_expected;
  END IF;
  RETURN v_updated;
END;
$$;
REVOKE ALL ON FUNCTION public.scout_apply_modal_predictions(uuid,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.scout_apply_modal_predictions(uuid,integer,text) TO service_role;

-- Keep all existing public player-card columns in their original order.
-- Append only the score mode and its exact probability (no raw histogram).
-- Hide distributions if late availability changed visible xFP relative
-- to the frozen Monte Carlo model, avoiding contradictory display data.
-- Public player-card surface: Pro percentile/ceiling, role signals and advanced attacking metrics stay off the anonymous API.
create or replace view public.v_current_player_cards_public
with (security_invoker = true)
as
select c.*,
  case when c.xfp is not null and abs(c.xfp::numeric - mode.xfp) < 0.005
    then mode.mode_points else null end as mode_points,
  case when c.xfp is not null and abs(c.xfp::numeric - mode.xfp) < 0.005
    then mode.mode_probability else null end as mode_probability
from (
 select
  run_id, gameweek, generated_at, source_updated_at, simulation_count, run_status, is_current,
  player_id, full_name, display_name, short_label, shirt_number, team_id, team_name, team_slug,
  "position", price, active, total_points, opponent_name, venue,
  xi_probability, appearance_probability, over60_probability, x_minutes,
  core_xfp, x_bonus, xfp, value_score,
  projection_availability_probability, confidence,
  availability_type, availability_probability, canonical_reason, checked_at,
  suspension_end, injury_date, expected_return_date, suspension_fixture,
  primary_role, role_side, role_source, role_confidence
 from public.v_current_player_cards
) c
left join public.scout_player_projections mode
 on mode.run_id=c.run_id and mode.player_id=c.player_id;
revoke all on table public.v_current_player_cards_public from public, anon, authenticated;
grant select on table public.v_current_player_cards_public to anon, authenticated;
comment on view public.v_current_player_cards_public is
  'Public player cards, appending score mode and probability from 50K histograms. Excludes raw histogram and Pro-only statistics.';
