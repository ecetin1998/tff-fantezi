-- Per-room countdown settings. Legacy V1 rooms preserve their existing behavior.
alter table public.scout_draft_rooms
 add column if not exists auction_bid_seconds integer not null default 15 check (auction_bid_seconds between 10 and 20),
 add column if not exists auction_extension_seconds integer not null default 5 check (auction_extension_seconds between 1 and 5),
 add column if not exists classic_pick_seconds integer not null default 60 check (classic_pick_seconds between 15 and 120),
 add column if not exists turn_started_at timestamptz;

alter table public.scout_draft_picks
 add column if not exists auto_selected boolean not null default false;

create or replace function public.scout_draft_config_timers(
 p_room_id uuid,p_auction_seconds integer,p_auction_extension integer,p_classic_seconds integer)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare rm public.scout_draft_rooms%rowtype;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select * into rm from public.scout_draft_rooms where id=p_room_id for update;
 if not found or rm.host_user_id is distinct from auth.uid() then raise exception 'HOST_ONLY';end if;
 if rm.status<>'lobby' or rm.rules_version<>2 then raise exception 'DRAFT_ALREADY_STARTED';end if;
 if p_auction_seconds not between 10 and 20
    or p_auction_extension not between 1 and 5
    or p_classic_seconds not between 15 and 120
    or mod(p_classic_seconds,15)<>0 then raise exception 'INVALID_TIMER_SETTINGS';end if;
 update public.scout_draft_rooms set
   auction_bid_seconds=p_auction_seconds,
   auction_extension_seconds=p_auction_extension,
   classic_pick_seconds=p_classic_seconds,
   updated_at=clock_timestamp()
 where id=p_room_id;
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
 'auction_budget',rm.auction_budget,'status',rm.status,'next_pick',rm.next_pick,
 'auction_bid_seconds',rm.auction_bid_seconds,'auction_extension_seconds',rm.auction_extension_seconds,
 'classic_pick_seconds',rm.classic_pick_seconds,'turn_ends_at',case when rm.turn_started_at is not null and rm.status='drafting' and rm.draft_kind='classic' and rm.rules_version=2 then rm.turn_started_at+rm.classic_pick_seconds*interval '1 second' else null end,
 'server_time',clock_timestamp(),
 'rules_version',rm.rules_version,'auction_phase',rm.auction_phase,
 'nomination_index',rm.auction_nomination_index,'completed_at',rm.completed_at,
 'results_snapshot',case when rm.status='finished' then rm.results_snapshot else null end,
 'updated_at',rm.updated_at,'is_host',rm.host_user_id=auth.uid(),'teams',seats,'picks',picks,
 'lot',case when rm.draft_kind='auction' then lot else null end);
end $$;

create or replace function public.scout_draft_capture_results()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.status='finished' and old.status is distinct from 'finished' then
   new.completed_at:=clock_timestamp();
   select jsonb_build_object(
     'gameweek',new.gameweek,'draft_kind',new.draft_kind,'mode',new.mode,
     'team_count',new.team_count,'completed_at',new.completed_at,
     'teams',coalesce(jsonb_agg(jsonb_build_object(
       'team_name',t.team_name,'draft_order',t.draft_order,
       'players',(
         select coalesce(jsonb_agg(jsonb_build_object(
           'player_id',p.player_id,'name',sp.full_name,'position',sp.position,
           'xfp',pr.xfp,'price',p.price,'pick',p.pick_number,'auto_selected',p.auto_selected
         ) order by p.pick_number),'[]'::jsonb)
         from public.scout_draft_picks p
         join public.scout_players sp on sp.id=p.player_id
         left join public.scout_player_projections pr on pr.run_id=new.model_run_id and pr.player_id=p.player_id
         where p.room_id=new.id and p.team_id=t.id
       )
     ) order by t.draft_order),'[]'::jsonb)
   ) into new.results_snapshot
   from public.scout_draft_teams t where t.room_id=new.id;
 end if;
 return new;
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
 update public.scout_draft_rooms set status='drafting',next_pick=1,turn_started_at=case when rm.rules_version=2 and rm.draft_kind='classic' then clock_timestamp() else null end,updated_at=clock_timestamp() where id=p_room_id;
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
 if rm.rules_version=2 and rm.turn_started_at is not null and clock_timestamp()>=rm.turn_started_at+rm.classic_pick_seconds*interval '1 second' then raise exception 'TURN_EXPIRED';end if;
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
 turn_started_at=case when rm.rules_version=2 and rm.next_pick<rm.team_count*15 then clock_timestamp() else null end,
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
 update public.scout_draft_rooms set next_pick=rm.next_pick-1,status='drafting',turn_started_at=case when rm.rules_version=2 then clock_timestamp() else null end,updated_at=clock_timestamp() where id=rm.id;
end $$;

create or replace function public.scout_draft_auction_nominate(p_room_id uuid,p_player_id integer default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare rm public.scout_draft_rooms%rowtype;nom public.scout_draft_teams%rowtype;
 candidate integer;num integer;pos text;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select * into rm from public.scout_draft_rooms where id=p_room_id for update;
 if not found or rm.status<>'drafting' or rm.draft_kind<>'auction' or rm.rules_version<>2
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
 values(rm.id,num,candidate,clock_timestamp()+rm.auction_bid_seconds*interval '1 second');
 update public.scout_draft_rooms set updated_at=clock_timestamp() where id=rm.id;
 return jsonb_build_object('ok',true,'lot_number',num,'player_id',candidate);
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
   ends_at=greatest(ends_at,clock_timestamp())+(case when rm.rules_version=2 then rm.auction_extension_seconds else 5 end)*interval '1 second'
 where id=lot.id;
 insert into public.scout_draft_auction_bids(room_id,lot_id,team_id,amount) values(rm.id,lot.id,t.id,p_amount);
 update public.scout_draft_rooms set updated_at=clock_timestamp() where id=rm.id;
 return jsonb_build_object('ok',true,'amount',p_amount,'ends_at',
    (select ends_at from public.scout_draft_auction_lots where id=lot.id),'max_bid',max_bid);
end $$;


-- The per-room lock serializes human picks, auto picks and cross-device retries.
create or replace function public.scout_draft_classic_advance(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare rm public.scout_draft_rooms%rowtype;
 team public.scout_draft_teams%rowtype;
 turn_round integer;turn_slot integer;candidate integer;pos text;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select * into rm from public.scout_draft_rooms where id=p_room_id for update;
 if not found or not exists(
   select 1 from public.scout_draft_teams where room_id=rm.id and user_id=auth.uid()
 ) then raise exception 'ROOM_ACCESS_DENIED';end if;
 if rm.status<>'drafting' or rm.draft_kind<>'classic' or rm.rules_version<>2 then
   return jsonb_build_object('advanced',false,'status',rm.status);
 end if;
 if rm.turn_started_at is null then
   update public.scout_draft_rooms set turn_started_at=clock_timestamp(),updated_at=clock_timestamp()
   where id=rm.id;
   return jsonb_build_object('advanced',false,'initialized',true);
 end if;
 if clock_timestamp()<rm.turn_started_at+rm.classic_pick_seconds*interval '1 second' then
   return jsonb_build_object('advanced',false);
 end if;
 turn_round:=((rm.next_pick-1)/rm.team_count)+1;
 turn_slot:=mod(rm.next_pick-1,rm.team_count)+1;
 if rm.mode='snake' and mod(turn_round,2)=0 then turn_slot:=rm.team_count+1-turn_slot;end if;
 select * into team from public.scout_draft_teams
 where room_id=rm.id and draft_order=turn_slot;
 if not found then raise exception 'DRAFT_NOT_ACTIVE';end if;
 -- Highest frozen xFP whose position is not filled and that has not been taken.
 select sp.id into candidate
 from public.scout_player_projections pr
 join public.scout_players sp on sp.id=pr.player_id
 where pr.run_id=rm.model_run_id and sp.active=true
   and sp.position in ('GK','DEF','MID','FWD') and pr.xfp is not null
   and not exists (select 1 from public.scout_draft_picks p
                   where p.room_id=rm.id and p.player_id=sp.id)
   and (select count(*) from public.scout_draft_picks p
        join public.scout_players own on own.id=p.player_id
        where p.room_id=rm.id and p.team_id=team.id and own.position=sp.position)
       < case sp.position when 'GK' then 2 when 'DEF' then 5 when 'MID' then 5 else 3 end
 order by pr.xfp desc,sp.id limit 1;
 if candidate is null then
   return jsonb_build_object('advanced',false,'error','NO_ELIGIBLE_CANDIDATE');
 end if;
 insert into public.scout_draft_picks(room_id,team_id,player_id,pick_number,auto_selected)
 values(rm.id,team.id,candidate,rm.next_pick,true);
 update public.scout_draft_rooms set next_pick=rm.next_pick+1,
   turn_started_at=case when rm.next_pick=rm.team_count*15 then null else clock_timestamp() end,
   status=case when rm.next_pick=rm.team_count*15 then 'finished' else 'drafting' end,
   updated_at=clock_timestamp() where id=rm.id;
 return jsonb_build_object('advanced',true,'player_id',candidate,'pick_number',rm.next_pick);
end $$;

revoke all on function public.scout_draft_config_timers(uuid,integer,integer,integer) from public,anon;
revoke all on function public.scout_draft_classic_advance(uuid) from public,anon;
grant execute on function public.scout_draft_config_timers(uuid,integer,integer,integer) to authenticated;
grant execute on function public.scout_draft_classic_advance(uuid) to authenticated;
