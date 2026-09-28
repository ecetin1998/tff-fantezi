-- Keep team-minute QA compatible with simulated dismissals.
-- The lineup draw still starts at 990 team-minutes, but a red-card event
-- legitimately removes the dismissed player's remaining minutes.

do $$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef(p.oid)
    into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='scout_run_qa'
    and pg_get_function_identity_arguments(p.oid)='p_run_id uuid';

  if v_def is null then
    raise exception 'scout_run_qa(uuid) not found';
  end if;

  v_new := replace(
    v_def,
    'count(*) filter(where abs(minute_sum-990)>2)::int violations,',
    'count(*) filter(where minute_sum<984 or minute_sum>990.25)::int violations,'
  );

  if v_new = v_def then
    raise exception 'expected minute QA predicate not found';
  end if;

  execute v_new;
end $$;
