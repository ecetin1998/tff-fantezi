-- Apply only after the audit branch is deployed to production.
-- The audited app no longer requests these internal columns.
revoke select on table public.scout_model_runs from anon,authenticated;
grant select(
  id,gameweek,model_version,generated_at,source_updated_at,simulation_count,status,is_current
) on public.scout_model_runs to anon,authenticated;

revoke select on table public.scout_availability from anon,authenticated;
grant select(
  run_id,player_id,availability_type,availability_probability,reason,checked_at,
  source_url,suspension_end,source_reason,injury_date,expected_return,suspension_fixture
) on public.scout_availability to anon,authenticated;

revoke select on table public.scout_learning_log from anon,authenticated;
grant select(
  id,after_gameweek,detected_at,component,segment,sample_size,signal,
  proposed_adjustment,applied_adjustment,status,summary_tr
) on public.scout_learning_log to anon,authenticated;
