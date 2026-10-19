-- Hotfix for the already-applied 20261019195000 migration on production:
-- The unparenthesized "+ 0.05" appeared AFTER the minus, making the lower
-- limit 0.05 minutes STRICTER, not more tolerant. Parenthesize the full
-- allowance as 990*fixture_count - (greatest(...)+0.05*fixture_count).
-- Idempotent when the first migration is already corrected in a clean install.
BEGIN;
DO $migration$
DECLARE
  source_sql text;
  wrong_condition text := 'greatest(6*fixture_count,coalesce(expected_red_minutes,0)+2*fixture_count) + 0.05*fixture_count';
  correct_condition text := '(greatest(6*fixture_count,coalesce(expected_red_minutes,0)+2*fixture_count)+0.05*fixture_count)';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO source_sql
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='scout_run_qa'
    AND pg_get_function_identity_arguments(p.oid)='p_run_id uuid';
  IF source_sql IS NULL THEN RAISE EXCEPTION 'scout_run_qa(uuid) not found'; END IF;
  IF position(correct_condition IN source_sql)>0 THEN RETURN; END IF;
  IF position(wrong_condition IN source_sql)=0 OR
     position('or minute_sum > 990.25*fixture_count' IN source_sql)=0 THEN
    RAISE EXCEPTION 'unexpected existing minute QA, do not modify automatically';
  END IF;
  source_sql := replace(source_sql,wrong_condition,correct_condition);
  EXECUTE source_sql;
END
$migration$;
COMMIT;
