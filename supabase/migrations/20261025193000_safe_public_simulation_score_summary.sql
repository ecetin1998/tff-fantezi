-- Secure the public 50K score summary without giving anon/authenticated
-- direct access to scout_player_projections (which includes Pro-only data).
CREATE TABLE IF NOT EXISTS public.scout_player_score_summary (
  run_id uuid NOT NULL,
  player_id integer NOT NULL,
  source_xfp numeric(7,3),
  mode_points integer,
  mode_probability numeric(7,6),
  median_points integer,
  top3_weighted_avg numeric(7,3),
  top3_coverage numeric(7,6),
  top3_outcomes jsonb,
  PRIMARY KEY (run_id,player_id),
  CONSTRAINT scout_summary_mode_bounds CHECK(mode_probability BETWEEN 0 AND 1),
  CONSTRAINT scout_summary_top3_bounds CHECK(top3_coverage BETWEEN 0 AND 1)
);
ALTER TABLE public.scout_player_score_summary ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scout_player_score_summary FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.scout_player_score_summary TO anon,authenticated;
DROP POLICY IF EXISTS scout_safe_summary_select ON public.scout_player_score_summary;
CREATE POLICY scout_safe_summary_select
 ON public.scout_player_score_summary
 FOR SELECT TO anon,authenticated USING (true);

-- An existing current model already has 50K complete histograms.
INSERT INTO public.scout_player_score_summary
 (run_id,player_id,source_xfp,mode_points,mode_probability,
 median_points,top3_weighted_avg,top3_coverage,top3_outcomes)
SELECT p.run_id,p.player_id,p.xfp,p.mode_points,p.mode_probability,
       p.median_points,p.top3_weighted_avg,p.top3_coverage,p.top3_outcomes
FROM public.scout_player_projections p
WHERE p.mode_points IS NOT NULL AND p.top3_weighted_avg IS NOT NULL
ON CONFLICT (run_id,player_id) DO UPDATE SET
 source_xfp=excluded.source_xfp,mode_points=excluded.mode_points,
 mode_probability=excluded.mode_probability,
 median_points=excluded.median_points,
 top3_weighted_avg=excluded.top3_weighted_avg,
 top3_coverage=excluded.top3_coverage,
 top3_outcomes=excluded.top3_outcomes;

CREATE OR REPLACE FUNCTION public.scout_apply_modal_predictions(
  p_run_id uuid,p_gameweek integer,p_benchmark text
)
RETURNS integer LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_updated integer;
  v_expected integer;
BEGIN
  SELECT COUNT(*) INTO v_expected
  FROM public.scout_player_projections p WHERE p.run_id=p_run_id;
  IF v_expected=0 THEN RAISE EXCEPTION 'modal predictions: run has no projections'; END IF;
  WITH histogram AS (
    SELECT a.player_id,a.draws,a.hist
    FROM public.scout_replay_sim_accum a
    WHERE a.gameweek=p_gameweek AND a.benchmark_version=p_benchmark
      AND a.draws>=50000 AND jsonb_typeof(a.hist)='array'
      AND jsonb_array_length(a.hist)=256
  ), scores AS (
    SELECT a.player_id,a.draws,(h.ord::integer-41) points,
      h.c::integer observed
    FROM histogram a
    CROSS JOIN LATERAL jsonb_array_elements_text(a.hist)
      WITH ORDINALITY h(c,ord)
  ), ranked AS (
    SELECT s.*,
      ROW_NUMBER() OVER(PARTITION BY player_id ORDER BY observed DESC,points ASC) score_rank,
      SUM(observed) OVER(PARTITION BY player_id ORDER BY points ASC) cdf,
      SUM(observed) OVER(PARTITION BY player_id) total_mass
    FROM scores s
  ), aggregations AS (
    SELECT player_id,MAX(draws) draws,
      MIN(points) FILTER(WHERE cdf >= draws/2.0) median_points,
      SUM(points::numeric*observed) FILTER(WHERE score_rank<=3 AND observed>0)
        / NULLIF(SUM(observed) FILTER(WHERE score_rank<=3 AND observed>0),0) top3_weighted_avg,
      SUM(observed) FILTER(WHERE score_rank<=3 AND observed>0)::numeric
        / MAX(draws) top3_coverage,
      jsonb_agg(jsonb_build_object(
        'points',points,
        'probability',ROUND(observed::numeric/draws,6)
      ) ORDER BY score_rank)
        FILTER(WHERE score_rank<=3 AND observed>0) top3_outcomes,
      MAX(points) FILTER(WHERE score_rank=1) mode_points,
      MAX(observed::numeric/draws) FILTER(WHERE score_rank=1) mode_probability,
      MAX(total_mass) histogram_total
    FROM ranked GROUP BY player_id
  ), ready AS (
    SELECT * FROM aggregations
    WHERE histogram_total=draws AND jsonb_array_length(top3_outcomes) BETWEEN 1 AND 3
      AND median_points IS NOT NULL AND top3_weighted_avg IS NOT NULL
  )
  UPDATE public.scout_player_projections p
    SET mode_points=x.mode_points,mode_probability=x.mode_probability,
        median_points=x.median_points,top3_weighted_avg=x.top3_weighted_avg,
        top3_coverage=x.top3_coverage,top3_outcomes=x.top3_outcomes
  FROM ready x WHERE p.run_id=p_run_id AND p.player_id=x.player_id;
  GET DIAGNOSTICS v_updated=ROW_COUNT;
  IF v_updated<>v_expected THEN
    RAISE EXCEPTION 'modal/top3/median coverage failed: % / %',v_updated,v_expected;
  END IF;
  -- Mirror ONLY six harmless distribution aggregates to an anon-safe
  -- RLS SELECT-only table. Never expose raw player projection or 256 bins.
  INSERT INTO public.scout_player_score_summary
    (run_id,player_id,source_xfp,mode_points,mode_probability,
     median_points,top3_weighted_avg,top3_coverage,top3_outcomes)
  SELECT p.run_id,p.player_id,p.xfp,p.mode_points,p.mode_probability,
         p.median_points,p.top3_weighted_avg,p.top3_coverage,p.top3_outcomes
  FROM public.scout_player_projections p
  WHERE p.run_id=p_run_id
  ON CONFLICT (run_id,player_id) DO UPDATE SET
    source_xfp=excluded.source_xfp,
    mode_points=excluded.mode_points,
    mode_probability=excluded.mode_probability,
    median_points=excluded.median_points,
    top3_weighted_avg=excluded.top3_weighted_avg,
    top3_coverage=excluded.top3_coverage,
    top3_outcomes=excluded.top3_outcomes;
  RETURN v_updated;
END;
$$;
REVOKE ALL ON FUNCTION public.scout_apply_modal_predictions(uuid,integer,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.scout_apply_modal_predictions(uuid,integer,text)
 TO service_role;


-- The security-invoker public view now joins ONLY the safe summary, never
-- the sensitive projection source. Preserve existing whitelist + order.
-- Public player-card surface: Pro percentile/ceiling, role signals and advanced attacking metrics stay off the anonymous API.
create or replace view public.v_current_player_cards_public
with (security_invoker = true)
as
select c.*,
  case when c.xfp is not null and abs(c.xfp::numeric - summary.source_xfp) < 0.005
    then summary.mode_points else null end as mode_points,
  case when c.xfp is not null and abs(c.xfp::numeric - summary.source_xfp) < 0.005
    then summary.mode_probability else null end as mode_probability,
  case when c.xfp is not null and abs(c.xfp::numeric - summary.source_xfp) < 0.005
    then summary.median_points else null end as median_points,
  case when c.xfp is not null and abs(c.xfp::numeric - summary.source_xfp) < 0.005
    then summary.top3_weighted_avg else null end as top3_weighted_avg,
  case when c.xfp is not null and abs(c.xfp::numeric - summary.source_xfp) < 0.005
    then summary.top3_coverage else null end as top3_coverage,
  case when c.xfp is not null and abs(c.xfp::numeric - summary.source_xfp) < 0.005
    then summary.top3_outcomes else null end as top3_outcomes
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
left join public.scout_player_score_summary summary
 on mode.run_id=c.run_id and mode.player_id=c.player_id;
revoke all on table public.v_current_player_cards_public from public, anon, authenticated;
grant select on table public.v_current_player_cards_public to anon, authenticated;
comment on view public.v_current_player_cards_public is
  'Public player cards: mode, P50 median, first-three-frequency conditional mean, coverage and 3 outcome probabilities. Excludes raw histograms and Pro-only statistics.';


