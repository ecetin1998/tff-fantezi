begin;

alter table public.scout_subscriptions enable row level security;
alter table public.scout_user_squads enable row level security;
alter table public.scout_user_squad_members enable row level security;
alter table public.scout_pro_interest enable row level security;

revoke all on table public.scout_subscriptions from anon,authenticated;
grant select on table public.scout_subscriptions to authenticated;

revoke all on table public.scout_user_squads from anon,authenticated;
grant select,insert,update,delete on table public.scout_user_squads to authenticated;

revoke all on table public.scout_user_squad_members from anon,authenticated;
grant select,insert,update,delete on table public.scout_user_squad_members to authenticated;

revoke all on table public.scout_pro_interest from anon,authenticated;
grant select,insert on table public.scout_pro_interest to authenticated;

drop policy if exists "users update own pro interest" on public.scout_pro_interest;
drop policy if exists "users delete own pro interest" on public.scout_pro_interest;

do $$
declare r record;
begin
  for r in
    select tablename from pg_tables
    where schemaname='public' and tablename like 'scout_%'
      and tablename not in ('scout_subscriptions','scout_user_squads','scout_user_squad_members','scout_pro_interest')
  loop
    execute format(
      'revoke insert,update,delete,truncate,references,trigger on table public.%I from anon,authenticated',
      r.tablename
    );
  end loop;
end $$;

revoke select on table public.scout_availability from anon,authenticated;
grant select(
  run_id,player_id,availability_type,availability_probability,reason,checked_at,
  source_url,suspension_end,source_reason,injury_date,expected_return,suspension_fixture
) on public.scout_availability to anon,authenticated;

revoke select on table public.scout_model_runs from anon,authenticated;
grant select(
  id,gameweek,model_version,generated_at,source_updated_at,simulation_count,status,is_current
) on public.scout_model_runs to anon,authenticated;

revoke select on table public.scout_learning_log from anon,authenticated;
grant select(
  id,after_gameweek,detected_at,component,segment,sample_size,signal,
  proposed_adjustment,applied_adjustment,status,summary_tr
) on public.scout_learning_log to anon,authenticated;

alter function public.scout_run_qa(uuid) security invoker;
alter function public.scout_data_integrity_qa(uuid) security invoker;

revoke all on function public.scout_promote_run(uuid) from public,anon,authenticated;
grant execute on function public.scout_promote_run(uuid) to service_role;

revoke all on function public.apply_replay_accum_to_run(uuid,integer,text) from public,anon,authenticated;
revoke all on function public.merge_replay_sim_chunk(integer,text,integer,jsonb) from public,anon,authenticated;
revoke all on function public.enqueue_mh1_replay_chunk(integer,integer) from public,anon,authenticated;
grant execute on function public.apply_replay_accum_to_run(uuid,integer,text) to service_role;
grant execute on function public.merge_replay_sim_chunk(integer,text,integer,jsonb) to service_role;
grant execute on function public.enqueue_mh1_replay_chunk(integer,integer) to service_role;

create table if not exists public.scout_run_release_gates(
  run_id uuid primary key references public.scout_model_runs(id) on delete cascade,
  qa_pass boolean not null default false,
  data_integrity_pass boolean not null default false,
  backtest_pass boolean not null default false,
  checked_at timestamptz not null default now(),
  checked_by text,
  details jsonb not null default '{}'::jsonb
);
alter table public.scout_run_release_gates enable row level security;
revoke all on table public.scout_run_release_gates from anon,authenticated;
grant all on table public.scout_run_release_gates to service_role;

create or replace function public.scout_promote_run(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare
  qa jsonb;
  data_qa jsonb;
  gate public.scout_run_release_gates%rowtype;
  run_notes text;
begin
  select notes into run_notes
  from public.scout_model_runs
  where id=p_run_id and status='ready'
  for update;

  if not found then
    raise exception 'Run is missing or not ready' using errcode='check_violation';
  end if;

  if coalesce(run_notes,'') ilike '%do not publish%' then
    raise exception 'Run is explicitly marked do not publish' using errcode='check_violation';
  end if;

  select * into gate from public.scout_run_release_gates where run_id=p_run_id;
  if not found or gate.qa_pass is not true or gate.data_integrity_pass is not true or gate.backtest_pass is not true then
    raise exception 'Run is missing a passing release gate' using errcode='check_violation';
  end if;

  qa:=public.scout_run_qa(p_run_id);
  data_qa:=public.scout_data_integrity_qa(p_run_id);

  if coalesce((qa->>'pass')::boolean,false) is not true
    or coalesce((data_qa->>'pass')::boolean,false) is not true then
    raise exception 'Run failed production QA' using errcode='check_violation';
  end if;

  lock table public.scout_model_runs in share row exclusive mode;
  update public.scout_model_runs set is_current=false where is_current=true and id<>p_run_id;
  update public.scout_model_runs set is_current=true where id=p_run_id and status='ready';

  return qa||jsonb_build_object(
    'data_integrity',data_qa,
    'release_gate',to_jsonb(gate),
    'promoted',true
  );
end;
$$;

revoke all on function public.scout_promote_run(uuid) from public,anon,authenticated;
grant execute on function public.scout_promote_run(uuid) to service_role;

commit;
