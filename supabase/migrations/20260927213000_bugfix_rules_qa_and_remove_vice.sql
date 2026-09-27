begin;

-- Product decision: this Scout intentionally has no vice-captain feature.
update public.scout_game_rules
set rules=rules-'vice_captain',updated_at=now()
where rules ? 'vice_captain';

-- 18-team double round-robin = 34 matchweeks.
alter table public.scout_gameweeks drop constraint if exists scout_gameweeks_gameweek_check;
alter table public.scout_gameweeks
  add constraint scout_gameweeks_gameweek_check check(gameweek between 1 and 34);

alter table public.scout_player_prices drop constraint if exists scout_player_prices_gameweek_check;
alter table public.scout_player_prices
  add constraint scout_player_prices_gameweek_check check(gameweek between 1 and 34);

-- Keep the latest deadline/snapshot validation, but remove vice captain end-to-end.
create or replace function private.save_user_squad_impl(p_members jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $fn$
declare
  v_user uuid := (select auth.uid());
  v_squad uuid;
  v_rules jsonb;
  v_formations text[];
  v_budget_limit numeric;
  v_max_per_club int;
  v_required_gk int; v_required_def int; v_required_mid int; v_required_fwd int;
  v_squad_size int; v_xi_size int; v_bench_size int; v_required_xi_gk int;
  v_count int; v_distinct int; v_active int;
  v_gk int; v_def int; v_mid int; v_fwd int;
  v_xi int; v_xi_gk int; v_xi_def int; v_xi_mid int; v_xi_fwd int;
  v_bench int; v_bench_distinct int; v_captains int;
  v_budget numeric; v_formation text; v_max_club int;
  v_gameweek integer; v_deadline timestamptz; v_captain integer;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if jsonb_typeof(p_members)<>'array' then raise exception 'INVALID_SQUAD'; end if;

  select rules into v_rules from public.scout_game_rules order by season desc limit 1;
  if v_rules is null then raise exception 'GAME_RULES_MISSING'; end if;
  v_budget_limit:=(v_rules->>'budget')::numeric;
  v_max_per_club:=(v_rules->>'max_per_club')::int;
  v_required_gk:=(v_rules->'squad'->>'GK')::int;
  v_required_def:=(v_rules->'squad'->>'DEF')::int;
  v_required_mid:=(v_rules->'squad'->>'MID')::int;
  v_required_fwd:=(v_rules->'squad'->>'FWD')::int;
  v_squad_size:=v_required_gk+v_required_def+v_required_mid+v_required_fwd;
  select array_agg(value order by ord) into v_formations
  from jsonb_array_elements_text(v_rules->'formations') with ordinality f(value,ord);
  if coalesce(array_length(v_formations,1),0)=0 then raise exception 'GAME_RULES_MISSING'; end if;
  v_required_xi_gk:=1;
  v_xi_size:=1+split_part(v_formations[1],'-',1)::int
    +split_part(v_formations[1],'-',2)::int+split_part(v_formations[1],'-',3)::int;
  v_bench_size:=v_squad_size-v_xi_size;

  select gameweek into v_gameweek from public.scout_model_runs where is_current=true;
  select deadline_at into v_deadline from public.scout_gameweeks where gameweek=v_gameweek;
  if v_gameweek is null or v_deadline is null then raise exception 'GAMEWEEK_DEADLINE_MISSING'; end if;
  if now()>=v_deadline then raise exception 'SQUAD_LOCKED'; end if;
  if exists(
    select 1 from public.scout_user_squad_snapshots
    where user_id=v_user and gameweek=v_gameweek and locked_at is not null
  ) then raise exception 'SQUAD_LOCKED'; end if;

  with payload as (
    select * from jsonb_to_recordset(p_members)
      as x(player_id int,is_captain boolean,bench_order int)
  ), joined as (
    select x.*,p.position,p.price,p.active,p.team_id
    from payload x left join public.scout_players p on p.id=x.player_id
  ), club_counts as (
    select team_id,count(*) n from joined group by team_id
  )
  select
    (select count(*) from joined),(select count(distinct player_id) from joined),
    (select count(*) from joined where active is true),
    (select count(*) from joined where position='GK'),
    (select count(*) from joined where position='DEF'),
    (select count(*) from joined where position='MID'),
    (select count(*) from joined where position='FWD'),
    (select count(*) from joined where bench_order is null),
    (select count(*) from joined where bench_order is null and position='GK'),
    (select count(*) from joined where bench_order is null and position='DEF'),
    (select count(*) from joined where bench_order is null and position='MID'),
    (select count(*) from joined where bench_order is null and position='FWD'),
    (select count(*) from joined where bench_order is not null),
    (select count(distinct bench_order) from joined where bench_order is not null),
    (select count(*) from joined where is_captain is true),
    (select coalesce(sum(price),0) from joined),
    (select coalesce(max(n),0) from club_counts),
    (select player_id from joined where is_captain is true limit 1)
  into v_count,v_distinct,v_active,v_gk,v_def,v_mid,v_fwd,
       v_xi,v_xi_gk,v_xi_def,v_xi_mid,v_xi_fwd,v_bench,v_bench_distinct,
       v_captains,v_budget,v_max_club,v_captain;

  if v_count<>v_squad_size or v_distinct<>v_squad_size then raise exception 'SQUAD_MUST_HAVE_15_UNIQUE_PLAYERS'; end if;
  if v_active<>v_squad_size then raise exception 'SQUAD_HAS_INACTIVE_OR_UNKNOWN_PLAYER'; end if;
  if not(v_gk=v_required_gk and v_def=v_required_def and v_mid=v_required_mid and v_fwd=v_required_fwd)
    then raise exception 'INVALID_POSITION_COUNTS'; end if;
  if v_budget>v_budget_limit+.0001 then raise exception 'BUDGET_EXCEEDED'; end if;
  if v_max_club>v_max_per_club then raise exception 'CLUB_LIMIT_EXCEEDED'; end if;
  if v_xi<>v_xi_size or v_xi_gk<>v_required_xi_gk then raise exception 'INVALID_STARTING_XI'; end if;
  if v_bench<>v_bench_size or v_bench_distinct<>v_bench_size then raise exception 'INVALID_BENCH'; end if;
  if exists(
    select 1 from jsonb_to_recordset(p_members) x(player_id int,is_captain boolean,bench_order int)
    where bench_order is not null and bench_order not between 1 and v_bench_size
  ) then raise exception 'INVALID_BENCH_ORDER'; end if;
  if v_captains<>1 or not exists(
    select 1 from jsonb_to_recordset(p_members) x(player_id int,is_captain boolean,bench_order int)
    where is_captain is true and bench_order is null
  ) then raise exception 'INVALID_CAPTAIN'; end if;

  v_formation:=v_xi_def::text||'-'||v_xi_mid::text||'-'||v_xi_fwd::text;
  if not(v_formation=any(v_formations)) then raise exception 'INVALID_FORMATION'; end if;

  insert into public.scout_user_squads(user_id,name,bank,is_active)
  values(v_user,'Benim Kadrom',round(v_budget_limit-v_budget,2),true)
  on conflict(user_id) where is_active=true
  do update set bank=excluded.bank,updated_at=now()
  returning id into v_squad;

  delete from public.scout_user_squad_members where squad_id=v_squad;
  insert into public.scout_user_squad_members(squad_id,player_id,is_captain,bench_order)
  select v_squad,x.player_id,coalesce(x.is_captain,false),x.bench_order
  from jsonb_to_recordset(p_members) x(player_id int,is_captain boolean,bench_order int);

  insert into public.scout_user_squad_snapshots(user_id,gameweek,members,captain_id,locked_at)
  values(v_user,v_gameweek,p_members,v_captain,null)
  on conflict(user_id,gameweek) do update
  set members=excluded.members,captain_id=excluded.captain_id,updated_at=now()
  where public.scout_user_squad_snapshots.locked_at is null;

  return jsonb_build_object(
    'ok',true,'squad_id',v_squad,'bank',round(v_budget_limit-v_budget,2),
    'formation',v_formation,'gameweek',v_gameweek,'deadline_at',v_deadline,
    'captain_id',v_captain
  );
end;
$fn$;

create or replace function public.save_user_squad(p_members jsonb)
returns jsonb
language sql
security invoker
set search_path=''
as $fn$ select private.save_user_squad_impl(p_members); $fn$;

revoke all on function private.save_user_squad_impl(jsonb) from public,anon;
grant execute on function private.save_user_squad_impl(jsonb) to authenticated;
revoke all on function public.save_user_squad(jsonb) from public,anon;
grant execute on function public.save_user_squad(jsonb) to authenticated;

drop function if exists public.save_user_squad(jsonb,integer);
drop function if exists private.save_user_squad_impl(jsonb,integer);
alter table public.scout_user_squad_snapshots drop column if exists vice_captain_id;

-- Release-gate QA for the concrete model bugs fixed in this release.
create or replace function public.scout_model_bugfix_qa(p_run_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path='public'
as $qa$
with gk_cap as (
  select count(*)::int n
  from scout_squad_recommendations r
  join scout_squad_members m on m.recommendation_id=r.id and m.is_captain=true
  join scout_players p on p.id=m.player_id
  where r.run_id=p_run_id and p.position='GK'
), xi_bad as (
  select count(*)::int n
  from scout_player_projections
  where run_id=p_run_id and coalesce(xi_probability,0)>1.000001
), def_bad as (
  select count(*)::int n
  from scout_player_projections a
  join scout_players pa on pa.id=a.player_id and pa.position='DEF'
  join scout_player_projections b on b.run_id=a.run_id and b.player_id>a.player_id
  join scout_players pb on pb.id=b.player_id and pb.position='DEF' and pb.team_id=pa.team_id
  where a.run_id=p_run_id
    and abs(coalesce(a.x_minutes,0)-coalesce(b.x_minutes,0))<=3
    and abs(coalesce(a.xi_probability,0)-coalesce(b.xi_probability,0))<=.05
    and abs(
      (coalesce(a.xfp,0)-coalesce(b.xfp,0))
      -(
        (coalesce(a.expected_goals,0)-coalesce(b.expected_goals,0))*6
        +(coalesce(a.expected_assists,0)-coalesce(b.expected_assists,0))*3
        +(coalesce(a.x_bonus,0)-coalesce(b.x_bonus,0))
      )
    )>1.0
)
select jsonb_build_object(
  'pass',(select n=0 from gk_cap) and (select n=0 from xi_bad) and (select n=0 from def_bad),
  'gk_captain',(select n from gk_cap),
  'xi_over_1',(select n from xi_bad),
  'unexplained_same_team_def_xfp_diff',(select n from def_bad)
);
$qa$;

revoke all on function public.scout_model_bugfix_qa(uuid) from public,anon,authenticated;
grant execute on function public.scout_model_bugfix_qa(uuid) to service_role;

create or replace function public.scout_promote_run(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $promote$
declare
  qa jsonb; data_qa jsonb; bugfix_qa jsonb;
  gate public.scout_run_release_gates%rowtype; run_notes text;
  availability_fresh boolean; v_gameweek integer; v_deadline timestamptz;
  qa_pass boolean;
begin
  select notes,gameweek into run_notes,v_gameweek
  from public.scout_model_runs where id=p_run_id and status='ready' for update;
  if not found then raise exception 'Run is missing or not ready' using errcode='check_violation'; end if;
  if coalesce(run_notes,'') ilike '%do not publish%' then
    raise exception 'Run is explicitly marked do not publish' using errcode='check_violation';
  end if;

  select * into gate from public.scout_run_release_gates where run_id=p_run_id;
  availability_fresh:=private.scout_availability_is_fresh(p_run_id);
  if not found or gate.qa_pass is not true or gate.data_integrity_pass is not true
    or gate.backtest_pass is not true or gate.availability_freshness is not true
    or availability_fresh is not true then
    raise exception 'Run is missing a passing release gate' using errcode='check_violation';
  end if;

  qa:=public.scout_run_qa(p_run_id);
  data_qa:=public.scout_data_integrity_qa(p_run_id);
  bugfix_qa:=public.scout_model_bugfix_qa(p_run_id);
  qa_pass:=coalesce((qa->>'pass')::boolean,false)
    and coalesce((bugfix_qa->>'pass')::boolean,false);
  qa:=qa||jsonb_build_object(
    'pass',qa_pass,
    'gk_captain',coalesce((bugfix_qa->>'gk_captain')::int,0),
    'xi_over_1',coalesce((bugfix_qa->>'xi_over_1')::int,0),
    'unexplained_same_team_def_xfp_diff',coalesce((bugfix_qa->>'unexplained_same_team_def_xfp_diff')::int,0)
  );

  insert into public.scout_run_qa_results(run_id,model_qa,data_integrity_qa,pass)
  values(p_run_id,qa,data_qa,qa_pass and coalesce((data_qa->>'pass')::boolean,false))
  on conflict(run_id) do update
  set model_qa=excluded.model_qa,data_integrity_qa=excluded.data_integrity_qa,
      pass=excluded.pass,recorded_at=now();

  if qa_pass is not true or coalesce((data_qa->>'pass')::boolean,false) is not true then
    raise exception 'Run failed production QA' using errcode='check_violation';
  end if;

  select min(kickoff_at) into v_deadline from public.scout_match_predictions where run_id=p_run_id;
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
    'data_integrity',data_qa,'release_gate',to_jsonb(gate),
    'availability_freshness',availability_fresh,'promoted',true
  );
end;
$promote$;

revoke all on function public.scout_promote_run(uuid) from public,anon,authenticated;
grant execute on function public.scout_promote_run(uuid) to service_role;

commit;
