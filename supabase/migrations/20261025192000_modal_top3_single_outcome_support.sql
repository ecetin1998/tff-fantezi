-- Some unavailable players have exactly one possible score across 50K
-- simulations. Return the genuinely observed outcomes (1..3), not fabricated
-- zero-frequency runner-ups; retain strict histogram 50000/50000 coverage.
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
  RETURN v_updated;
END;
$$;
REVOKE ALL ON FUNCTION public.scout_apply_modal_predictions(uuid,integer,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.scout_apply_modal_predictions(uuid,integer,text)
 TO service_role;
