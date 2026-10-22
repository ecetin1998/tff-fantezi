-- Server-authoritative CPU turns for Snake, Normal and Auction.
-- Every CPU mutation is gated by a real room member and a room-level row lock.
create or replace function public.scout_draft_bot_advance(p_room_id uuid)
returns jsonb language plpgsql security definer
set search_path=public,pg_temp as $$
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
end $$;

-- Form a legal 4-4-2 XI and bench of 1 GK + 3 outfield players for every CPU
-- immediately after the final purchase. Human manager still must click Ready.
create or replace function public.scout_draft_complete_bot_lineups()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare
 bot record;start_ids integer[];bench_ids integer[];captain integer;
begin
 if new.status<>'finished' or old.status='finished'
   or new.opponent_mode<>'computer' or not new.lineup_required
 then return new;end if;
 for bot in select id from public.scout_draft_teams
  where room_id=new.id and is_bot=true
 loop
   with ranked as (
    select p.player_id,sp.position,pr.xfp,
      row_number() over(partition by sp.position order by pr.xfp desc nulls last,p.player_id) as rank_pos
    from public.scout_draft_picks p
    join public.scout_players sp on sp.id=p.player_id
    left join public.scout_player_projections pr
      on pr.run_id=new.model_run_id and pr.player_id=p.player_id
    where p.room_id=new.id and p.team_id=bot.id
   )
   select array_agg(player_id order by
       case position when 'GK' then 0 when 'DEF' then 1 when 'MID' then 2 else 3 end,
       xfp desc nulls last,player_id)
   into start_ids from ranked
   where rank_pos<=case position when 'GK' then 1 when 'DEF' then 4
                                 when 'MID' then 4 else 2 end;
   select array_agg(p.player_id order by
      case sp.position when 'GK' then 0 when 'DEF' then 1 when 'MID' then 2 else 3 end,
      pr.xfp desc nulls last,p.player_id)
   into bench_ids from public.scout_draft_picks p
   join public.scout_players sp on sp.id=p.player_id
   left join public.scout_player_projections pr
    on pr.run_id=new.model_run_id and pr.player_id=p.player_id
   where p.room_id=new.id and p.team_id=bot.id
      and not (p.player_id=any(start_ids));
   if cardinality(start_ids)<>11 or cardinality(bench_ids)<>4 then
     raise exception 'BOT_LINEUP_INCOMPLETE';
   end if;
   select p.player_id into captain
   from unnest(start_ids) as starting(player_id)
   join public.scout_draft_picks p on p.room_id=new.id
      and p.team_id=bot.id and p.player_id=starting.player_id
   join public.scout_players sp on sp.id=p.player_id
   left join public.scout_player_projections pr
     on pr.run_id=new.model_run_id and pr.player_id=p.player_id
   where sp.position<>'GK'
   order by pr.xfp desc nulls last,p.player_id limit 1;
   insert into public.scout_draft_lineups(
    room_id,team_id,gameweek,formation,captain_player_id,manager_card,starters,bench,ready)
   values(new.id,bot.id,new.gameweek,'4-4-2',captain,'none',start_ids,bench_ids,true)
   on conflict(room_id,team_id,gameweek) do nothing;
 end loop;
 return new;
end $$;

drop trigger if exists scout_draft_cpu_lineup_when_finished on public.scout_draft_rooms;
create trigger scout_draft_cpu_lineup_when_finished
after update of status on public.scout_draft_rooms
for each row execute function public.scout_draft_complete_bot_lineups();

revoke all on function public.scout_draft_bot_advance(uuid) from public,anon;
grant execute on function public.scout_draft_bot_advance(uuid) to authenticated;
revoke all on function public.scout_draft_complete_bot_lineups() from public,anon,authenticated;
