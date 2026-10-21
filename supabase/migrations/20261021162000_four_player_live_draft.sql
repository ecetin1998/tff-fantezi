-- Private, invitation-only four-person draft rooms. All operations happen in locked,
-- authenticated RPCs. No changes to the live model, scoring, or subscriptions.
create table if not exists public.scout_draft_rooms (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null unique,
  host_user_id uuid not null,
  model_run_id uuid not null references public.scout_model_runs(id),
  gameweek integer not null,
  mode text not null default 'snake' check (mode in ('snake','linear')),
  status text not null default 'lobby' check (status in ('lobby','drafting','finished')),
  next_pick integer not null default 1 check (next_pick between 1 and 61),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.scout_draft_teams (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.scout_draft_rooms(id) on delete cascade,
  team_index integer not null check (team_index between 1 and 4),
  draft_order integer not null check (draft_order between 1 and 4),
  team_name text not null check (char_length(btrim(team_name)) between 1 and 40),
  user_id uuid,
  unique (room_id,team_index),
  constraint scout_draft_unique_order unique (room_id,draft_order) deferrable initially deferred,
  unique (room_id,user_id)
);
create table if not exists public.scout_draft_picks (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.scout_draft_rooms(id) on delete cascade,
  team_id uuid not null references public.scout_draft_teams(id),
  player_id integer not null references public.scout_players(id),
  pick_number integer not null check (pick_number between 1 and 60),
  picked_at timestamptz not null default now(),
  unique (room_id,player_id),
  unique (room_id,pick_number)
);
create index if not exists scout_draft_teams_member_idx on public.scout_draft_teams(user_id,room_id);
create index if not exists scout_draft_picks_room_idx on public.scout_draft_picks(room_id,pick_number);
alter table public.scout_draft_rooms enable row level security;
alter table public.scout_draft_teams enable row level security;
alter table public.scout_draft_picks enable row level security;
revoke all on public.scout_draft_rooms,public.scout_draft_teams,public.scout_draft_picks from public,anon,authenticated;
revoke all on sequence public.scout_draft_picks_id_seq from public,anon,authenticated;

create or replace function public.scout_draft_create(p_names text[],p_mode text default 'snake')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_run uuid;v_week integer;v_id uuid;v_code text;v_i integer;
begin
 if v_user is null then raise exception 'AUTH_REQUIRED';end if;
 if p_mode not in ('snake','linear') then raise exception 'INVALID_MODE';end if;
 if array_length(p_names,1) is distinct from 4 or array_lower(p_names,1)<>1 then raise exception 'FOUR_TEAMS_REQUIRED';end if;
 if exists(select 1 from unnest(p_names) n where n is null or char_length(btrim(n)) not between 1 and 40)
   or (select count(distinct lower(btrim(n))) from unnest(p_names) n)<>4
 then raise exception 'INVALID_TEAM_NAMES';end if;
 select id,gameweek into v_run,v_week from public.scout_model_runs
 where is_current=true and status='ready' order by generated_at desc limit 1;
 if v_run is null then raise exception 'NO_ACTIVE_MODEL';end if;
 v_id:=gen_random_uuid();
 -- 40 bits of invitation entropy; only logged-in invitees may join.
 loop
   v_code:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
   exit when not exists(select 1 from public.scout_draft_rooms where invite_code=v_code);
 end loop;
 insert into public.scout_draft_rooms(id,invite_code,host_user_id,model_run_id,gameweek,mode)
 values(v_id,v_code,v_user,v_run,v_week,p_mode);
 for v_i in 1..4 loop
   insert into public.scout_draft_teams(room_id,team_index,draft_order,team_name,user_id)
   values(v_id,v_i,v_i,btrim(p_names[v_i]),case when v_i=1 then v_user else null end);
 end loop;
 return jsonb_build_object('room_id',v_id,'invite_code',v_code,'gameweek',v_week);
end $$;

create or replace function public.scout_draft_join(p_code text,p_team_index integer)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid();v_room public.scout_draft_rooms%rowtype;v_team public.scout_draft_teams%rowtype;
begin
 if v_user is null then raise exception 'AUTH_REQUIRED';end if;
 if p_team_index not between 1 and 4 then raise exception 'INVALID_SEAT';end if;
 select * into v_room from public.scout_draft_rooms where invite_code=upper(btrim(p_code)) for update;
 if not found then raise exception 'ROOM_NOT_FOUND';end if;
 if v_room.status<>'lobby' then raise exception 'DRAFT_ALREADY_STARTED';end if;
 if exists(select 1 from public.scout_draft_teams where room_id=v_room.id and user_id=v_user) then
   raise exception 'ALREADY_JOINED';
 end if;
 select * into v_team from public.scout_draft_teams
 where room_id=v_room.id and team_index=p_team_index for update;
 if not found or v_team.user_id is not null then raise exception 'SEAT_TAKEN';end if;
 update public.scout_draft_teams set user_id=v_user where id=v_team.id;
 update public.scout_draft_rooms set updated_at=now() where id=v_room.id;
 return v_room.id;
end $$;

create or replace function public.scout_draft_state(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_room public.scout_draft_rooms%rowtype;v_teams jsonb;v_picks jsonb;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select * into v_room from public.scout_draft_rooms where id=p_room_id;
 if not found then raise exception 'ROOM_NOT_FOUND';end if;
 if not exists(select 1 from public.scout_draft_teams
               where room_id=p_room_id and user_id=auth.uid()) then raise exception 'ROOM_ACCESS_DENIED';end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',id,'team_index',team_index,'draft_order',draft_order,
   'team_name',team_name,'occupied',user_id is not null,
   'mine',user_id=auth.uid()) order by draft_order),'[]'::jsonb)
 into v_teams from public.scout_draft_teams where room_id=p_room_id;
 select coalesce(jsonb_agg(jsonb_build_object(
   'pick_number',p.pick_number,'team_id',p.team_id,'player_id',p.player_id,
   'player_name',sp.full_name,'position',sp.position,'xfp',proj.xfp
 ) order by p.pick_number),'[]'::jsonb)
 into v_picks
 from public.scout_draft_picks p
 join public.scout_players sp on sp.id=p.player_id
 join public.scout_player_projections proj on proj.run_id=v_room.model_run_id and proj.player_id=p.player_id
 where p.room_id=p_room_id;
 return jsonb_build_object(
   'id',v_room.id,'code',v_room.invite_code,'gameweek',v_room.gameweek,
   'run_id',v_room.model_run_id,'mode',v_room.mode,'status',v_room.status,
   'next_pick',v_room.next_pick,'updated_at',v_room.updated_at,
   'is_host',v_room.host_user_id=auth.uid(),'teams',v_teams,'picks',v_picks
 );
end $$;

create or replace function public.scout_draft_config(p_room_id uuid,p_mode text,p_shuffle boolean default false)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_room public.scout_draft_rooms%rowtype;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select * into v_room from public.scout_draft_rooms where id=p_room_id for update;
 if not found or v_room.host_user_id<>auth.uid() then raise exception 'HOST_ONLY';end if;
 if v_room.status<>'lobby' then raise exception 'DRAFT_ALREADY_STARTED';end if;
 if p_mode not in ('snake','linear') then raise exception 'INVALID_MODE';end if;
 update public.scout_draft_rooms set mode=p_mode,updated_at=now() where id=p_room_id;
 if p_shuffle then
   with randomized as (
     select id,row_number() over(order by random())::integer new_order
     from public.scout_draft_teams where room_id=p_room_id
   )
   update public.scout_draft_teams t set draft_order=r.new_order from randomized r where t.id=r.id;
 end if;
end $$;

create or replace function public.scout_draft_start(p_room_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_room public.scout_draft_rooms%rowtype;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select * into v_room from public.scout_draft_rooms where id=p_room_id for update;
 if not found or v_room.host_user_id<>auth.uid() then raise exception 'HOST_ONLY';end if;
 if v_room.status<>'lobby' then raise exception 'DRAFT_ALREADY_STARTED';end if;
 if (select count(*) from public.scout_draft_teams where room_id=p_room_id and user_id is not null)<>4
 then raise exception 'WAIT_FOR_FOUR_PLAYERS';end if;
 update public.scout_draft_rooms set status='drafting',next_pick=1,updated_at=now() where id=p_room_id;
end $$;

create or replace function public.scout_draft_pick(p_room_id uuid,p_player_id integer)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_room public.scout_draft_rooms%rowtype;v_team public.scout_draft_teams%rowtype;
        v_round integer;v_slot integer;v_position text;v_count integer;v_max integer;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select * into v_room from public.scout_draft_rooms where id=p_room_id for update;
 if not found or v_room.status<>'drafting' or v_room.next_pick>60 then raise exception 'DRAFT_NOT_ACTIVE';end if;
 v_round:=((v_room.next_pick-1)/4)+1;
 v_slot:=mod(v_room.next_pick-1,4)+1;
 if v_room.mode='snake' and mod(v_round,2)=0 then v_slot:=5-v_slot;end if;
 select * into v_team from public.scout_draft_teams where room_id=p_room_id and draft_order=v_slot;
 if not found or v_team.user_id is distinct from auth.uid() then raise exception 'NOT_YOUR_TURN';end if;
 select sp.position into v_position
 from public.scout_players sp join public.scout_player_projections proj
 on proj.player_id=sp.id and proj.run_id=v_room.model_run_id
 where sp.id=p_player_id and sp.active=true and proj.xfp is not null;
 if v_position is null or v_position not in ('GK','DEF','MID','FWD') then raise exception 'INVALID_PLAYER';end if;
 v_max:=case v_position when 'GK' then 2 when 'DEF' then 5 when 'MID' then 5 else 3 end;
 select count(*) into v_count from public.scout_draft_picks pick
 join public.scout_players sp on sp.id=pick.player_id
 where pick.room_id=p_room_id and pick.team_id=v_team.id and sp.position=v_position;
 if v_count>=v_max then raise exception 'POSITION_FULL';end if;
 if exists(select 1 from public.scout_draft_picks where room_id=p_room_id and player_id=p_player_id)
 then raise exception 'PLAYER_ALREADY_PICKED';end if;
 insert into public.scout_draft_picks(room_id,team_id,player_id,pick_number)
 values(p_room_id,v_team.id,p_player_id,v_room.next_pick);
 update public.scout_draft_rooms
 set next_pick=v_room.next_pick+1,status=case when v_room.next_pick=60 then 'finished' else 'drafting' end,updated_at=now()
 where id=p_room_id;
 return v_room.next_pick;
end $$;

create or replace function public.scout_draft_undo(p_room_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_room public.scout_draft_rooms%rowtype;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select * into v_room from public.scout_draft_rooms where id=p_room_id for update;
 if not found or v_room.host_user_id<>auth.uid() then raise exception 'HOST_ONLY';end if;
 if v_room.next_pick<=1 or v_room.status='lobby' then raise exception 'NOTHING_TO_UNDO';end if;
 delete from public.scout_draft_picks where room_id=p_room_id and pick_number=v_room.next_pick-1;
 update public.scout_draft_rooms set next_pick=v_room.next_pick-1,status='drafting',updated_at=now() where id=p_room_id;
end $$;

revoke all on function public.scout_draft_create(text[],text) from public,anon;
revoke all on function public.scout_draft_join(text,integer) from public,anon;
revoke all on function public.scout_draft_state(uuid) from public,anon;
revoke all on function public.scout_draft_config(uuid,text,boolean) from public,anon;
revoke all on function public.scout_draft_start(uuid) from public,anon;
revoke all on function public.scout_draft_pick(uuid,integer) from public,anon;
revoke all on function public.scout_draft_undo(uuid) from public,anon;
grant execute on function public.scout_draft_create(text[],text) to authenticated;
grant execute on function public.scout_draft_join(text,integer) to authenticated;
grant execute on function public.scout_draft_state(uuid) to authenticated;
grant execute on function public.scout_draft_config(uuid,text,boolean) to authenticated;
grant execute on function public.scout_draft_start(uuid) to authenticated;
grant execute on function public.scout_draft_pick(uuid,integer) to authenticated;
grant execute on function public.scout_draft_undo(uuid) to authenticated;

comment on table public.scout_draft_rooms is 'Separate multiplayer draft game rooms; never affects the fantasy scoring model.';
