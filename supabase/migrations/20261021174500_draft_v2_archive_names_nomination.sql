-- Draft V2. Existing rooms retain rules_version=1 and their original auction flow.
-- No edits to fantasy scoring, model results, subscription or roster tables.
alter table public.scout_draft_rooms
 add column if not exists rules_version integer not null default 1 check(rules_version in (1,2)),
 add column if not exists auction_phase text not null default 'bidding' check(auction_phase in ('bidding','completion')),
 add column if not exists auction_nomination_index integer not null default 1 check(auction_nomination_index between 1 and 8),
 add column if not exists completed_at timestamptz,
 add column if not exists results_snapshot jsonb;

-- Passed players must be allowed to be nominated again. A player can only be sold once
-- (already guarded by scout_draft_picks unique (room_id, player_id)).
alter table public.scout_draft_auction_lots
 drop constraint if exists scout_draft_auction_lots_room_id_player_id_key;

create index if not exists scout_draft_member_room_history_idx
 on public.scout_draft_teams(user_id,room_id) where user_id is not null;
create index if not exists scout_draft_rooms_history_idx
 on public.scout_draft_rooms(created_at desc);

-- Freeze complete results when the draft finishes, independent of later model refreshes.
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
           'xfp',pr.xfp,'price',p.price,'pick',p.pick_number
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

drop trigger if exists scout_draft_capture_results_on_finish on public.scout_draft_rooms;
create trigger scout_draft_capture_results_on_finish
before update of status on public.scout_draft_rooms
for each row execute function public.scout_draft_capture_results();

create or replace function public.scout_draft_create(p_names text[],p_mode text default 'snake')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid(); rid uuid;code text;runid uuid;gw integer;i integer;n integer;
 alphabet constant text:='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
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
   for i in 1..8 loop
     code:=code||substr(alphabet,1+(get_byte(gen_random_bytes(1),0)%length(alphabet)),1);
   end loop;
   exit when not exists(select 1 from public.scout_draft_rooms where invite_code=code);
 end loop;
 insert into public.scout_draft_rooms(
   id,invite_code,host_user_id,model_run_id,gameweek,mode,draft_kind,team_count,rules_version)
 values(rid,code,u,runid,gw,case when p_mode='linear' then 'linear' else 'snake' end,
        case when p_mode='auction' then 'auction' else 'classic' end,n,2);
 for i in 1..n loop
   insert into public.scout_draft_teams(room_id,team_index,draft_order,team_name,user_id)
   values(rid,i,i,btrim(p_names[i]),case when i=1 then u else null end);
 end loop;
 return jsonb_build_object('room_id',rid,'invite_code',code,'gameweek',gw,'team_count',n);
end $$;

-- Atomic seat allocation and naming. No other member can take the same team name.
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

create or replace function public.scout_draft_rename(p_room_id uuid,p_team_name text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare rm public.scout_draft_rooms%rowtype; t public.scout_draft_teams%rowtype;
 name_clean text:=btrim(p_team_name);
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 if name_clean is null or char_length(name_clean) not between 1 and 40 then raise exception 'INVALID_TEAM_NAMES';end if;
 select * into rm from public.scout_draft_rooms where id=p_room_id for update;
 if not found or rm.status<>'lobby' then raise exception 'DRAFT_ALREADY_STARTED';end if;
 select * into t from public.scout_draft_teams where room_id=rm.id and user_id=auth.uid();
 if not found then raise exception 'ROOM_ACCESS_DENIED';end if;
 if exists(select 1 from public.scout_draft_teams
           where room_id=rm.id and id<>t.id and user_id is not null and lower(team_name)=lower(name_clean))
 then raise exception 'TEAM_NAME_TAKEN';end if;
 update public.scout_draft_teams set team_name=name_clean where id=t.id;
 update public.scout_draft_rooms set updated_at=clock_timestamp() where id=rm.id;
end $$;

-- Read only the signed-in member's rooms, including archived draft rooms.
create or replace function public.scout_draft_my_rooms()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',r.id,'code',r.invite_code,'team_name',t.team_name,
   'gameweek',r.gameweek,'status',r.status,'draft_kind',r.draft_kind,
   'mode',r.mode,'team_count',r.team_count,'created_at',r.created_at,
   'completed_at',r.completed_at,'is_host',r.host_user_id=auth.uid(),
   'picked', (select count(*) from public.scout_draft_picks p where p.room_id=r.id)
 ) order by r.created_at desc),'[]'::jsonb) into result
 from public.scout_draft_rooms r
 join public.scout_draft_teams t on t.room_id=r.id and t.user_id=auth.uid();
 return result;
end $$;

-- Public-grade only; Pro P90 and 6+ data are loaded through existing protected Pro API.
create or replace function public.scout_draft_pool(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_run uuid;v_week integer;v_players jsonb;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 if not exists(select 1 from public.scout_draft_teams where room_id=p_room_id and user_id=auth.uid())
 then raise exception 'ROOM_ACCESS_DENIED';end if;
 select model_run_id,gameweek into v_run,v_week from public.scout_draft_rooms where id=p_room_id;
 select coalesce(jsonb_agg(jsonb_build_object(
 'id',sp.id,'name',sp.full_name,'team',st.name,'position',sp.position,
 'role',sp.primary_role,'xfp',pr.xfp,'core_xfp',pr.core_xfp,'x_bonus',pr.x_bonus,
 'x_minutes',pr.x_minutes,'xi_probability',pr.xi_probability,
 'availability_probability',pr.availability_probability,
 'availability_type',av.availability_type,'opponent',pr.opponent_name,
 'price',sp.price,'value_score',pr.value_score,'total_points',ss.actual_points
 ) order by pr.xfp desc),'[]'::jsonb) into v_players
 from public.scout_player_projections pr
 join public.scout_players sp on sp.id=pr.player_id
 join public.scout_teams st on st.id=sp.team_id
 left join public.scout_availability av on av.run_id=pr.run_id and av.player_id=pr.player_id
 left join lateral (
   select actual_points from public.scout_player_season_stats
   where player_id=sp.id and through_gameweek<v_week
   order by season desc,through_gameweek desc,updated_at desc limit 1
 ) ss on true
 where pr.run_id=v_run and sp.active=true and pr.xfp is not null;
 return v_players;
end $$;

-- Secure room state + archived completed snapshot.
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
 'rules_version',rm.rules_version,'auction_phase',rm.auction_phase,
 'nomination_index',rm.auction_nomination_index,'completed_at',rm.completed_at,
 'results_snapshot',case when rm.status='finished' then rm.results_snapshot else null end,
 'updated_at',rm.updated_at,'is_host',rm.host_user_id=auth.uid(),'teams',seats,'picks',picks,
 'lot',case when rm.draft_kind='auction' then lot else null end);
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
 values(rm.id,num,candidate,clock_timestamp()+interval '15 seconds');
 update public.scout_draft_rooms set updated_at=clock_timestamp() where id=rm.id;
 return jsonb_build_object('ok',true,'lot_number',num,'player_id',candidate);
end $$;

-- After at least a nomination per team, the host may switch to one-credit completion.
create or replace function public.scout_draft_auction_finish_bidding(p_room_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare rm public.scout_draft_rooms%rowtype;target integer;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select * into rm from public.scout_draft_rooms where id=p_room_id for update;
 if not found or rm.host_user_id<>auth.uid() then raise exception 'HOST_ONLY';end if;
 if rm.status<>'drafting' or rm.draft_kind<>'auction' or rm.rules_version<>2
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
 if not found or rm.status<>'drafting' or rm.rules_version<>2 or rm.draft_kind<>'auction'
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

-- Concurrency-safe V2 settlement: passed lots remain re-nominatable. V1 rooms keep
-- the existing automatic nomination flow below.
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
 if rm.rules_version=2 then
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
 values(rm.id,num,candidate,clock_timestamp()+interval '15 seconds');
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
   ends_at=greatest(ends_at,clock_timestamp())+interval '5 seconds'
 where id=lot.id;
 insert into public.scout_draft_auction_bids(room_id,lot_id,team_id,amount) values(rm.id,lot.id,t.id,p_amount);
 update public.scout_draft_rooms set updated_at=clock_timestamp() where id=rm.id;
 return jsonb_build_object('ok',true,'amount',p_amount,'ends_at',
    (select ends_at from public.scout_draft_auction_lots where id=lot.id),'max_bid',max_bid);
end $$;

revoke all on function public.scout_draft_auction_advance(uuid) from public,anon;
revoke all on function public.scout_draft_auction_bid(uuid,integer) from public,anon;
grant execute on function public.scout_draft_auction_advance(uuid) to authenticated;
grant execute on function public.scout_draft_auction_bid(uuid,integer) to authenticated;

-- Limit privileged API calls to authenticated sessions, which are rechecked
-- against auth.uid() and room membership in each security-definer function.
revoke all on function public.scout_draft_join_named(text,text) from public,anon;
revoke all on function public.scout_draft_rename(uuid,text) from public,anon;
revoke all on function public.scout_draft_my_rooms() from public,anon;
revoke all on function public.scout_draft_auction_nominate(uuid,integer) from public,anon;
revoke all on function public.scout_draft_auction_finish_bidding(uuid) from public,anon;
revoke all on function public.scout_draft_auction_complete_pick(uuid,integer) from public,anon;
revoke all on function public.scout_draft_capture_results() from public,anon,authenticated;
grant execute on function public.scout_draft_join_named(text,text) to authenticated;
grant execute on function public.scout_draft_rename(uuid,text) to authenticated;
grant execute on function public.scout_draft_my_rooms() to authenticated;
grant execute on function public.scout_draft_auction_nominate(uuid,integer) to authenticated;
grant execute on function public.scout_draft_auction_finish_bidding(uuid) to authenticated;
grant execute on function public.scout_draft_auction_complete_pick(uuid,integer) to authenticated;
