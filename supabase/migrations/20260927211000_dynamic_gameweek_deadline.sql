-- Keep gameweek deadlines derived from canonical game rules on every promotion.
update public.scout_game_rules
set rules=jsonb_set(rules,'{deadline_offset_minutes}','60'::jsonb,true),
    updated_at=now()
where season='2026-27';

create or replace function public.scout_promote_run(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  qa jsonb; data_qa jsonb; gate public.scout_run_release_gates%rowtype; run_notes text;
  availability_fresh boolean; v_gameweek integer; v_deadline timestamptz; v_deadline_offset integer;
begin
  select notes,gameweek into run_notes,v_gameweek
  from public.scout_model_runs where id=p_run_id and status='ready' for update;
  if not found then raise exception 'Run is missing or not ready' using errcode='check_violation'; end if;
  if coalesce(run_notes,'') ilike '%do not publish%' then raise exception 'Run is explicitly marked do not publish' using errcode='check_violation'; end if;

  select * into gate from public.scout_run_release_gates where run_id=p_run_id;
  availability_fresh:=private.scout_availability_is_fresh(p_run_id);
  if not found or gate.qa_pass is not true or gate.data_integrity_pass is not true
    or gate.backtest_pass is not true or gate.availability_freshness is not true or availability_fresh is not true then
    raise exception 'Run is missing a passing release gate' using errcode='check_violation';
  end if;

  qa:=public.scout_run_qa(p_run_id);
  data_qa:=public.scout_data_integrity_qa(p_run_id);
  insert into public.scout_run_qa_results(run_id,model_qa,data_integrity_qa,pass)
  values(p_run_id,qa,data_qa,coalesce((qa->>'pass')::boolean,false) and coalesce((data_qa->>'pass')::boolean,false))
  on conflict(run_id) do update set model_qa=excluded.model_qa,data_integrity_qa=excluded.data_integrity_qa,
    pass=excluded.pass,recorded_at=now();

  if coalesce((qa->>'pass')::boolean,false) is not true or coalesce((data_qa->>'pass')::boolean,false) is not true then
    raise exception 'Run failed production QA' using errcode='check_violation';
  end if;

  select coalesce((rules->>'deadline_offset_minutes')::integer,60)
    into v_deadline_offset
  from public.scout_game_rules
  where season='2026-27';

  select min(kickoff_at)-make_interval(mins=>coalesce(v_deadline_offset,60))
    into v_deadline
  from public.scout_match_predictions
  where run_id=p_run_id;

  if v_deadline is null then raise exception 'Run has no gameweek deadline' using errcode='check_violation'; end if;

  insert into public.scout_gameweeks(gameweek,deadline_at)
  values(v_gameweek,v_deadline)
  on conflict(gameweek) do update set deadline_at=excluded.deadline_at,updated_at=now();

  insert into public.scout_player_prices(player_id,gameweek,price)
  select id,v_gameweek,price from public.scout_players where active=true
  on conflict(player_id,gameweek) do update set price=excluded.price,recorded_at=now();

  lock table public.scout_model_runs in share row exclusive mode;
  update public.scout_model_runs set is_current=false where is_current=true and id<>p_run_id;
  update public.scout_model_runs set is_current=true where id=p_run_id and status='ready';

  return qa||jsonb_build_object(
    'data_integrity',data_qa,
    'release_gate',to_jsonb(gate),
    'availability_freshness',availability_fresh,
    'deadline_at',v_deadline,
    'deadline_offset_minutes',coalesce(v_deadline_offset,60),
    'promoted',true
  );
end;
$$;
