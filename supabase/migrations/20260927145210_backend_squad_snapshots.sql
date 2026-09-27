-- Squad snapshots, deadlines, price history, QA storage and current player-card view.

create table if not exists public.scout_gameweeks(
  gameweek integer primary key check(gameweek between 1 and 38),
  deadline_at timestamptz not null,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.scout_gameweeks enable row level security;
drop policy if exists scout_gameweeks_public_read on public.scout_gameweeks;
create policy scout_gameweeks_public_read on public.scout_gameweeks for select to anon,authenticated using(true);
revoke all on public.scout_gameweeks from anon,authenticated;
grant select(gameweek,deadline_at,locked_at) on public.scout_gameweeks to anon,authenticated;
grant all on public.scout_gameweeks to service_role;

insert into public.scout_gameweeks(gameweek,deadline_at)
select r.gameweek,min(m.kickoff_at)
from public.scout_model_runs r
join public.scout_match_predictions m on m.run_id=r.id
group by r.gameweek
on conflict(gameweek) do update set deadline_at=excluded.deadline_at,updated_at=now();

create table if not exists public.scout_user_squad_snapshots(
  user_id uuid not null references auth.users(id) on delete cascade,
  gameweek integer not null references public.scout_gameweeks(gameweek) on delete restrict,
  members jsonb not null,
  captain_id integer not null references public.scout_players(id),
  vice_captain_id integer references public.scout_players(id),
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_id,gameweek)
);
alter table public.scout_user_squad_snapshots enable row level security;
drop policy if exists scout_user_squad_snapshots_owner_read on public.scout_user_squad_snapshots;
create policy scout_user_squad_snapshots_owner_read on public.scout_user_squad_snapshots
for select to authenticated using((select auth.uid())=user_id);
revoke all on public.scout_user_squad_snapshots from anon,authenticated;
grant select on public.scout_user_squad_snapshots to authenticated;
grant all on public.scout_user_squad_snapshots to service_role;

create or replace function private.lock_due_squad_snapshots()
returns integer
language plpgsql
security definer
set search_path=''
as $fn$
declare v_count integer;
begin
  update public.scout_user_squad_snapshots s
  set locked_at=g.deadline_at,updated_at=now()
  from public.scout_gameweeks g
  where g.gameweek=s.gameweek
    and s.locked_at is null
    and now()>=g.deadline_at;
  get diagnostics v_count=row_count;

  update public.scout_gameweeks
  set locked_at=coalesce(locked_at,deadline_at),updated_at=now()
  where locked_at is null and now()>=deadline_at;

  return v_count;
end;
$fn$;
revoke all on function private.lock_due_squad_snapshots() from public,anon,authenticated;
grant execute on function private.lock_due_squad_snapshots() to service_role;

create extension if not exists pg_cron with schema pg_catalog;
do $block$
declare j bigint;
begin
  for j in select jobid from cron.job where jobname='lock-fantasy-squad-snapshots' loop
    perform cron.unschedule(j);
  end loop;
  perform cron.schedule(
    'lock-fantasy-squad-snapshots',
    '* * * * *',
    'select private.lock_due_squad_snapshots();'
  );
end;
$block$;

create table if not exists public.scout_player_prices(
  player_id integer not null references public.scout_players(id) on delete cascade,
  gameweek integer not null check(gameweek between 1 and 38),
  price numeric not null,
  recorded_at timestamptz not null default now(),
  primary key(player_id,gameweek)
);
alter table public.scout_player_prices enable row level security;
drop policy if exists scout_player_prices_public_read on public.scout_player_prices;
create policy scout_player_prices_public_read on public.scout_player_prices for select to anon,authenticated using(true);
revoke all on public.scout_player_prices from anon,authenticated;
grant select on public.scout_player_prices to anon,authenticated;
grant all on public.scout_player_prices to service_role;

create table if not exists public.scout_run_qa_results(
  run_id uuid primary key references public.scout_model_runs(id) on delete cascade,
  model_qa jsonb not null,
  data_integrity_qa jsonb not null,
  pass boolean not null,
  recorded_at timestamptz not null default now()
);
alter table public.scout_run_qa_results enable row level security;
drop policy if exists scout_run_qa_results_public_read on public.scout_run_qa_results;
create policy scout_run_qa_results_public_read on public.scout_run_qa_results for select to anon,authenticated using(true);
revoke all on public.scout_run_qa_results from anon,authenticated;
grant select on public.scout_run_qa_results to anon,authenticated;
grant all on public.scout_run_qa_results to service_role;

create or replace view public.v_current_player_cards
with (security_invoker=true)
as
select
  r.id run_id,r.gameweek,r.generated_at,r.source_updated_at,r.simulation_count,r.status run_status,r.is_current,
  p.id player_id,p.full_name,p.display_name,p.short_label,p.shirt_number,p.team_id,
  t.name team_name,t.slug team_slug,p.position,p.price,p.active,
  ss.actual_points total_points,
  pr.opponent_name,pr.venue,pr.xi_probability,pr.appearance_probability,pr.over60_probability,
  pr.x_minutes,pr.core_xfp,pr.x_bonus,pr.xfp,pr.p25,pr.p75,pr.p90,pr.six_plus_probability,
  pr.value_score,pr.expected_goals,pr.expected_assists,pr.availability_probability projection_availability_probability,
  pr.top25_score,pr.top25_rank,pr.confidence,
  a.availability_type,a.availability_probability,a.canonical_reason,a.checked_at,a.suspension_end,
  a.injury_date,a.expected_return_date,a.suspension_fixture,
  rs.last2_xi_probability,rs.previous2_xi_probability,rs.last2_minutes,rs.previous2_minutes,
  rs.signal,rs.predicted_xi_probability,rs.x_minutes role_x_minutes,
  rs.team_goal_share,rs.team_assist_share,rs.availability_probability role_availability_probability
from public.scout_model_runs r
join public.scout_players p on p.active=true
left join public.scout_teams t on t.id=p.team_id
left join public.scout_game_rules gr on true
left join public.scout_player_season_stats ss on ss.player_id=p.id and ss.season=gr.season
left join public.scout_player_projections pr on pr.run_id=r.id and pr.player_id=p.id
left join public.scout_availability a on a.run_id=r.id and a.player_id=p.id
left join public.scout_role_signals rs on rs.run_id=r.id and rs.player_id=p.id
where r.is_current=true
  and gr.season=(select max(season) from public.scout_game_rules);
revoke all on public.v_current_player_cards from anon,authenticated;
grant select on public.v_current_player_cards to anon,authenticated;

create or replace function private.save_user_squad_impl(p_members jsonb,p_vice_captain_id integer default null)
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
  v_xi_size:=1+split_part(v_formations[1],'-',1)::int+split_part(v_formations[1],'-',2)::int+split_part(v_formations[1],'-',3)::int;
  v_bench_size:=v_squad_size-v_xi_size;

  select gameweek into v_gameweek from public.scout_model_runs where is_current=true;
  select deadline_at into v_deadline from public.scout_gameweeks where gameweek=v_gameweek;
  if v_gameweek is null or v_deadline is null then raise exception 'GAMEWEEK_DEADLINE_MISSING'; end if;
  if now()>=v_deadline then raise exception 'SQUAD_LOCKED'; end if;
  if exists(select 1 from public.scout_user_squad_snapshots where user_id=v_user and gameweek=v_gameweek and locked_at is not null)
    then raise exception 'SQUAD_LOCKED'; end if;

  with payload as (
    select * from jsonb_to_recordset(p_members) as x(player_id int,is_captain boolean,bench_order int)
  ), joined as (
    select x.*,p.position,p.price,p.active,p.team_id
    from payload x left join public.scout_players p on p.id=x.player_id
  ), club_counts as (
    select team_id,count(*) n from joined group by team_id
  )
  select
    (select count(*) from joined),(select count(distinct player_id) from joined),(select count(*) from joined where active is true),
    (select count(*) from joined where position='GK'),(select count(*) from joined where position='DEF'),
    (select count(*) from joined where position='MID'),(select count(*) from joined where position='FWD'),
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
       v_xi,v_xi_gk,v_xi_def,v_xi_mid,v_xi_fwd,v_bench,v_bench_distinct,v_captains,
       v_budget,v_max_club,v_captain;

  if v_count<>v_squad_size or v_distinct<>v_squad_size then raise exception 'SQUAD_MUST_HAVE_15_UNIQUE_PLAYERS'; end if;
  if v_active<>v_squad_size then raise exception 'SQUAD_HAS_INACTIVE_OR_UNKNOWN_PLAYER'; end if;
  if not(v_gk=v_required_gk and v_def=v_required_def and v_mid=v_required_mid and v_fwd=v_required_fwd) then raise exception 'INVALID_POSITION_COUNTS'; end if;
  if v_budget>v_budget_limit+.0001 then raise exception 'BUDGET_EXCEEDED'; end if;
  if v_max_club>v_max_per_club then raise exception 'CLUB_LIMIT_EXCEEDED'; end if;
  if v_xi<>v_xi_size or v_xi_gk<>v_required_xi_gk then raise exception 'INVALID_STARTING_XI'; end if;
  if v_bench<>v_bench_size or v_bench_distinct<>v_bench_size then raise exception 'INVALID_BENCH'; end if;
  if exists(select 1 from jsonb_to_recordset(p_members) x(player_id int,is_captain boolean,bench_order int)
            where bench_order is not null and bench_order not between 1 and v_bench_size)
    then raise exception 'INVALID_BENCH_ORDER'; end if;
  if v_captains<>1 or not exists(select 1 from jsonb_to_recordset(p_members) x(player_id int,is_captain boolean,bench_order int)
                                  where is_captain is true and bench_order is null)
    then raise exception 'INVALID_CAPTAIN'; end if;
  if p_vice_captain_id is not null then
    if p_vice_captain_id=v_captain
      or not exists(select 1 from jsonb_to_recordset(p_members) x(player_id int,is_captain boolean,bench_order int)
                    where player_id=p_vice_captain_id and bench_order is null and coalesce(is_captain,false)=false)
      then raise exception 'INVALID_VICE_CAPTAIN'; end if;
  end if;

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

  insert into public.scout_user_squad_snapshots(user_id,gameweek,members,captain_id,vice_captain_id,locked_at)
  values(v_user,v_gameweek,p_members,v_captain,p_vice_captain_id,null)
  on conflict(user_id,gameweek) do update
  set members=excluded.members,captain_id=excluded.captain_id,vice_captain_id=excluded.vice_captain_id,updated_at=now()
  where public.scout_user_squad_snapshots.locked_at is null;

  return jsonb_build_object('ok',true,'squad_id',v_squad,'bank',round(v_budget_limit-v_budget,2),
    'formation',v_formation,'gameweek',v_gameweek,'deadline_at',v_deadline,
    'captain_id',v_captain,'vice_captain_id',p_vice_captain_id);
end;
$fn$;
revoke all on function private.save_user_squad_impl(jsonb,integer) from public,anon;
grant execute on function private.save_user_squad_impl(jsonb,integer) to authenticated;

create or replace function public.save_user_squad(p_members jsonb)
returns jsonb language sql security invoker set search_path=''
as $fn$ select private.save_user_squad_impl(p_members,null); $fn$;
create or replace function public.save_user_squad(p_members jsonb,p_vice_captain_id integer)
returns jsonb language sql security invoker set search_path=''
as $fn$ select private.save_user_squad_impl(p_members,p_vice_captain_id); $fn$;
revoke all on function public.save_user_squad(jsonb) from public,anon;
revoke all on function public.save_user_squad(jsonb,integer) from public,anon;
grant execute on function public.save_user_squad(jsonb) to authenticated;
grant execute on function public.save_user_squad(jsonb,integer) to authenticated;

create or replace function public.scout_promote_run(p_run_id uuid)
returns jsonb
language plpgsql security definer set search_path='public'
as $fn$
declare
  qa jsonb; data_qa jsonb; gate public.scout_run_release_gates%rowtype; run_notes text;
  availability_fresh boolean; v_gameweek integer; v_deadline timestamptz;
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

  return qa||jsonb_build_object('data_integrity',data_qa,'release_gate',to_jsonb(gate),
    'availability_freshness',availability_fresh,'promoted',true);
end;
$fn$;
revoke all on function public.scout_promote_run(uuid) from public,anon,authenticated;
grant execute on function public.scout_promote_run(uuid) to service_role;
