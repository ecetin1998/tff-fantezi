-- Draft Arena lineups. Existing rooms retain legacy 15-player scoring.
-- New drafts move from completed selection into lineup setup and then their league.
alter table public.scout_draft_rooms
 add column if not exists lineup_required boolean not null default true,
 add column if not exists league_active_at timestamptz;
-- Existing rooms were created before this feature. Do not change their scoring.
update public.scout_draft_rooms set lineup_required=false
where lineup_required is true;

create table if not exists public.scout_draft_lineups(
 room_id uuid not null references public.scout_draft_rooms(id) on delete cascade,
 team_id uuid not null references public.scout_draft_teams(id) on delete cascade,
 gameweek integer not null check(gameweek between 1 and 34),
 formation text not null,
 captain_player_id integer not null references public.scout_players(id),
 manager_card text not null default 'none'
   check(manager_card in ('none','triple_captain','quad_captain','bench_boost')),
 starters integer[] not null check(cardinality(starters)=11),
 bench integer[] not null check(cardinality(bench)=4),
 ready boolean not null default false,
 saved_at timestamptz not null default clock_timestamp(),
 primary key(room_id,team_id,gameweek)
);
alter table public.scout_draft_lineups enable row level security;
revoke all on table public.scout_draft_lineups from anon,authenticated;
create unique index if not exists scout_draft_manager_card_once
 on public.scout_draft_lineups(room_id,team_id,manager_card)
 where manager_card<>'none';
create index if not exists scout_draft_lineup_team_weeks
 on public.scout_draft_lineups(room_id,team_id,gameweek desc);

create or replace function public.scout_draft_lineup_state(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 rm public.scout_draft_rooms%rowtype; mine public.scout_draft_teams%rowtype;
 chosen_week int;deadline timestamptz;members jsonb;my_lineup jsonb; all_ready boolean;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 select * into rm from public.scout_draft_rooms where id=p_room_id;
 if not found then raise exception 'ROOM_NOT_FOUND';end if;
 select * into mine from public.scout_draft_teams where room_id=rm.id and user_id=auth.uid();
 if not found then raise exception 'ROOM_ACCESS_DENIED';end if;
 if rm.status<>'finished' then raise exception 'DRAFT_NOT_FINISHED';end if;
 select greatest(rm.gameweek,coalesce((select max(gameweek) from public.scout_model_runs
 where is_current=true and status='ready'),rm.gameweek)) into chosen_week;
 select deadline_at into deadline from public.scout_gameweeks where gameweek=chosen_week;
 select coalesce(jsonb_agg(jsonb_build_object(
 'team_id',t.id,'name',t.team_name,'mine',t.id=mine.id,
 'ready',coalesce(l.ready,false),'formation',case when rm.league_active_at is not null then l.formation else null end
 ) order by t.draft_order),'[]'::jsonb) into members
 from public.scout_draft_teams t
 left join public.scout_draft_lineups l
 on l.room_id=rm.id and l.team_id=t.id and l.gameweek=chosen_week
 where t.room_id=rm.id;
 select jsonb_build_object('starters',l.starters,'bench',l.bench,
   'captain',l.captain_player_id,
   'card',case when l.gameweek=chosen_week then l.manager_card else 'none' end,
   'ready',case when l.gameweek=chosen_week then l.ready else false end,
   'saved_at',l.saved_at,'formation',l.formation,'based_on_gameweek',l.gameweek)
 into my_lineup
 from public.scout_draft_lineups l
 where l.room_id=rm.id and l.team_id=mine.id and l.gameweek<=chosen_week
 order by l.gameweek desc limit 1;
 select count(*)=count(*) filter(where l.ready is true) into all_ready
 from public.scout_draft_teams t
 left join public.scout_draft_lineups l on l.room_id=rm.id and l.team_id=t.id
 and l.gameweek=chosen_week where t.room_id=rm.id;
 return jsonb_build_object(
 'room_id',rm.id,'gameweek',chosen_week,'draft_gameweek',rm.gameweek,
 'deadline_at',deadline,'can_edit',deadline is not null and clock_timestamp()<deadline,
 'lineup_required',rm.lineup_required,
 'league_active',not rm.lineup_required or rm.league_active_at is not null,
 'league_active_at',rm.league_active_at,
 'all_ready',all_ready,'teams',members,'my',my_lineup);
end $$;

create or replace function public.scout_draft_save_lineup(
 p_room_id uuid,p_gameweek integer,p_starters integer[],p_bench integer[],
 p_captain integer,p_manager_card text default 'none',p_ready boolean default true
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 rm public.scout_draft_rooms%rowtype; tm public.scout_draft_teams%rowtype;
 all_ids integer[];gk integer;df integer;md integer;fw integer;formation text;
 deadline timestamptz;current_week integer;is_all_ready boolean;old_card text;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select * into rm from public.scout_draft_rooms where id=p_room_id for update;
 if not found then raise exception 'ROOM_NOT_FOUND';end if;
 select * into tm from public.scout_draft_teams where room_id=rm.id and user_id=auth.uid();
 if not found then raise exception 'ROOM_ACCESS_DENIED';end if;
 if rm.status<>'finished' or not rm.lineup_required then raise exception 'DRAFT_NOT_FINISHED';end if;
 select greatest(rm.gameweek,coalesce((select max(gameweek) from public.scout_model_runs
 where is_current=true and status='ready'),rm.gameweek)) into current_week;
 if p_gameweek is distinct from current_week or p_gameweek>34 then raise exception 'INVALID_GAMEWEEK';end if;
 select deadline_at into deadline from public.scout_gameweeks where gameweek=p_gameweek;
 if deadline is null or clock_timestamp()>=deadline then raise exception 'LINEUP_LOCKED';end if;
 if cardinality(p_starters)<>11 or cardinality(p_bench)<>4 then raise exception 'INVALID_LINEUP_SIZE';end if;
 all_ids:=p_starters||p_bench;
 if (select count(distinct x) from unnest(all_ids) x)<>15 then raise exception 'DUPLICATE_PLAYER';end if;
 if (select count(*) from public.scout_draft_picks
  where room_id=rm.id and team_id=tm.id and player_id=any(all_ids))<>15
 then raise exception 'INVALID_LINEUP_PLAYERS';end if;
 if not (p_captain=any(p_starters)) then raise exception 'INVALID_CAPTAIN';end if;
 if p_manager_card is null or p_manager_card not in ('none','triple_captain','quad_captain','bench_boost')
 then raise exception 'INVALID_MANAGER_CARD';end if;
 if not exists(select 1 from public.scout_players where id=p_bench[1] and position='GK')
 then raise exception 'BENCH_KEEPER_REQUIRED';end if;
 select count(*) filter(where sp.position='GK'),count(*) filter(where sp.position='DEF'),
 count(*) filter(where sp.position='MID'),count(*) filter(where sp.position='FWD')
 into gk,df,md,fw from public.scout_players sp where sp.id=any(p_starters);
 formation:=df::text||'-'||md::text||'-'||fw::text;
 if gk<>1 or not exists(
   select 1 from public.scout_game_rules g,
     jsonb_array_elements_text(g.rules->'formations') fm(value)
   where g.season=(select max(season) from public.scout_game_rules)
     and fm.value=formation
 ) then raise exception 'INVALID_FORMATION';end if;
 select manager_card into old_card from public.scout_draft_lineups
 where room_id=rm.id and team_id=tm.id and gameweek=p_gameweek;
 if p_manager_card<>'none' and exists(
   select 1 from public.scout_draft_lineups l where l.room_id=rm.id and l.team_id=tm.id
   and l.gameweek<>p_gameweek and l.manager_card=p_manager_card
 ) then raise exception 'CARD_ALREADY_USED';end if;
 insert into public.scout_draft_lineups(room_id,team_id,gameweek,formation,captain_player_id,manager_card,starters,bench,ready)
 values(rm.id,tm.id,p_gameweek,formation,p_captain,p_manager_card,p_starters,p_bench,coalesce(p_ready,true))
 on conflict(room_id,team_id,gameweek) do update set
 formation=excluded.formation,captain_player_id=excluded.captain_player_id,
 manager_card=excluded.manager_card,starters=excluded.starters,bench=excluded.bench,
 ready=excluded.ready,saved_at=clock_timestamp();
 if rm.league_active_at is null then
  select count(*)=count(*) filter(where l.ready is true) into is_all_ready
  from public.scout_draft_teams t left join public.scout_draft_lineups l
  on l.room_id=rm.id and l.team_id=t.id and l.gameweek=p_gameweek
  where t.room_id=rm.id;
  if is_all_ready then
    update public.scout_draft_rooms set league_active_at=clock_timestamp(),updated_at=clock_timestamp()
    where id=rm.id;
  end if;
 end if;
 return jsonb_build_object('saved',true,'ready',coalesce(p_ready,true),
   'formation',formation,'league_started',coalesce(is_all_ready,false));
end $$;

revoke all on function public.scout_draft_lineup_state(uuid) from public,anon;
revoke all on function public.scout_draft_save_lineup(uuid,integer,integer[],integer[],integer,text,boolean) from public,anon;
grant execute on function public.scout_draft_lineup_state(uuid) to authenticated;
grant execute on function public.scout_draft_save_lineup(uuid,integer,integer[],integer[],integer,text,boolean) to authenticated;
