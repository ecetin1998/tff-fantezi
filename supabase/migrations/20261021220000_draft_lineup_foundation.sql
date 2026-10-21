-- Draft lineup groundwork. Existing finished rooms stay readable with legacy scoring.
create table if not exists public.scout_draft_lineups (
 room_id uuid not null references public.scout_draft_rooms(id) on delete cascade,
 team_id uuid not null references public.scout_draft_teams(id) on delete cascade,
 gameweek integer not null check(gameweek between 1 and 34),
 formation text not null,
 captain_player_id integer not null references public.scout_players(id),
 manager_card text not null default 'none',
 starters integer[] not null,
 bench integer[] not null,
 ready boolean not null default false,
 saved_at timestamptz not null default now(),
 locked_at timestamptz,
 primary key(room_id,team_id,gameweek),
 constraint draft_lineup_starters_count check(cardinality(starters)=11),
 constraint draft_lineup_bench_count check(cardinality(bench)=4)
);
alter table public.scout_draft_lineups enable row level security;
revoke all on public.scout_draft_lineups from anon;
revoke all on public.scout_draft_lineups from authenticated;
create or replace function public.scout_draft_save_lineup(
 p_room_id uuid,p_gameweek integer,p_starters integer[],p_bench integer[],
 p_captain integer,p_manager_card text default 'none',p_ready boolean default false
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare rm public.scout_draft_rooms%rowtype; team public.scout_draft_teams%rowtype;
 all_ids integer[];gk integer;df integer;md integer;fw integer;formation text;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 select * into rm from public.scout_draft_rooms where id=p_room_id for update;
 if not found then raise exception 'ROOM_NOT_FOUND'; end if;
 select * into team from public.scout_draft_teams where room_id=p_room_id and user_id=auth.uid();
 if not found then raise exception 'ROOM_ACCESS_DENIED'; end if;
 if rm.status<>'finished' then raise exception 'DRAFT_NOT_FINISHED'; end if;
 if p_gameweek<rm.gameweek or p_gameweek>34 then raise exception 'INVALID_GAMEWEEK'; end if;
 if cardinality(p_starters)<>11 or cardinality(p_bench)<>4 then raise exception 'INVALID_LINEUP_SIZE'; end if;
 all_ids:=p_starters||p_bench;
 if (select count(distinct x) from unnest(all_ids) x)<>15 then raise exception 'DUPLICATE_PLAYER'; end if;
 if (select count(*) from public.scout_draft_picks where room_id=p_room_id and team_id=team.id and player_id=any(all_ids))<>15 then raise exception 'INVALID_LINEUP_PLAYERS'; end if;
 if not p_captain=any(p_starters) then raise exception 'INVALID_CAPTAIN'; end if;
 if p_manager_card not in ('none','attack','unlimited') then raise exception 'INVALID_MANAGER_CARD'; end if;
 select count(*) filter(where sp.position='GK'),count(*) filter(where sp.position='DEF'),
 count(*) filter(where sp.position='MID'),count(*) filter(where sp.position='FWD')
 into gk,df,md,fw from public.scout_players sp where sp.id=any(p_starters);
 if gk<>1 or df<3 or md<2 or fw<1 or df+md+fw<>10 then raise exception 'INVALID_FORMATION'; end if;
 formation:=df::text||'-'||md::text||'-'||fw::text;
 if exists(select 1 from public.scout_draft_lineups where room_id=p_room_id and team_id=team.id and gameweek=p_gameweek and locked_at is not null) then raise exception 'LINEUP_LOCKED'; end if;
 insert into public.scout_draft_lineups(room_id,team_id,gameweek,formation,captain_player_id,manager_card,starters,bench,ready)
 values(p_room_id,team.id,p_gameweek,formation,p_captain,p_manager_card,p_starters,p_bench,p_ready)
 on conflict(room_id,team_id,gameweek) do update set formation=excluded.formation,captain_player_id=excluded.captain_player_id,
 manager_card=excluded.manager_card,starters=excluded.starters,bench=excluded.bench,ready=excluded.ready,saved_at=now();
 return jsonb_build_object('saved',true,'ready',p_ready,'formation',formation);
end $$;
revoke all on function public.scout_draft_save_lineup(uuid,integer,integer[],integer[],integer,text,boolean) from public,anon;
grant execute on function public.scout_draft_save_lineup(uuid,integer,integer[],integer[],integer,text,boolean) to authenticated;
