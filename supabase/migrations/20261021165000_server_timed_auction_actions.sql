
-- All auction actions lock a single room row before mutating: race-safe across devices.
-- No cron/Worker needed for correctness; any authenticated participant can settle an expired lot.
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
