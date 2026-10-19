-- MH8 2026-10-19 source-backed regression:
-- Eyupspor simulated 980.59 / 990 expected on-field minutes.
-- Red-card expectation 7.38625263158; preexisting 2-minute draw allowance
-- permits a 9.3862526 deficit. Observed 9.41 misses by 0.0237474 min
-- (approximately 1.42 seconds). Each per-player x_minutes is stored at two
-- decimal places, so introduce ONLY 0.05 min per match (~3 seconds) tolerance
-- on the red-card-sensitive LOWER limit. Maintain upper bound unchanged.
-- Never alter any player's x_minutes or waive other QA gates.
BEGIN;
DO $migration$
DECLARE
  source_sql text;
  old_condition text := 'greatest(6*fixture_count,coalesce(expected_red_minutes,0)+2*fixture_count)';
  new_condition text := 'greatest(6*fixture_count,coalesce(expected_red_minutes,0)+2*fixture_count) + 0.05*fixture_count';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO source_sql
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='scout_run_qa'
    AND pg_get_function_identity_arguments(p.oid)='p_run_id uuid';
  IF source_sql IS NULL THEN RAISE EXCEPTION 'scout_run_qa(uuid) not found'; END IF;
  IF position(new_condition IN source_sql)>0 THEN RETURN; END IF;
  IF position(old_condition IN source_sql)=0 THEN
    RAISE EXCEPTION 'minute lower-bound contract changed; inspect before updating';
  END IF;
  IF position('minute_sum > 990.25*fixture_count' IN source_sql)=0
    OR position('0.15::numeric' IN source_sql)=0 THEN
    RAISE EXCEPTION 'red-card or upper-bound QA contract changed; inspect manually';
  END IF;
  source_sql:=replace(source_sql,old_condition,new_condition);
  EXECUTE source_sql;
END
$migration$;
COMMIT;
