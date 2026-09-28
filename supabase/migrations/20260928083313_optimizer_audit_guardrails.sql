begin;

create or replace function private.guard_scout_recommendation_member()
returns trigger
language plpgsql
security invoker
set search_path=''
as $fn$
declare
  v_position text;
begin
  if coalesce(new.is_captain,false) then
    if new.squad_slot <> 'XI' then
      raise exception 'CAPTAIN_MUST_BE_STARTER' using errcode='check_violation';
    end if;
    select p.position into v_position
    from public.scout_players p
    where p.id=new.player_id;
    if v_position is null then
      raise exception 'CAPTAIN_PLAYER_NOT_FOUND' using errcode='foreign_key_violation';
    end if;
    if v_position='GK' then
      raise exception 'GK_CAPTAIN_NOT_ALLOWED' using errcode='check_violation';
    end if;
  end if;
  return new;
end;
$fn$;

revoke all on function private.guard_scout_recommendation_member() from public,anon,authenticated;
grant execute on function private.guard_scout_recommendation_member() to service_role;

drop trigger if exists scout_squad_members_captain_guard on public.scout_squad_members;
create trigger scout_squad_members_captain_guard
before insert or update of player_id,squad_slot,is_captain
on public.scout_squad_members
for each row execute function private.guard_scout_recommendation_member();

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
    )>.3
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

commit;
