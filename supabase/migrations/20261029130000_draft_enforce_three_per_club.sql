-- Enforce max-3-per-club for all modes and all pick write paths.
-- Preserve historical draft picks; preexisting over-limit teams remain archived.
create or replace function private.scout_draft_club_has_space(
  p_room_id uuid,p_team_id uuid,p_club_id integer
) returns boolean language sql volatile security definer
set search_path=public,pg_temp as $$
 select p_club_id is not null and (
   select count(*) from public.scout_draft_picks pk
   join public.scout_players owned on owned.id=pk.player_id
   where pk.room_id=p_room_id and pk.team_id=p_team_id
     and owned.team_id=p_club_id
 ) < 3
$$;
revoke all on function private.scout_draft_club_has_space(uuid,uuid,integer)
 from public,anon,authenticated;

create or replace function private.scout_draft_club_limit_guard()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare club_id integer;
begin
 if not exists(select 1 from public.scout_draft_teams t
   where t.id=new.team_id and t.room_id=new.room_id)
 then raise exception 'INVALID_DRAFT_TEAM';end if;
 select sp.team_id into club_id from public.scout_players sp where sp.id=new.player_id;
 if not private.scout_draft_club_has_space(new.room_id,new.team_id,club_id)
 then raise exception 'CLUB_LIMIT_REACHED';end if;
 return new;
end $$;
revoke all on function private.scout_draft_club_limit_guard()
 from public,anon,authenticated;
drop trigger if exists scout_draft_club_limit_guard on public.scout_draft_picks;
create trigger scout_draft_club_limit_guard
before insert on public.scout_draft_picks
for each row execute function private.scout_draft_club_limit_guard();

-- Candidate filtering prevents timeout/bot loops from getting stuck trying
-- the same unavailable player, while the trigger protects final inserts.

-- scout_draft_classic_advance
CREATE OR REPLACE FUNCTION public.scout_draft_classic_advance(p_room_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
   and private.scout_draft_club_has_space(rm.id,team.id,sp.team_id)
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
end $function$


-- scout_draft_bot_advance
CREATE OR REPLACE FUNCTION public.scout_draft_bot_advance(p_room_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 rm public.scout_draft_rooms%rowtype;
 bot public.scout_draft_teams%rowtype;
 lot public.scout_draft_auction_lots%rowtype;
 v_round integer;v_slot integer;v_player integer;v_pos text;
 v_count integer;v_spent integer;v_pos_count integer;v_cap integer;
 v_bid integer;v_bid_cap integer;v_lot_no integer;v_next_slot integer;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select * into rm from public.scout_draft_rooms where id=p_room_id for update;
 if not found then raise exception 'ROOM_NOT_FOUND';end if;
 if rm.opponent_mode<>'computer' or not exists(
   select 1 from public.scout_draft_teams
   where room_id=rm.id and user_id=auth.uid() and is_bot=false
 ) then raise exception 'ROOM_ACCESS_DENIED';end if;
 if rm.status<>'drafting' then
   return jsonb_build_object('advanced',false,'status',rm.status);
 end if;
 -- Keep mobile draft interactions predictable; one CPU action per tick.
 if rm.last_bot_action_at is not null
   and clock_timestamp()<rm.last_bot_action_at+interval '1 second'
 then return jsonb_build_object('advanced',false,'reason','BOT_THROTTLED');end if;

 if rm.draft_kind='classic' then
   v_round:=((rm.next_pick-1)/rm.team_count)+1;
   v_slot:=mod(rm.next_pick-1,rm.team_count)+1;
   if rm.mode='snake' and mod(v_round,2)=0 then
     v_slot:=rm.team_count+1-v_slot;
   end if;
   select * into bot from public.scout_draft_teams
   where room_id=rm.id and draft_order=v_slot and is_bot=true;
   if not found then return jsonb_build_object('advanced',false,'reason','HUMAN_TURN');end if;
   select sp.id into v_player
   from public.scout_player_projections pr
   join public.scout_players sp on sp.id=pr.player_id
   where pr.run_id=rm.model_run_id and sp.active=true
    and sp.position in ('GK','DEF','MID','FWD') and pr.xfp is not null
    and coalesce(pr.availability_probability,1)>0
    and not exists(select 1 from public.scout_draft_picks p
      where p.room_id=rm.id and p.player_id=sp.id)
    and (select count(*) from public.scout_draft_picks p
        join public.scout_players owned on owned.id=p.player_id
        where p.room_id=rm.id and p.team_id=bot.id and owned.position=sp.position)
       <case sp.position when 'GK' then 2 when 'DEF' then 5
                          when 'MID' then 5 else 3 end
     and private.scout_draft_club_has_space(rm.id,bot.id,sp.team_id)
   order by (pr.xfp+coalesce(pr.xi_probability,0)*0.28
    +coalesce(pr.x_minutes,0)/90.0*0.16) desc,sp.id
   limit 1;
   if v_player is null then
     return jsonb_build_object('advanced',false,'reason','NO_ELIGIBLE_CANDIDATE');
   end if;
   insert into public.scout_draft_picks(room_id,team_id,player_id,pick_number,auto_selected)
   values(rm.id,bot.id,v_player,rm.next_pick,true);
   update public.scout_draft_rooms set
    next_pick=rm.next_pick+1,last_bot_action_at=clock_timestamp(),
    turn_started_at=case when rm.next_pick=rm.team_count*15 then null else clock_timestamp() end,
    status=case when rm.next_pick=rm.team_count*15 then 'finished' else 'drafting' end,
    updated_at=clock_timestamp()
    where id=rm.id;
   return jsonb_build_object('advanced',true,'kind','classic_pick',
    'player_id',v_player,'team_id',bot.id,'pick_number',rm.next_pick);
 end if;

 if rm.draft_kind<>'auction' or rm.rules_version<>2 then
   return jsonb_build_object('advanced',false,'reason','MODE_UNSUPPORTED');
 end if;
 if rm.auction_phase='completion' then
   select * into bot from public.scout_draft_teams
   where room_id=rm.id and draft_order=rm.auction_nomination_index and is_bot=true;
   if not found then return jsonb_build_object('advanced',false,'reason','HUMAN_TURN');end if;
   select sp.id into v_player from public.scout_player_projections pr
   join public.scout_players sp on sp.id=pr.player_id
   where pr.run_id=rm.model_run_id and sp.active=true
    and sp.position in('GK','DEF','MID','FWD') and pr.xfp is not null
    and coalesce(pr.availability_probability,1)>0
    and not exists(select 1 from public.scout_draft_picks p
     where p.room_id=rm.id and p.player_id=sp.id)
    and (select count(*) from public.scout_draft_picks p
      join public.scout_players owned on owned.id=p.player_id
      where p.room_id=rm.id and p.team_id=bot.id and owned.position=sp.position)
      <case sp.position when 'GK' then 2 when 'DEF' then 5 when 'MID' then 5 else 3 end
     and private.scout_draft_club_has_space(rm.id,bot.id,sp.team_id)
   order by (pr.xfp+coalesce(pr.xi_probability,0)*0.2) desc,sp.id limit 1;
   if v_player is null then
     return jsonb_build_object('advanced',false,'reason','NO_ELIGIBLE_CANDIDATE');
   end if;
   select count(*),coalesce(sum(price),0) into v_count,v_spent
   from public.scout_draft_picks where room_id=rm.id and team_id=bot.id;
   if v_count>=15 or v_spent+1>rm.auction_budget then
     return jsonb_build_object('advanced',false,'reason','BUDGET_EXCEEDED');
   end if;
   insert into public.scout_draft_picks(room_id,team_id,player_id,pick_number,price,auto_selected)
   values(rm.id,bot.id,v_player,rm.next_pick,1,true);
   if rm.next_pick=rm.team_count*15 then
     update public.scout_draft_rooms set next_pick=rm.next_pick+1,status='finished',
       last_bot_action_at=clock_timestamp(),updated_at=clock_timestamp()
     where id=rm.id;
   else
     select nt.draft_order into v_next_slot from public.scout_draft_teams nt
     where nt.room_id=rm.id and (select count(*) from public.scout_draft_picks p
       where p.room_id=rm.id and p.team_id=nt.id)<15
     order by mod(nt.draft_order-rm.auction_nomination_index-1+rm.team_count,rm.team_count)
     limit 1;
     update public.scout_draft_rooms set next_pick=rm.next_pick+1,
       auction_nomination_index=v_next_slot,last_bot_action_at=clock_timestamp(),
       updated_at=clock_timestamp() where id=rm.id;
   end if;
   return jsonb_build_object('advanced',true,'kind','completion_pick',
    'team_id',bot.id,'player_id',v_player);
 end if;

 -- Bot nomination: highest relevant xFP not yet bought; passed lots remain eligible.
 select * into lot from public.scout_draft_auction_lots
 where room_id=rm.id and status='open' order by lot_number desc limit 1;
 if not found then
   select * into bot from public.scout_draft_teams
   where room_id=rm.id and draft_order=rm.auction_nomination_index and is_bot=true;
   if not found then
     return jsonb_build_object('advanced',false,'reason','HUMAN_NOMINATION');
   end if;
   select sp.id into v_player from public.scout_player_projections pr
   join public.scout_players sp on sp.id=pr.player_id
   where pr.run_id=rm.model_run_id and sp.active=true
     and sp.position in ('GK','DEF','MID','FWD') and pr.xfp is not null
     and coalesce(pr.availability_probability,1)>0
     and not exists(select 1 from public.scout_draft_picks p
      where p.room_id=rm.id and p.player_id=sp.id)
     and (select count(*) from public.scout_draft_picks p
      join public.scout_players own on own.id=p.player_id
      where p.room_id=rm.id and p.team_id=bot.id and own.position=sp.position)
      <case sp.position when 'GK' then 2 when 'DEF' then 5 when 'MID' then 5 else 3 end
     and private.scout_draft_club_has_space(rm.id,bot.id,sp.team_id)
   order by (pr.xfp+coalesce(pr.xi_probability,0)*0.23) desc,sp.id limit 1;
   if v_player is null then
     return jsonb_build_object('advanced',false,'reason','NO_ELIGIBLE_CANDIDATE');
   end if;
   select coalesce(max(lot_number),0)+1 into v_lot_no
   from public.scout_draft_auction_lots where room_id=rm.id;
   insert into public.scout_draft_auction_lots(room_id,lot_number,player_id,ends_at)
   values(rm.id,v_lot_no,v_player,
          clock_timestamp()+rm.auction_bid_seconds*interval '1 second');
   update public.scout_draft_rooms set last_bot_action_at=clock_timestamp(),
      updated_at=clock_timestamp() where id=rm.id;
   return jsonb_build_object('advanced',true,'kind','nomination',
      'player_id',v_player,'lot_number',v_lot_no);
 end if;

 if clock_timestamp()>=lot.ends_at then
   return jsonb_build_object('advanced',false,'reason','LOT_SETTLEMENT_PENDING');
 end if;
 -- One bot bid per action; respect both position quotas and the minimum
 -- credit reserve for each remaining empty roster spot.
 select sp.position,pr.xfp::integer into v_pos,v_bid
 from public.scout_players sp
 join public.scout_player_projections pr on pr.player_id=sp.id
 where sp.id=lot.player_id and pr.run_id=rm.model_run_id;
 if v_pos is null then return jsonb_build_object('advanced',false,'reason','PLAYER_UNKNOWN');end if;
 v_cap:=case v_pos when 'GK' then 2 when 'DEF' then 5 when 'MID' then 5 else 3 end;
 select t.* into bot from public.scout_draft_teams t
 left join lateral (
   select count(*)::integer total,coalesce(sum(p.price),0)::integer spent
   from public.scout_draft_picks p where p.room_id=rm.id and p.team_id=t.id
 ) count_all on true
 where t.room_id=rm.id and t.is_bot=true and t.id is distinct from lot.leader_team_id
  and count_all.total<15
   and private.scout_draft_club_has_space(rm.id,t.id,
     (select sp.team_id from public.scout_players sp where sp.id=lot.player_id))
  and (select count(*) from public.scout_draft_picks p
       join public.scout_players own on own.id=p.player_id
       where p.room_id=rm.id and p.team_id=t.id and own.position=v_pos)<v_cap
  and least(rm.auction_budget-count_all.spent-(14-count_all.total),
     greatest(1,ceil(coalesce((
       select pr.xfp*1.8+coalesce(pr.xi_probability,0)*2.3
       from public.scout_player_projections pr
       where pr.run_id=rm.model_run_id and pr.player_id=lot.player_id
     ),0))::integer)
  )>lot.current_bid
 order by count_all.total asc,t.draft_order
 limit 1;
 if not found then
   return jsonb_build_object('advanced',false,'reason','BOTS_PASSED');
 end if;
 select count(*),coalesce(sum(price),0) into v_count,v_spent
 from public.scout_draft_picks where room_id=rm.id and team_id=bot.id;
 v_bid_cap:=least(
   rm.auction_budget-v_spent-(14-v_count),
   greatest(1,ceil(coalesce((
     select pr.xfp*1.8+coalesce(pr.xi_probability,0)*2.3
     from public.scout_player_projections pr
     where pr.run_id=rm.model_run_id and pr.player_id=lot.player_id
   ),0))::integer)
 );
 if v_bid_cap<=lot.current_bid then
   return jsonb_build_object('advanced',false,'reason','BOTS_PASSED');
 end if;
 v_bid:=lot.current_bid+1;
 update public.scout_draft_auction_lots
 set current_bid=v_bid,leader_team_id=bot.id,
   ends_at=greatest(ends_at,clock_timestamp())+
     rm.auction_extension_seconds*interval '1 second'
 where id=lot.id;
 insert into public.scout_draft_auction_bids(room_id,lot_id,team_id,amount)
 values(rm.id,lot.id,bot.id,v_bid);
 update public.scout_draft_rooms set last_bot_action_at=clock_timestamp(),
   updated_at=clock_timestamp() where id=rm.id;
 return jsonb_build_object('advanced',true,'kind','bid','team_id',bot.id,
  'amount',v_bid,'player_id',lot.player_id);
end $function$


-- scout_draft_auction_nominate
CREATE OR REPLACE FUNCTION public.scout_draft_auction_nominate(p_room_id uuid, p_player_id integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
     and private.scout_draft_club_has_space(rm.id,t.id,sp.team_id)
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
end $function$


-- scout_draft_auction_advance
CREATE OR REPLACE FUNCTION public.scout_draft_auction_advance(p_room_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
   and private.scout_draft_club_has_space(rm.id,t.id,sp.team_id)
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
end $function$


-- scout_draft_auction_bid
CREATE OR REPLACE FUNCTION public.scout_draft_auction_bid(p_room_id uuid, p_amount integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare rm public.scout_draft_rooms%rowtype;
 t public.scout_draft_teams%rowtype;lot public.scout_draft_auction_lots%rowtype;
 pos text;club_id integer;count_all integer;count_pos integer;max_bid integer;max_position integer;
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
 select position,team_id into pos,club_id from public.scout_players where id=lot.player_id;
 if not private.scout_draft_club_has_space(rm.id,t.id,club_id) then raise exception 'CLUB_LIMIT_REACHED';end if;
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
end $function$


-- scout_draft_auction_complete_pick
CREATE OR REPLACE FUNCTION public.scout_draft_auction_complete_pick(p_room_id uuid, p_player_id integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
 if not private.scout_draft_club_has_space(rm.id,t.id,
  (select sp.team_id from public.scout_players sp where sp.id=p_player_id))
 then raise exception 'CLUB_LIMIT_REACHED';end if;
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
end $function$

