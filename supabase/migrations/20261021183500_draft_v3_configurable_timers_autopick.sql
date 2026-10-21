-- Draft V3 timers. All existing V1/V2 rooms retain their rules and ongoing drafts.
alter table public.scout_draft_rooms drop constraint if exists scout_draft_rooms_rules_version_check;
alter table public.scout_draft_rooms add constraint scout_draft_rooms_rules_version_check check(rules_version in (1,2,3));
alter table public.scout_draft_rooms
 add column if not exists auction_open_seconds integer not null default 15 check(auction_open_seconds between 10 and 20),
 add column if not exists auction_extension_seconds integer not null default 5 check(auction_extension_seconds between 1 and 5),
 add column if not exists classic_pick_seconds integer not null default 30 check(classic_pick_seconds between 15 and 90),
 add column if not exists classic_deadline timestamptz;

create or replace function public.scout_draft_create(p_names text[],p_mode text default 'snake')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid(); rid uuid;code text;runid uuid;gw integer;i integer;n integer;
 alphabet constant text:='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; random_uuid uuid;
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
   code:='';
   random_uuid:=gen_random_uuid();
   for i in 1..8 loop
     code:=code||substr(alphabet,1+mod(get_byte(decode(replace(random_uuid::text,'-',''),'hex'),i-1),length(alphabet)),1);
   end loop;
   exit when not exists(select 1 from public.scout_draft_rooms where invite_code=code);
 end loop;
 insert into public.scout_draft_rooms(
   id,invite_code,host_user_id,model_run_id,gameweek,mode,draft_kind,team_count,rules_version)
 values(rid,code,u,runid,gw,case when p_mode='linear' then 'linear' else 'snake' end,
        case when p_mode='auction' then 'auction' else 'classic' end,n,3);
 for i in 1..n loop
   insert into public.scout_draft_teams(room_id,team_index,draft_order,team_name,user_id)
   values(rid,i,i,btrim(p_names[i]),case when i=1 then u else null end);
 end loop;
 return jsonb_build_object('room_id',rid,'invite_code',code,'gameweek',gw,'team_count',n);
end $$;


create or replace function public.scout_draft_config_timers(
 p_room_id uuid,p_auction_open_seconds integer,p_auction_extension_seconds integer,p_classic_pick_seconds integer
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare rm public.scout_draft_rooms%rowtype;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 if p_auction_open_seconds is null or p_auction_open_seconds not between 10 and 20
    or p_auction_extension_seconds is null or p_auction_extension_seconds not between 1 and 5
    or p_classic_pick_seconds is null or p_classic_pick_seconds not between 15 and 90
 then raise exception 'INVALID_DRAFT_TIMER';end if;
 select * into rm from public.scout_draft_rooms where id=p_room_id for update;
 if not found or rm.host_user_id<>auth.uid() then raise exception 'HOST_ONLY';end if;
 if rm.status<>'lobby' or rm.rules_version<3 then raise exception 'DRAFT_ALREADY_STARTED';end if;
 update public.scout_draft_rooms set
  auction_open_seconds=p_auction_open_seconds,auction_extension_seconds=p_auction_extension_seconds,
  classic_pick_seconds=p_classic_pick_seconds,updated_at=clock_timestamp()
 where id=rm.id;
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
 'auction_open_seconds',rm.auction_open_seconds,'auction_extension_seconds',rm.auction_extension_seconds,
 'classic_pick_seconds',rm.classic_pick_seconds,'classic_deadline',rm.classic_deadline,
 'server_time',clock_timestamp(),
 'rules_version',rm.rules_version,'auction_phase',rm.auction_phase,
 'nomination_index',rm.auction_nomination_index,'completed_at',rm.completed_at,
 'results_snapshot',case when rm.status='finished' then rm.results_snapshot else null end,
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
 update public.scout_draft_rooms set status='drafting',next_pick=1,
 classic_deadline=case when rm.draft_kind='classic' and rm.rules_version>=3 then clock_timestamp()+rm.classic_pick_seconds*interval '1 second' else null end,
 updated_at=clock_timestamp() where id=p_room_id;
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
 if rm.rules_version>=3 and rm.classic_deadline is not null and clock_timestamp()>=rm.classic_deadline then raise exception 'PICK_TIME_EXPIRED';end if;
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
 classic_deadline=case when rm.rules_version>=3 and rm.next_pick<rm.team_count*15 then clock_timestamp()+rm.classic_pick_seconds*interval '1 second' else null end,
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
 update public.scout_draft_rooms set next_pick=rm.next_pick-1,status='drafting',classic_deadline=case when rm.rules_version>=3 then clock_timestamp()+rm.classic_pick_seconds*interval '1 second' else null end,updated_at=clock_timestamp() where id=rm.id;
end $$;

-- Any logged-in manager in the room can settle one expired turn.
-- Server-side room lock makes simultaneous visits or clicks atomic.
create or replace function public.scout_draft_classic_advance(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare rm public.scout_draft_rooms%rowtype; t public.scout_draft_teams%rowtype;
 round_num integer; seat integer; candidate integer;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select * into rm from public.scout_draft_rooms where id=p_room_id for update;
 if not found or not exists(select 1 from public.scout_draft_teams where room_id=rm.id and user_id=auth.uid())
 then raise exception 'ROOM_ACCESS_DENIED';end if;
 if rm.status<>'drafting' or rm.draft_kind<>'classic' or rm.rules_version<3 then
   return jsonb_build_object('advanced',false,'status',rm.status);
 end if;
 if rm.classic_deadline is null or clock_timestamp()<rm.classic_deadline then
   return jsonb_build_object('advanced',false,'status','waiting');
 end if;
 round_num:=((rm.next_pick-1)/rm.team_count)+1;
 seat:=mod(rm.next_pick-1,rm.team_count)+1;
 if rm.mode='snake' and mod(round_num,2)=0 then seat:=rm.team_count+1-seat;end if;
 select * into t from public.scout_draft_teams where room_id=rm.id and draft_order=seat;
 if not found then raise exception 'INVALID_SEAT';end if;
 select sp.id into candidate from public.scout_player_projections pr
 join public.scout_players sp on sp.id=pr.player_id
 where pr.run_id=rm.model_run_id and sp.active and sp.position in ('GK','DEF','MID','FWD')
 and pr.xfp is not null
 and not exists(select 1 from public.scout_draft_picks picked
                where picked.room_id=rm.id and picked.player_id=sp.id)
 and (select count(*) from public.scout_draft_picks owned
      join public.scout_players roster_player on roster_player.id=owned.player_id
      where owned.room_id=rm.id and owned.team_id=t.id and roster_player.position=sp.position)
     <case sp.position when 'GK' then 2 when 'DEF' then 5 when 'MID' then 5 else 3 end
 order by pr.xfp desc,pr.xi_probability desc nulls last,sp.id limit 1;
 if candidate is null then raise exception 'NO_ELIGIBLE_CANDIDATE';end if;
 insert into public.scout_draft_picks(room_id,team_id,player_id,pick_number)
 values(rm.id,t.id,candidate,rm.next_pick);
 update public.scout_draft_rooms set next_pick=rm.next_pick+1,
  status=case when rm.next_pick=rm.team_count*15 then 'finished' else 'drafting' end,
  classic_deadline=case when rm.next_pick=rm.team_count*15 then null
   else clock_timestamp()+rm.classic_pick_seconds*interval '1 second' end,
  updated_at=clock_timestamp() where id=rm.id;
 return jsonb_build_object('advanced',true,'player_id',candidate,'pick_number',rm.next_pick,'team_id',t.id);
end $$;

create or replace function public.scout_draft_auction_nominate(p_room_id uuid,p_player_id integer default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare rm public.scout_draft_rooms%rowtype;nom public.scout_draft_teams%rowtype;
 candidate integer;num integer;pos text;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select * into rm from public.scout_draft_rooms where id=p_room_id for update;
 if not found or rm.status<>'drafting' or rm.draft_kind<>'auction' or rm.rules_version<2
    or rm.auction_phase<>'bidding' then raise exception 'AUCTION_NOT_ACTIVE';end if;
 select * into nom from public.scout_draft_teams
 where room_id=rm.id and draft_order=rm.auction_nomination_index;
 if not found or nom.user_id is distinct from auth.uid() then raise exception 'NOT_YOUR_TURN';end if;
 if exists(select 1 from public.scout_draft_auction_lots where room_id=rm.id and status='open')
 then raise exception 'LOT_ALREADY_OPEN';end if;
 if p_player_id is null then
   select sp.id into candidate
   from public.scout_player_projections pr
   join public.scout_players sp on sp.id=pr.player_id
   where pr.run_id=rm.model_run_id and sp.active and sp.position in ('GK','DEF','MID','FWD')
   and coalesce(pr.availability_probability,1)>0 and pr.xfp is not null
   and not exists(select 1 from public.scout_draft_picks p where p.room_id=rm.id and p.player_id=sp.id)
   and exists(
     select 1 from public.scout_draft_teams t where t.room_id=rm.id
     and (select count(*) from public.scout_draft_picks p where p.room_id=rm.id and p.team_id=t.id)<15
     and (select count(*) from public.scout_draft_picks p join public.scout_players o on o.id=p.player_id
          where p.room_id=rm.id and p.team_id=t.id and o.position=sp.position)
       <case sp.position when 'GK' then 2 when 'DEF' then 5 when 'MID' then 5 else 3 end
   ) order by pr.xfp desc,sp.id limit 1;
 else
   select sp.position into pos from public.scout_players sp
   join public.scout_player_projections pr on pr.player_id=sp.id and pr.run_id=rm.model_run_id
   where sp.id=p_player_id and sp.active and pr.xfp is not null
   and coalesce(pr.availability_probability,1)>0;
   if pos is null then raise exception 'INVALID_PLAYER';end if;
   candidate:=p_player_id;
 end if;
 if candidate is null then raise exception 'NO_ELIGIBLE_CANDIDATE';end if;
 if exists(select 1 from public.scout_draft_picks where room_id=rm.id and player_id=candidate)
 then raise exception 'PLAYER_ALREADY_PICKED';end if;
 select coalesce(max(lot_number),0)+1 into num
 from public.scout_draft_auction_lots where room_id=rm.id;
 insert into public.scout_draft_auction_lots(room_id,lot_number,player_id,ends_at)
 values(rm.id,num,candidate,clock_timestamp()+rm.auction_open_seconds*interval '1 second');
 update public.scout_draft_rooms set updated_at=clock_timestamp() where id=rm.id;
 return jsonb_build_object('ok',true,'lot_number',num,'player_id',candidate);
end $$;

create or replace function public.scout_draft_auction_advance(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare rm public.scout_draft_rooms%rowtype;
 lot public.scout_draft_auction_lots%rowtype;
 candidate integer;num integer;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select * into rm from public.scout_draft_rooms where id=p_room_id for update;
 if not found or not exists(
   select 1 from public.scout_draft_teams where room_id=rm.id and user_id=auth.uid()
 ) then raise exception 'ROOM_ACCESS_DENIED';end if;
 if rm.draft_kind<>'auction' or rm.status<>'drafting' then
   return jsonb_build_object('status',rm.status,'advanced',false);
 end if;
 if rm.rules_version>=2 then
   if rm.auction_phase='completion' then
     return jsonb_build_object('status','completion','advanced',false);
   end if;
   select * into lot from public.scout_draft_auction_lots
     where room_id=rm.id and status='open' order by lot_number desc limit 1;
   if not found then
     return jsonb_build_object('status','awaiting_nomination','advanced',false);
   end if;
   if clock_timestamp()<lot.ends_at then
     return jsonb_build_object('status','open','advanced',false);
   end if;
   if lot.leader_team_id is not null then
     insert into public.scout_draft_picks(room_id,team_id,player_id,pick_number,price)
     values(rm.id,lot.leader_team_id,lot.player_id,rm.next_pick,lot.current_bid);
     rm.next_pick:=rm.next_pick+1;
     update public.scout_draft_auction_lots set status='sold' where id=lot.id;
   else
     update public.scout_draft_auction_lots set status='passed' where id=lot.id;
   end if;
   if rm.next_pick>rm.team_count*15 then
     update public.scout_draft_rooms set next_pick=rm.next_pick,status='finished',
       updated_at=clock_timestamp() where id=rm.id;
     return jsonb_build_object('status','finished','advanced',true);
   end if;
   -- Rotate nominations and skip fully completed managers.
   select nt.draft_order into num from public.scout_draft_teams nt
   where nt.room_id=rm.id and (select count(*) from public.scout_draft_picks p
     where p.room_id=rm.id and p.team_id=nt.id)<15
   order by mod(nt.draft_order-rm.auction_nomination_index-1+rm.team_count,rm.team_count)
   limit 1;
   update public.scout_draft_rooms set next_pick=rm.next_pick,
     auction_nomination_index=coalesce(num,rm.auction_nomination_index),
     updated_at=clock_timestamp() where id=rm.id;
   return jsonb_build_object('status','awaiting_nomination','advanced',true);
 end if;
 select * into lot from public.scout_draft_auction_lots
 where room_id=rm.id and status='open' order by lot_number desc limit 1;
 if found then
   if clock_timestamp()<lot.ends_at then
     return jsonb_build_object('status','open','advanced',false,'seconds_left',
        greatest(0,extract(epoch from (lot.ends_at-clock_timestamp()))));
   end if;
   if lot.leader_team_id is not null then
     insert into public.scout_draft_picks(room_id,team_id,player_id,pick_number,price)
     values(rm.id,lot.leader_team_id,lot.player_id,rm.next_pick,lot.current_bid);
     update public.scout_draft_rooms
     set next_pick=rm.next_pick+1,updated_at=clock_timestamp()
     where id=rm.id;
     rm.next_pick:=rm.next_pick+1;
     update public.scout_draft_auction_lots set status='sold' where id=lot.id;
   else
     update public.scout_draft_auction_lots set status='passed' where id=lot.id;
   end if;
 end if;
 if rm.next_pick>rm.team_count*15 then
   update public.scout_draft_rooms set status='finished',updated_at=clock_timestamp() where id=rm.id;
   return jsonb_build_object('status','finished','advanced',true);
 end if;
 -- Only nominate players at least one manager can legally purchase for 1 credit.
 select sp.id into candidate
 from public.scout_player_projections pr
 join public.scout_players sp on sp.id=pr.player_id
 where pr.run_id=rm.model_run_id and sp.active and sp.position in ('GK','DEF','MID','FWD')
 and coalesce(pr.availability_probability,1)>0
 and not exists(select 1 from public.scout_draft_picks p where p.room_id=rm.id and p.player_id=sp.id)
 and not exists(select 1 from public.scout_draft_auction_lots l where l.room_id=rm.id and l.player_id=sp.id)
 and exists(
   select 1 from public.scout_draft_teams t where t.room_id=rm.id
   and (select count(*) from public.scout_draft_picks p where p.room_id=rm.id and p.team_id=t.id)<15
   and (select count(*) from public.scout_draft_picks p
        join public.scout_players owned on owned.id=p.player_id
        where p.room_id=rm.id and p.team_id=t.id and owned.position=sp.position)
       < case sp.position when 'GK' then 2 when 'DEF' then 5 when 'MID' then 5 else 3 end
   and rm.auction_budget-
       coalesce((select sum(p.price) from public.scout_draft_picks p where p.room_id=rm.id and p.team_id=t.id),0)
       -(14-(select count(*) from public.scout_draft_picks p where p.room_id=rm.id and p.team_id=t.id))
       >=1
 )
 order by pr.xfp desc,sp.id limit 1;
 if candidate is null then
   update public.scout_draft_rooms set status='finished',updated_at=clock_timestamp() where id=rm.id;
   return jsonb_build_object('status','finished','advanced',true,'reason','NO_ELIGIBLE_CANDIDATE');
 end if;
 select coalesce(max(lot_number),0)+1 into num from public.scout_draft_auction_lots where room_id=rm.id;
 insert into public.scout_draft_auction_lots(room_id,lot_number,player_id,ends_at)
 values(rm.id,num,candidate,clock_timestamp()+rm.auction_open_seconds*interval '1 second');
 update public.scout_draft_rooms set updated_at=clock_timestamp() where id=rm.id;
 return jsonb_build_object('status','open','advanced',true,'lot_number',num);
end $$;

create or replace function public.scout_draft_auction_bid(p_room_id uuid,p_amount integer)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare rm public.scout_draft_rooms%rowtype;
 t public.scout_draft_teams%rowtype;lot public.scout_draft_auction_lots%rowtype;
 pos text;count_all integer;count_pos integer;max_bid integer;max_position integer;
 spent integer;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select * into rm from public.scout_draft_rooms where id=p_room_id for update;
 if not found or rm.status<>'drafting' or rm.draft_kind<>'auction' then raise exception 'AUCTION_NOT_ACTIVE';end if;
 select * into t from public.scout_draft_teams where room_id=rm.id and user_id=auth.uid();
 if not found then raise exception 'ROOM_ACCESS_DENIED';end if;
 select * into lot from public.scout_draft_auction_lots where room_id=rm.id and status='open' order by lot_number desc limit 1 for update;
 if not found or clock_timestamp()>=lot.ends_at then raise exception 'AUCTION_EXPIRED';end if;
 if lot.leader_team_id=t.id then raise exception 'ALREADY_LEADING';end if;
 if p_amount is null or p_amount<=lot.current_bid or p_amount<1 then raise exception 'BID_TOO_LOW';end if;
 select position into pos from public.scout_players where id=lot.player_id;
 select count(*),coalesce(sum(price),0) into count_all,spent
 from public.scout_draft_picks where room_id=rm.id and team_id=t.id;
 select count(*) into count_pos from public.scout_draft_picks p join public.scout_players sp on sp.id=p.player_id
 where p.room_id=rm.id and p.team_id=t.id and sp.position=pos;
 max_position:=case pos when 'GK' then 2 when 'DEF' then 5 when 'MID' then 5 else 3 end;
 if count_all>=15 or count_pos>=max_position then
   raise exception 'POSITION_FULL';
 end if;
 -- Always retain >=1 credit for each remaining empty roster position.
 max_bid:=rm.auction_budget-spent-(14-count_all);
 if p_amount>max_bid then raise exception 'BID_EXCEEDS_SAFE_BUDGET';end if;
 update public.scout_draft_auction_lots set current_bid=p_amount,leader_team_id=t.id,
   ends_at=greatest(ends_at,clock_timestamp())+(rm.auction_extension_seconds*interval '1 second')
 where id=lot.id;
 insert into public.scout_draft_auction_bids(room_id,lot_id,team_id,amount) values(rm.id,lot.id,t.id,p_amount);
 update public.scout_draft_rooms set updated_at=clock_timestamp() where id=rm.id;
 return jsonb_build_object('ok',true,'amount',p_amount,'ends_at',
    (select ends_at from public.scout_draft_auction_lots where id=lot.id),'max_bid',max_bid);
end $$;


create or replace function public.scout_draft_auction_finish_bidding(p_room_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare rm public.scout_draft_rooms%rowtype;target integer;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select * into rm from public.scout_draft_rooms where id=p_room_id for update;
 if not found or rm.host_user_id<>auth.uid() then raise exception 'HOST_ONLY';end if;
 if rm.status<>'drafting' or rm.draft_kind<>'auction' or rm.rules_version<2
   or rm.auction_phase<>'bidding' then raise exception 'AUCTION_NOT_ACTIVE';end if;
 if exists(select 1 from public.scout_draft_auction_lots where room_id=rm.id and status='open')
 then raise exception 'LOT_ALREADY_OPEN';end if;
 if (select count(*) from public.scout_draft_auction_lots where room_id=rm.id)<rm.team_count
 then raise exception 'WAIT_ONE_NOMINATION_ROUND';end if;
 select t.draft_order into target from public.scout_draft_teams t
 where t.room_id=rm.id and (select count(*) from public.scout_draft_picks p
                             where p.room_id=rm.id and p.team_id=t.id)<15
 order by t.draft_order limit 1;
 if target is null then raise exception 'DRAFT_NOT_ACTIVE';end if;
 update public.scout_draft_rooms set auction_phase='completion',
 auction_nomination_index=target,updated_at=clock_timestamp() where id=rm.id;
end $$;

create or replace function public.scout_draft_auction_complete_pick(p_room_id uuid,p_player_id integer)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare rm public.scout_draft_rooms%rowtype;t public.scout_draft_teams%rowtype;
 position_name text;position_count integer;position_cap integer;
 filled integer;spent integer;next_seat integer;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select * into rm from public.scout_draft_rooms where id=p_room_id for update;
 if not found or rm.status<>'drafting' or rm.rules_version<2 or rm.draft_kind<>'auction'
    or rm.auction_phase<>'completion' then raise exception 'AUCTION_NOT_ACTIVE';end if;
 select * into t from public.scout_draft_teams where room_id=rm.id
 and draft_order=rm.auction_nomination_index;
 if not found or t.user_id is distinct from auth.uid() then raise exception 'NOT_YOUR_TURN';end if;
 select sp.position into position_name from public.scout_players sp
 join public.scout_player_projections pr on pr.run_id=rm.model_run_id and pr.player_id=sp.id
 where sp.id=p_player_id and sp.active and pr.xfp is not null
 and coalesce(pr.availability_probability,1)>0;
 if position_name is null then raise exception 'INVALID_PLAYER';end if;
 if exists(select 1 from public.scout_draft_picks where room_id=rm.id and player_id=p_player_id)
 then raise exception 'PLAYER_ALREADY_PICKED';end if;
 select count(*),coalesce(sum(price),0) into filled,spent from public.scout_draft_picks
 where room_id=rm.id and team_id=t.id;
 if filled>=15 or spent+1>rm.auction_budget then raise exception 'BID_EXCEEDS_SAFE_BUDGET';end if;
 select count(*) into position_count from public.scout_draft_picks p
 join public.scout_players sp on sp.id=p.player_id
 where p.room_id=rm.id and p.team_id=t.id and sp.position=position_name;
 position_cap:=case position_name when 'GK' then 2 when 'DEF' then 5 when 'MID' then 5 else 3 end;
 if position_count>=position_cap then raise exception 'POSITION_FULL';end if;
 insert into public.scout_draft_picks(room_id,team_id,player_id,pick_number,price)
 values(rm.id,t.id,p_player_id,rm.next_pick,1);
 if rm.next_pick=rm.team_count*15 then
   update public.scout_draft_rooms set next_pick=rm.next_pick+1,status='finished',
   updated_at=clock_timestamp() where id=rm.id;
 else
   select next_t.draft_order into next_seat from public.scout_draft_teams next_t
   where next_t.room_id=rm.id and (select count(*) from public.scout_draft_picks p
     where p.room_id=rm.id and p.team_id=next_t.id)<15
   order by mod(next_t.draft_order-rm.auction_nomination_index-1+rm.team_count,rm.team_count)
   limit 1;
   update public.scout_draft_rooms set next_pick=rm.next_pick+1,
   auction_nomination_index=next_seat,updated_at=clock_timestamp() where id=rm.id;
 end if;
 return rm.next_pick;
end $$;


revoke all on function public.scout_draft_config_timers(uuid,integer,integer,integer) from public,anon;
revoke all on function public.scout_draft_classic_advance(uuid) from public,anon;
grant execute on function public.scout_draft_config_timers(uuid,integer,integer,integer) to authenticated;
grant execute on function public.scout_draft_classic_advance(uuid) to authenticated;
