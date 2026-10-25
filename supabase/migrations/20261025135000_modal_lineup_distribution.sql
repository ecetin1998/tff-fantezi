-- Modal score comes from the EXACT histogram of 50,000 Fantasy-point simulations.
-- Unknown historical runs remain NULL until their histogram is safely finalized.
ALTER TABLE public.scout_player_projections
  ADD COLUMN IF NOT EXISTS mode_points integer NULL,
  ADD COLUMN IF NOT EXISTS mode_probability numeric NULL,
  ADD COLUMN IF NOT EXISTS typical_points numeric NULL,
  ADD COLUMN IF NOT EXISTS top3_coverage numeric NULL,
  ADD COLUMN IF NOT EXISTS top3_score_distribution jsonb NULL;
ALTER TABLE public.scout_squad_members
  ADD COLUMN IF NOT EXISTS mode_points integer NULL,
  ADD COLUMN IF NOT EXISTS mode_probability numeric NULL,
  ADD COLUMN IF NOT EXISTS typical_points numeric NULL,
  ADD COLUMN IF NOT EXISTS top3_coverage numeric NULL,
  ADD COLUMN IF NOT EXISTS top3_score_distribution jsonb NULL;

DO $
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='scout_projection_mode_bounds') THEN
  ALTER TABLE public.scout_player_projections ADD CONSTRAINT scout_projection_mode_bounds
    CHECK ((mode_points IS NULL AND mode_probability IS NULL) OR
      (mode_points BETWEEN -40 AND 215 AND mode_probability BETWEEN 0 AND 1));
 END IF;
END $;
DO $
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='scout_projection_top3_bounds') THEN
  ALTER TABLE public.scout_player_projections ADD CONSTRAINT scout_projection_top3_bounds
    CHECK ((typical_points IS NULL AND top3_coverage IS NULL AND top3_score_distribution IS NULL)
        OR (typical_points BETWEEN -40 AND 215 AND top3_coverage > 0 AND top3_coverage <= 1
            AND jsonb_typeof(top3_score_distribution) = 'array'
            AND jsonb_array_length(top3_score_distribution) = 3));
 END IF;
END $;

CREATE OR REPLACE FUNCTION public.scout_finalize_modal_projection(
  p_run_id uuid, p_gameweek integer, p_benchmark text
) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp
AS $$
DECLARE expected_rows integer;
DECLARE valid_rows integer;
DECLARE updated_rows integer;
BEGIN
 SELECT count(*) INTO expected_rows FROM public.scout_player_projections WHERE run_id=p_run_id;
 SELECT count(*) INTO valid_rows FROM public.scout_player_projections p
 JOIN public.scout_replay_sim_accum a ON a.player_id=p.player_id
   AND a.gameweek=p_gameweek AND a.benchmark_version=p_benchmark
 WHERE p.run_id=p_run_id AND a.draws=50000
   AND jsonb_typeof(a.hist)='array' AND jsonb_array_length(a.hist)=256;
 IF expected_rows <> 456 OR valid_rows <> expected_rows THEN
   RAISE EXCEPTION 'Incomplete 50K mode evidence: expected % actual %',expected_rows,valid_rows;
 END IF;
 WITH ranked AS (
 SELECT p.player_id, a.draws, bin.value::integer AS frequency,
        (bin.index-41)::integer AS points,
        row_number() OVER (
          PARTITION BY p.player_id
          ORDER BY bin.value::integer DESC,
                   abs((bin.index-41)::numeric - p.xfp) ASC,
                   (bin.index-41) ASC
        ) AS rn
 FROM public.scout_player_projections p
 JOIN public.scout_replay_sim_accum a
   ON a.player_id=p.player_id AND a.gameweek=p_gameweek AND a.benchmark_version=p_benchmark
 CROSS JOIN LATERAL jsonb_array_elements_text(a.hist) WITH ORDINALITY AS bin(value,index)
 WHERE p.run_id=p_run_id
 ), top3 AS (
 SELECT player_id,
   max(points) FILTER(WHERE rn=1) AS mode_points,
   max(frequency) FILTER(WHERE rn=1) AS mode_frequency,
   max(draws) AS draws,
   sum(points::numeric * frequency)/nullif(sum(frequency),0) AS typical_points,
   sum(frequency)::numeric / max(draws) AS coverage,
   jsonb_agg(
     jsonb_build_object('points',points,'probability',frequency::numeric / draws)
     ORDER BY rn
   ) AS scenarios
 FROM ranked WHERE rn<=3 AND frequency>0
 GROUP BY player_id
 HAVING count(*)=3
 )
 UPDATE public.scout_player_projections p
 SET mode_points=t.mode_points,
     mode_probability=t.mode_frequency::numeric/t.draws,
     typical_points=round(t.typical_points,4),
     top3_coverage=round(t.coverage,5),
     top3_score_distribution=t.scenarios
 FROM top3 t
 WHERE p.run_id=p_run_id AND p.player_id=t.player_id;
 GET DIAGNOSTICS updated_rows=ROW_COUNT;
 IF updated_rows <> expected_rows THEN
   RAISE EXCEPTION 'Incomplete top-three projection update: % of %',updated_rows,expected_rows;
 END IF;
 RETURN updated_rows;
END;
$$;
REVOKE ALL ON FUNCTION public.scout_finalize_modal_projection(uuid,integer,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.scout_finalize_modal_projection(uuid,integer,text)
 TO service_role;
