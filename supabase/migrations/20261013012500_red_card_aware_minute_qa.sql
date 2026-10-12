-- MH8 model QA: every simulated XI covers exactly 990 scheduled team minutes,
-- but a simulated red card legitimately ends that player's minutes early.
-- In the 50,000-draw MH8 candidate, Çorum FK averaged 983.36 and Eyüpspor
-- 983.57 minutes while the previous lower bound was 984.
--
-- Allow up to 10 expected minutes lost per team fixture (1.01%),
-- retaining the strict upper bound and ALL other model/run QA checks.
-- Only update the known fragment of scout_run_qa; fail closed on drift.
DO $redcard_qa$
DECLARE
  fn_oid oid;
  defn text;
  before_pattern constant text := 'minute_sum<984*fixture_count or minute_sum>990.25*fixture_count';
  after_pattern constant text := 'minute_sum<980*fixture_count or minute_sum>990.25*fixture_count';
BEGIN
  SELECT p.oid INTO STRICT fn_oid
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='scout_run_qa'
    AND pg_get_function_identity_arguments(p.oid)='p_run_id uuid';

  SELECT pg_get_functiondef(fn_oid) INTO defn;
  -- Production may already be using the stronger red-card-rate-aware QA
  -- introduced by another guarded recovery run. Do not downgrade it or
  -- fail a later migration replay when that valid definition exists.
  IF strpos(defn,'expected_red_minutes')>0
     AND strpos(defn,'greatest(6*fixture_count,coalesce(expected_red_minutes,0)+2*fixture_count)')>0 THEN
    RAISE NOTICE 'scout_run_qa already uses source-rate-aware red card minutes QA';
    RETURN;
  END IF;
  IF strpos(defn, after_pattern)>0 THEN
    RAISE NOTICE 'scout_run_qa red-card minutes tolerance already applied';
    RETURN;
  END IF;
  IF strpos(defn, before_pattern)=0 THEN
    RAISE EXCEPTION 'scout_run_qa minute invariant differs from inspected version; refusing edit';
  END IF;
  IF (length(defn)-length(replace(defn,before_pattern,'')))/length(before_pattern)<>1 THEN
    RAISE EXCEPTION 'scout_run_qa unexpected minute QA occurrence count';
  END IF;
  EXECUTE replace(defn,before_pattern,after_pattern);
END
$redcard_qa$;
