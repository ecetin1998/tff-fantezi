
-- Extends the isolated draft feature to 2-8 managers and adds server-timed auction lots.
-- Run only after the two four-player draft migrations in this feature branch.
alter table public.scout_draft_rooms
  add column team_count integer not null default 4 check(team_count between 2 and 8),
  add column draft_kind text not null default 'classic' check(draft_kind in ('classic','auction')),
  add column auction_budget integer not null default 100 check (auction_budget=100);
alter table public.scout_draft_teams drop constraint if exists scout_draft_teams_team_index_check;
alter table public.scout_draft_teams drop constraint if exists scout_draft_teams_draft_order_check;
alter table public.scout_draft_teams add constraint scout_draft_teams_team_index_check check(team_index between 1 and 8);
alter table public.scout_draft_teams add constraint scout_draft_teams_draft_order_check check(draft_order between 1 and 8);
alter table public.scout_draft_rooms drop constraint if exists scout_draft_rooms_next_pick_check;
alter table public.scout_draft_rooms add constraint scout_draft_rooms_next_pick_check check(next_pick between 1 and 121);
alter table public.scout_draft_picks drop constraint if exists scout_draft_picks_pick_number_check;
alter table public.scout_draft_picks add constraint scout_draft_picks_pick_number_check check(pick_number between 1 and 120);
alter table public.scout_draft_picks add column price integer not null default 0 check(price between 0 and 100);

create table public.scout_draft_auction_lots (
 id bigint generated always as identity primary key,
 room_id uuid not null references public.scout_draft_rooms(id) on delete cascade,
 lot_number integer not null check(lot_number>0),
 player_id integer not null references public.scout_players(id),
 status text not null default 'open' check(status in ('open','sold','passed')),
 ends_at timestamptz not null,
 current_bid integer not null default 0 check(current_bid between 0 and 100),
 leader_team_id uuid references public.scout_draft_teams(id),
 created_at timestamptz not null default now(),
 unique(room_id,lot_number),unique(room_id,player_id)
);
create unique index scout_draft_one_open_lot on public.scout_draft_auction_lots(room_id) where status='open';
create index scout_draft_auction_lots_room on public.scout_draft_auction_lots(room_id,lot_number desc);
alter table public.scout_draft_auction_lots enable row level security;
revoke all on public.scout_draft_auction_lots from public,anon,authenticated;
revoke all on sequence public.scout_draft_auction_lots_id_seq from public,anon,authenticated;
create table public.scout_draft_auction_bids (
 id bigint generated always as identity primary key,
 room_id uuid not null references public.scout_draft_rooms(id) on delete cascade,
 lot_id bigint not null references public.scout_draft_auction_lots(id) on delete cascade,
 team_id uuid not null references public.scout_draft_teams(id),
 amount integer not null check(amount between 1 and 100),
 placed_at timestamptz not null default clock_timestamp()
);
create index scout_draft_auction_bids_latest on public.scout_draft_auction_bids(lot_id,id desc);
alter table public.scout_draft_auction_bids enable row level security;
revoke all on public.scout_draft_auction_bids from public,anon,authenticated;
revoke all on sequence public.scout_draft_auction_bids_id_seq from public,anon,authenticated;

create or replace function public.scout_draft_create(p_names text[],p_mode text default 'snake')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid(); rid uuid;code text;runid uuid;gw integer;i integer;n integer;
begin
 if u is null then raise exception 'AUTH_REQUIRED';end if;
 n:=coalesce(array_length(p_names,1),0);
 if n not between 2 and 8 or array_lower(p_names,1)<>1 then raise exception 'INVALID_TEAM_COUNT';end if;
 if p_mode not in ('snake','linear','auction') then raise exception 'INVALID_MODE';end if;
 if exists(select 1 from unnest(p_names) v where v is null or char_length(btrim(v)) not between 1 and 40)
    or (select count(distinct lower(btrim(v))) from unnest(p_names) v)<>n
 then raise exception 'INVALID_TEAM_NAMES';end if;
 select id,gameweek into runid,gw from public.scout_model_runs
 where is_current=true and status='ready' order by generated_at desc limit 1;
 if runid is null then raise exception 'NO_ACTIVE_MODEL';end if;
 rid:=gen_random_uuid();
 loop
   code:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
   exit when not exists(select 1 from public.scout_draft_rooms where invite_code=code);
 end loop;
 insert into public.scout_draft_rooms(id,invite_code,host_user_id,model_run_id,gameweek,mode,draft_kind,team_count)
 values(rid,code,u,runid,gw,case when p_mode='linear' then 'linear' else 'snake' end,
        case when p_mode='auction' then 'auction' else 'classic' end,n);
 for i in 1..n loop
   insert into public.scout_draft_teams(room_id,team_index,draft_order,team_name,user_id)
   values(rid,i,i,btrim(p_names[i]),case when i=1 then u else null end);
 end loop;
 return jsonb_build_object('room_id',rid,'invite_code',code,'gameweek',gw,'team_count',n,'draft_kind',case when p_mode='auction' then 'auction' else 'classic' end);
end $$;

create or replace function public.scout_draft_join(p_code text,p_team_index integer)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid();rm public.scout_draft_rooms%rowtype;t public.scout_draft_teams%rowtype;
begin
 if u is null then raise exception 'AUTH_REQUIRED';end if;
 select * into rm from public.scout_draft_rooms where invite_code=upper(btrim(p_code)) for update;
 if not found then raise exception 'ROOM_NOT_FOUND';end if;
 if rm.status<>'lobby' then raise exception 'DRAFT_ALREADY_STARTED';end if;
 if p_team_index is null or p_team_index not between 1 and rm.team_count then raise exception 'INVALID_SEAT';end if;
 if exists(select 1 from public.scout_draft_teams where room_id=rm.id and user_id=u) then raise exception 'ALREADY_JOINED';end if;
 select * into t from public.scout_draft_teams where room_id=rm.id and team_index=p_team_index for update;
 if not found or t.user_id is not null then raise exception 'SEAT_TAKEN';end if;
 update public.scout_draft_teams set user_id=u where id=t.id;
 update public.scout_draft_rooms set updated_at=clock_timestamp() where id=rm.id;
 return rm.id;
end $$;

create or replace function public.scout_draft_config(p_room_id uuid,p_mode text,p_shuffle boolean default false)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare rm public.scout_draft_rooms%rowtype;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select * into rm from public.scout_draft_rooms where id=p_room_id for update;
 if not found or rm.host_user_id<>auth.uid() then raise exception 'HOST_ONLY';end if;
 if rm.status<>'lobby' then raise exception 'DRAFT_ALREADY_STARTED';end if;
 if p_mode not in ('snake','linear','auction') then raise exception 'INVALID_MODE';end if;
 update public.scout_draft_rooms set mode=case when p_mode='linear' then 'linear' else 'snake' end,
 draft_kind=case when p_mode='auction' then 'auction' else 'classic' end,updated_at=clock_timestamp() where id=p_room_id;
 if p_shuffle then
   with shuffled as(select id,row_number() over(order by random())::integer n
      from public.scout_draft_teams where room_id=p_room_id)
   update public.scout_draft_teams t set draft_order=s.n from shuffled s where t.id=s.id;
 end if;
end $$;

create or replace function public.scout_draft_lobby(p_code text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare rm public.scout_draft_rooms%rowtype;seats jsonb;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select * into rm from public.scout_draft_rooms where invite_code=upper(btrim(p_code));
 if not found then raise exception 'ROOM_NOT_FOUND';end if;
 select coalesce(jsonb_agg(jsonb_build_object('team_index',team_index,
 'name',team_name,'occupied',user_id is not null,'draft_order',draft_order) order by draft_order),'[]'::jsonb)
 into seats from public.scout_draft_teams where room_id=rm.id;
 return jsonb_build_object('code',rm.invite_code,'status',rm.status,'gameweek',rm.gameweek,
 'mode',rm.mode,'draft_kind',rm.draft_kind,'team_count',rm.team_count,
 'auction_budget',rm.auction_budget,'teams',seats);
end $$;

create or replace function public.scout_draft_state(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare rm public.scout_draft_rooms%rowtype;seats jsonb;picks jsonb;lot jsonb;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select * into rm from public.scout_draft_rooms where id=p_room_id;
 if not found then raise exception 'ROOM_NOT_FOUND';end if;
 if not exists(select 1 from public.scout_draft_teams where room_id=p_room_id and user_id=auth.uid()) then raise exception 'ROOM_ACCESS_DENIED';end if;
 select coalesce(jsonb_agg(jsonb_build_object(
 'id',t.id,'team_index',t.team_index,'draft_order',t.draft_order,
 'team_name',t.team_name,'occupied',t.user_id is not null,'mine',t.user_id=auth.uid(),
 'spent',coalesce((select sum(p.price) from public.scout_draft_picks p where p.room_id=rm.id and p.team_id=t.id),0),
 'budget',rm.auction_budget-coalesce((select sum(p.price) from public.scout_draft_picks p where p.room_id=rm.id and p.team_id=t.id),0)
 ) order by t.draft_order),'[]'::jsonb)
 into seats from public.scout_draft_teams t where t.room_id=p_room_id;
 select coalesce(jsonb_agg(jsonb_build_object(
 'pick_number',p.pick_number,'team_id',p.team_id,'player_id',p.player_id,
 'player_name',sp.full_name,'position',sp.position,'xfp',pr.xfp,'price',p.price
 ) order by p.pick_number),'[]'::jsonb)
 into picks
 from public.scout_draft_picks p
 join public.scout_players sp on sp.id=p.player_id
 join public.scout_player_projections pr on pr.run_id=rm.model_run_id and pr.player_id=p.player_id
 where p.room_id=p_room_id;
 select jsonb_build_object('id',l.id,'lot_number',l.lot_number,'player_id',l.player_id,
 'player_name',sp.full_name,'team',st.name,'position',sp.position,'xfp',pr.xfp,
 'status',l.status,'current_bid',l.current_bid,'leader_team_id',l.leader_team_id,
 'ends_at',l.ends_at,'server_time',clock_timestamp(),
 'bid_count',(select count(*) from public.scout_draft_auction_bids b where b.lot_id=l.id))
 into lot from public.scout_draft_auction_lots l
 join public.scout_players sp on sp.id=l.player_id
 join public.scout_teams st on st.id=sp.team_id
 join public.scout_player_projections pr on pr.player_id=l.player_id and pr.run_id=rm.model_run_id
 where l.room_id=rm.id order by l.lot_number desc limit 1;
 return jsonb_build_object('id',rm.id,'code',rm.invite_code,'gameweek',rm.gameweek,
 'run_id',rm.model_run_id,'mode',rm.mode,'draft_kind',rm.draft_kind,'team_count',rm.team_count,
 'auction_budget',rm.auction_budget,'status',rm.status,'next_pick',rm.next_pick,
 'updated_at',rm.updated_at,'is_host',rm.host_user_id=auth.uid(),'teams',seats,'picks',picks,
 'lot',case when rm.draft_kind='auction' then lot else null end);
end $$;

create or replace function public.scout_draft_start(p_room_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare rm public.scout_draft_rooms%rowtype;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select * into rm from public.scout_draft_rooms where id=p_room_id for update;
 if not found or rm.host_user_id<>auth.uid() then raise exception 'HOST_ONLY';end if;
 if rm.status<>'lobby' then raise exception 'DRAFT_ALREADY_STARTED';end if;
 if (select count(*) from public.scout_draft_teams where room_id=rm.id and user_id is not null)<>rm.team_count
 then raise exception 'WAIT_FOR_ALL_PLAYERS';end if;
 update public.scout_draft_rooms set status='drafting',next_pick=1,updated_at=clock_timestamp() where id=p_room_id;
end $$;

create or replace function public.scout_draft_pick(p_room_id uuid,p_player_id integer)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare rm public.scout_draft_rooms%rowtype;t public.scout_draft_teams%rowtype;
 r integer;slot integer;pos text;cnt integer;maxpos integer;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select * into rm from public.scout_draft_rooms where id=p_room_id for update;
 if not found or rm.status<>'drafting' or rm.draft_kind<>'classic' or rm.next_pick>rm.team_count*15
 then raise exception 'DRAFT_NOT_ACTIVE';end if;
 r:=((rm.next_pick-1)/rm.team_count)+1;
 slot:=mod(rm.next_pick-1,rm.team_count)+1;
 if rm.mode='snake' and mod(r,2)=0 then slot:=rm.team_count+1-slot;end if;
 select * into t from public.scout_draft_teams where room_id=rm.id and draft_order=slot;
 if not found or t.user_id is distinct from auth.uid() then raise exception 'NOT_YOUR_TURN';end if;
 select sp.position into pos from public.scout_players sp
 join public.scout_player_projections pr on pr.run_id=rm.model_run_id and pr.player_id=sp.id
 where sp.id=p_player_id and sp.active and pr.xfp is not null;
 if pos is null or pos not in ('GK','DEF','MID','FWD') then raise exception 'INVALID_PLAYER';end if;
 maxpos:=case pos when 'GK' then 2 when 'DEF' then 5 when 'MID' then 5 else 3 end;
 select count(*) into cnt from public.scout_draft_picks p join public.scout_players sp on sp.id=p.player_id
 where p.room_id=rm.id and p.team_id=t.id and sp.position=pos;
 if cnt>=maxpos then raise exception 'POSITION_FULL';end if;
 if exists(select 1 from public.scout_draft_picks where room_id=rm.id and player_id=p_player_id) then raise exception 'PLAYER_ALREADY_PICKED';end if;
 insert into public.scout_draft_picks(room_id,team_id,player_id,pick_number)
 values(rm.id,t.id,p_player_id,rm.next_pick);
 update public.scout_draft_rooms set next_pick=rm.next_pick+1,
 status=case when rm.next_pick=rm.team_count*15 then 'finished' else 'drafting' end,
 updated_at=clock_timestamp() where id=rm.id;
 return rm.next_pick;
end $$;

create or replace function public.scout_draft_undo(p_room_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare rm public.scout_draft_rooms%rowtype;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select * into rm from public.scout_draft_rooms where id=p_room_id for update;
 if not found or rm.host_user_id<>auth.uid() then raise exception 'HOST_ONLY';end if;
 if rm.draft_kind<>'classic' then raise exception 'AUCTION_UNDO_UNSUPPORTED';end if;
 if rm.next_pick<=1 or rm.status='lobby' then raise exception 'NOTHING_TO_UNDO';end if;
 delete from public.scout_draft_picks where room_id=rm.id and pick_number=rm.next_pick-1;
 update public.scout_draft_rooms set next_pick=rm.next_pick-1,status='drafting',updated_at=clock_timestamp() where id=rm.id;
end $$;
