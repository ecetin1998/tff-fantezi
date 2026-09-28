begin;

create or replace function private.sync_scout_gameweek_deadline(p_season text,p_gameweek integer)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_current_season text;
  v_deadline timestamptz;
begin
  select season into v_current_season
  from public.scout_game_rules
  order by season desc
  limit 1;

  if p_season is distinct from v_current_season or p_gameweek is null then
    return;
  end if;

  select min(kickoff_at)-interval '1 hour'
    into v_deadline
  from public.scout_match_history
  where season=p_season and gameweek=p_gameweek;

  if v_deadline is null then
    return;
  end if;

  insert into public.scout_gameweeks(gameweek,deadline_at,updated_at)
  values(p_gameweek,v_deadline,now())
  on conflict(gameweek) do update
  set deadline_at=excluded.deadline_at,
      updated_at=now()
  where public.scout_gameweeks.locked_at is null;
end;
$$;

create or replace function private.sync_scout_gameweek_deadline_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if tg_op='DELETE' then
    perform private.sync_scout_gameweek_deadline(old.season,old.gameweek);
    return old;
  end if;

  perform private.sync_scout_gameweek_deadline(new.season,new.gameweek);

  if tg_op='UPDATE' and (old.season,old.gameweek) is distinct from (new.season,new.gameweek) then
    perform private.sync_scout_gameweek_deadline(old.season,old.gameweek);
  end if;

  return new;
end;
$$;

drop trigger if exists scout_match_history_deadline_sync on public.scout_match_history;
create trigger scout_match_history_deadline_sync
after insert or update of kickoff_at,gameweek,season or delete
on public.scout_match_history
for each row execute function private.sync_scout_gameweek_deadline_trigger();

do $$
declare r record;
begin
  for r in
    select season,gameweek
    from public.scout_match_history
    where season=(select season from public.scout_game_rules order by season desc limit 1)
    group by season,gameweek
  loop
    perform private.sync_scout_gameweek_deadline(r.season,r.gameweek);
  end loop;
end;
$$;

create or replace function public.scout_my_squad_page(p_gameweek integer)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_squad uuid;
  v_result jsonb;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select id into v_squad
  from public.scout_user_squads
  where user_id=v_user and is_active=true
  order by updated_at desc
  limit 1;

  with recent_snapshots as (
    select s.gameweek,s.members,s.captain_id,s.locked_at,s.updated_at
    from public.scout_user_squad_snapshots s
    where s.user_id=v_user
    order by s.gameweek desc
    limit 34
  ), snapshot_ids as (
    select distinct (x->>'player_id')::integer player_id
    from recent_snapshots rs
    cross join lateral jsonb_array_elements(coalesce(rs.members,'[]'::jsonb)) x
    where (x->>'player_id') ~ '^[0-9]+$'
  )
  select jsonb_build_object(
    'squad_id',v_squad,
    'members',coalesce((
      select jsonb_agg(jsonb_build_object(
        'player_id',m.player_id,
        'is_captain',m.is_captain,
        'bench_order',m.bench_order
      ) order by coalesce(m.bench_order,0),m.player_id)
      from public.scout_user_squad_members m
      where m.squad_id=v_squad
    ),'[]'::jsonb),
    'gameweek',coalesce((
      select jsonb_build_object(
        'gameweek',g.gameweek,
        'deadline_at',g.deadline_at,
        'locked_at',g.locked_at
      )
      from public.scout_gameweeks g
      where g.gameweek=p_gameweek
    ),'null'::jsonb),
    'snapshots',coalesce((
      select jsonb_agg(to_jsonb(rs) order by rs.gameweek desc)
      from recent_snapshots rs
    ),'[]'::jsonb),
    'points',coalesce((
      select jsonb_agg(jsonb_build_object(
        'player_id',w.player_id,
        'gameweek',w.gameweek,
        'points',w.points,
        'minutes',w.minutes,
        'is_final',w.is_final
      ))
      from public.scout_player_weekly_points w
      join snapshot_ids si on si.player_id=w.player_id
      where w.is_final=true
    ),'[]'::jsonb),
    'players',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',p.id,
        'position',p.position,
        'short_label',p.short_label,
        'display_name',p.display_name,
        'full_name',p.full_name
      ))
      from public.scout_players p
      join snapshot_ids si on si.player_id=p.id
    ),'[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.scout_my_squad_page(integer) from public,anon;
grant execute on function public.scout_my_squad_page(integer) to authenticated,service_role;

commit;
