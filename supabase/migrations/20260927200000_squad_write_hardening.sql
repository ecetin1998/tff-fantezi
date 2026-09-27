begin;

with ranked as (
  select id,row_number() over(partition by user_id order by updated_at desc nulls last,created_at desc,id desc) rn
  from public.scout_user_squads
  where is_active=true
)
update public.scout_user_squads s
set is_active=false,updated_at=now()
from ranked r
where s.id=r.id and r.rn>1;

create unique index if not exists scout_user_squads_one_active_per_user
  on public.scout_user_squads(user_id) where is_active=true;

revoke insert,update,delete on public.scout_user_squads from authenticated;
revoke insert,update,delete on public.scout_user_squad_members from authenticated;

create or replace function public.save_user_squad(p_members jsonb)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_user uuid := auth.uid();
  v_squad uuid;
  v_count int; v_distinct int; v_active int;
  v_gk int; v_def int; v_mid int; v_fwd int;
  v_xi int; v_xi_gk int; v_xi_def int; v_xi_mid int; v_xi_fwd int;
  v_bench int; v_bench_distinct int; v_captains int;
  v_budget numeric; v_formation text; v_max_club int;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if jsonb_typeof(p_members) <> 'array' then raise exception 'INVALID_SQUAD'; end if;

  with payload as (
    select * from jsonb_to_recordset(p_members)
      as x(player_id int, is_captain boolean, bench_order int)
  ), joined as (
    select x.*, p.position, p.price, p.active, p.team_id
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
    (select coalesce(max(n),0) from club_counts)
  into v_count,v_distinct,v_active,v_gk,v_def,v_mid,v_fwd,
       v_xi,v_xi_gk,v_xi_def,v_xi_mid,v_xi_fwd,v_bench,v_bench_distinct,v_captains,v_budget,v_max_club;

  if v_count<>15 or v_distinct<>15 then raise exception 'SQUAD_MUST_HAVE_15_UNIQUE_PLAYERS'; end if;
  if v_active<>15 then raise exception 'SQUAD_HAS_INACTIVE_OR_UNKNOWN_PLAYER'; end if;
  if not (v_gk=2 and v_def=5 and v_mid=5 and v_fwd=3) then raise exception 'INVALID_POSITION_COUNTS'; end if;
  if v_budget>100.0001 then raise exception 'BUDGET_EXCEEDED'; end if;
  if v_max_club>3 then raise exception 'CLUB_LIMIT_EXCEEDED'; end if;
  if v_xi<>11 or v_xi_gk<>1 then raise exception 'INVALID_STARTING_XI'; end if;
  if v_bench<>4 or v_bench_distinct<>4 then raise exception 'INVALID_BENCH'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_members) as x(player_id int,is_captain boolean,bench_order int)
    where bench_order is not null and bench_order not between 1 and 4
  ) then raise exception 'INVALID_BENCH_ORDER'; end if;
  if v_captains<>1 or not exists (
    select 1 from jsonb_to_recordset(p_members) as x(player_id int,is_captain boolean,bench_order int)
    where is_captain is true and bench_order is null
  ) then raise exception 'INVALID_CAPTAIN'; end if;

  v_formation := v_xi_def::text||'-'||v_xi_mid::text||'-'||v_xi_fwd::text;
  if v_formation not in ('3-4-3','3-5-2','4-3-3','4-4-2','4-5-1','5-2-3','5-3-2','5-4-1') then
    raise exception 'INVALID_FORMATION';
  end if;

  insert into public.scout_user_squads(user_id,name,bank,is_active)
  values(v_user,'Benim Kadrom',round(100-v_budget,2),true)
  on conflict (user_id) where is_active=true
  do update set bank=excluded.bank,updated_at=now()
  returning id into v_squad;

  delete from public.scout_user_squad_members where squad_id=v_squad;
  insert into public.scout_user_squad_members(squad_id,player_id,is_captain,bench_order)
  select v_squad,x.player_id,coalesce(x.is_captain,false),x.bench_order
  from jsonb_to_recordset(p_members) as x(player_id int,is_captain boolean,bench_order int);

  return jsonb_build_object('ok',true,'squad_id',v_squad,'bank',round(100-v_budget,2),'formation',v_formation);
end;
$$;

revoke all on function public.save_user_squad(jsonb) from public,anon;
grant execute on function public.save_user_squad(jsonb) to authenticated;

commit;
