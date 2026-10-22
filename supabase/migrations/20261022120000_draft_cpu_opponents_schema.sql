-- Draft Arena: opponents mode and authenticated 1-human-vs-CPU rooms.
-- Existing rooms are friends by default; historic picks and member ownership remain unchanged.
alter table public.scout_draft_rooms
 add column if not exists opponent_mode text not null default 'friends'
 check(opponent_mode in ('friends','computer'));
alter table public.scout_draft_rooms
 add column if not exists bot_difficulty text not null default 'normal'
 check(bot_difficulty in ('easy','normal','hard'));
alter table public.scout_draft_teams
 add column if not exists is_bot boolean not null default false;
create index if not exists scout_draft_bot_team_idx
 on public.scout_draft_teams(room_id,draft_order) where is_bot;

create or replace function public.scout_draft_create_vs_cpu(
 p_name text,p_team_count integer default 4,p_mode text default 'snake',
 p_difficulty text default 'normal'
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 user_id uuid:=auth.uid();rm_id uuid;invite text;run_id uuid;week_num integer;
 i integer;
begin
 if user_id is null then raise exception 'AUTH_REQUIRED';end if;
 if p_team_count not between 2 and 8 then raise exception 'INVALID_TEAM_COUNT';end if;
 if p_mode not in ('snake','linear') then raise exception 'CPU_AUCTION_UNSUPPORTED';end if;
 if p_difficulty is null or p_difficulty not in ('easy','normal','hard')
 then raise exception 'INVALID_BOT_DIFFICULTY';end if;
 if p_name is null or char_length(btrim(p_name)) not between 1 and 40
 then raise exception 'INVALID_TEAM_NAMES';end if;
 select id,gameweek into run_id,week_num from public.scout_model_runs
 where is_current and status='ready' order by generated_at desc limit 1;
 if run_id is null then raise exception 'NO_ACTIVE_MODEL';end if;
 rm_id:=gen_random_uuid();
 loop
  invite:='CPU'||upper(left(replace(gen_random_uuid()::text,'-',''),9));
  exit when not exists(select 1 from public.scout_draft_rooms where invite_code=invite);
 end loop;
 insert into public.scout_draft_rooms(
  id,invite_code,host_user_id,model_run_id,gameweek,
  mode,draft_kind,team_count,rules_version,opponent_mode,bot_difficulty)
 values(rm_id,invite,user_id,run_id,week_num,p_mode,'classic',
  p_team_count,2,'computer',p_difficulty);
 for i in 1..p_team_count loop
  insert into public.scout_draft_teams(room_id,team_index,draft_order,team_name,user_id,is_bot)
  values(rm_id,i,i,case when i=1 then btrim(p_name) else 'Bilgisayar '||(i-1)::text end,
   case when i=1 then user_id else null end,i>1);
 end loop;
 return jsonb_build_object(
  'room_id',rm_id,'gameweek',week_num,'team_count',p_team_count,
  'opponent_mode','computer','bot_difficulty',p_difficulty);
end $$;

create or replace function public.scout_draft_join_named(p_code text,p_team_name text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid();rm public.scout_draft_rooms%rowtype;t public.scout_draft_teams%rowtype;
 name_clean text:=btrim(p_team_name);
begin
 if u is null then raise exception 'AUTH_REQUIRED';end if;
 if name_clean is null or char_length(name_clean) not between 1 and 40 then raise exception 'INVALID_TEAM_NAMES';end if;
 select * into rm from public.scout_draft_rooms where invite_code=upper(btrim(p_code)) for update;
 if not found then raise exception 'ROOM_NOT_FOUND';end if;
 if rm.status<>'lobby' then raise exception 'DRAFT_ALREADY_STARTED';end if;
 if rm.opponent_mode='computer' then raise exception 'COMPUTER_ROOM_PRIVATE';end if;
 if exists(select 1 from public.scout_draft_teams where room_id=rm.id and user_id=u) then
   raise exception 'ALREADY_JOINED';end if;
 if exists(select 1 from public.scout_draft_teams
           where room_id=rm.id and user_id is not null and lower(team_name)=lower(name_clean))
 then raise exception 'TEAM_NAME_TAKEN';end if;
 select * into t from public.scout_draft_teams where room_id=rm.id and user_id is null
 order by team_index limit 1 for update;
 if not found then raise exception 'ROOM_FULL';end if;
 update public.scout_draft_teams set user_id=u,team_name=name_clean where id=t.id;
 update public.scout_draft_rooms set updated_at=clock_timestamp() where id=rm.id;
 return rm.id;
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
 if v_room.opponent_mode='computer' then raise exception 'COMPUTER_ROOM_PRIVATE';end if;
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

create or replace function public.scout_draft_config(p_room_id uuid,p_mode text,p_shuffle boolean default false)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare rm public.scout_draft_rooms%rowtype;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select * into rm from public.scout_draft_rooms where id=p_room_id for update;
 if not found or rm.host_user_id<>auth.uid() then raise exception 'HOST_ONLY';end if;
 if rm.status<>'lobby' then raise exception 'DRAFT_ALREADY_STARTED';end if;
 if p_mode not in ('snake','linear','auction') then raise exception 'INVALID_MODE';end if;
 if rm.opponent_mode='computer' and p_mode='auction' then raise exception 'CPU_AUCTION_UNSUPPORTED';end if;
 update public.scout_draft_rooms set mode=case when p_mode='linear' then 'linear' else 'snake' end,
 draft_kind=case when p_mode='auction' then 'auction' else 'classic' end,updated_at=clock_timestamp() where id=p_room_id;
 if p_shuffle then
   with shuffled as(select id,row_number() over(order by random())::integer n
      from public.scout_draft_teams where room_id=p_room_id)
   update public.scout_draft_teams t set draft_order=s.n from shuffled s where t.id=s.id;
 end if;
end $$;

create or replace function public.scout_draft_start(p_room_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare rm public.scout_draft_rooms%rowtype;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select * into rm from public.scout_draft_rooms where id=p_room_id for update;
 if not found or rm.host_user_id<>auth.uid() then raise exception 'HOST_ONLY';end if;
 if rm.status<>'lobby' then raise exception 'DRAFT_ALREADY_STARTED';end if;
 if (select count(*) from public.scout_draft_teams where room_id=rm.id and (user_id is not null or is_bot))<>rm.team_count
 then raise exception 'WAIT_FOR_ALL_PLAYERS';end if;
 update public.scout_draft_rooms set status='drafting',next_pick=1,turn_started_at=case when rm.rules_version=2 and rm.draft_kind='classic' then clock_timestamp() else null end,updated_at=clock_timestamp() where id=p_room_id;
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
 'team_name',t.team_name,'occupied',(t.user_id is not null or t.is_bot),'is_bot',t.is_bot,'mine',t.user_id=auth.uid(),
 'spent',coalesce((select sum(p.price) from public.scout_draft_picks p where p.room_id=rm.id and p.team_id=t.id),0),
 'budget',rm.auction_budget-coalesce((select sum(p.price) from public.scout_draft_picks p where p.room_id=rm.id and p.team_id=t.id),0)
 ) order by t.draft_order),'[]'::jsonb)
 into seats from public.scout_draft_teams t where t.room_id=p_room_id;
 select coalesce(jsonb_agg(jsonb_build_object(
 'pick_number',p.pick_number,'team_id',p.team_id,'player_id',p.player_id,
 'player_name',sp.full_name,'position',sp.position,'xfp',pr.xfp,'price',p.price,'auto_selected',p.auto_selected
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
 'opponent_mode',rm.opponent_mode,'bot_difficulty',rm.bot_difficulty,
 'auction_budget',rm.auction_budget,'status',rm.status,'next_pick',rm.next_pick,
 'auction_bid_seconds',rm.auction_bid_seconds,'auction_extension_seconds',rm.auction_extension_seconds,
 'classic_pick_seconds',rm.classic_pick_seconds,'turn_ends_at',case when rm.turn_started_at is not null and rm.status='drafting' and rm.draft_kind='classic' and rm.rules_version=2 then rm.turn_started_at+rm.classic_pick_seconds*interval '1 second' else null end,
 'server_time',clock_timestamp(),
 'rules_version',rm.rules_version,'lineup_required',rm.lineup_required,
 'league_active_at',rm.league_active_at,'idle_expires_at',case when rm.status in ('lobby','drafting') then rm.last_member_seen_at+interval '24 hours' else null end,
 'auction_phase',rm.auction_phase,
 'nomination_index',rm.auction_nomination_index,'completed_at',rm.completed_at,
 'results_snapshot',case when rm.status='finished' then rm.results_snapshot else null end,
 'updated_at',rm.updated_at,'is_host',rm.host_user_id=auth.uid(),'teams',seats,'picks',picks,
 'lot',case when rm.draft_kind='auction' then lot else null end);
end $$;
revoke all on function public.scout_draft_create_vs_cpu(text,integer,text,text) from public,anon;
grant execute on function public.scout_draft_create_vs_cpu(text,integer,text,text) to authenticated;
