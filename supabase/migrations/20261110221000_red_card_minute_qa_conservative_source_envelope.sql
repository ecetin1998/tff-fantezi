-- Red-card minute QA: conservative source-backed upper envelope.
--
-- Red-card probability is sampled on the *scheduled* playing exposure D/90;
-- p.x_minutes is the final (post-dismissal) expectation E[D_after].
-- Multiplying red-card incidence by E[D_after]/90 a second time silently
-- assumes E[D^2]=(E[D])^2, severely undercounting rotation uncertainty.
-- Since D is bounded by 90 per fixture, E[D^2] <= 90 E[D].
-- This replaces only that second attenuation with the mathematically valid
-- upper envelope. It preserves the 0.15 red-event cap, 6-minute floor, +2
-- red-card allowance, and the strict 990.25 upper bound.
--
-- This is QA-only; scoring rules, simulation draws and source stats do not change.
BEGIN;
DO $migration$
DECLARE
  source_sql text;
  old_term text := 'coalesce(st.red_cards,0)::numeric * greatest(coalesce(p.x_minutes,0),0) / st.minutes';
  new_term text := 'coalesce(st.red_cards,0)::numeric * 90 / st.minutes';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO source_sql
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='scout_run_qa'
    AND pg_get_function_identity_arguments(p.oid)='p_run_id uuid';
  IF source_sql IS NULL THEN
    RAISE EXCEPTION 'scout_run_qa(uuid) not found';
  END IF;
  IF position(new_term IN source_sql)>0 THEN RETURN; END IF;
  IF position(old_term IN source_sql)=0 OR
     position('or minute_sum > 990.25*fixture_count' IN source_sql)=0 OR
     position('greatest(6*fixture_count,coalesce(expected_red_minutes,0)+2*fixture_count)' IN source_sql)=0 THEN
    RAISE EXCEPTION 'unrecognized minute QA, refusing automatic replacement';
  END IF;
  source_sql := replace(source_sql,old_term,new_term);
  EXECUTE source_sql;
END
$migration$;
COMMIT;
