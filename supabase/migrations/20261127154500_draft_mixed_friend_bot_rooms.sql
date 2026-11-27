-- Mixed friend + CPU rooms: only host can edit unoccupied lobby seats.
create or replace function public.scout_draft_set_lobby_bot(p_room_id uuid,p_team_index integer,p_enabled boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare rm public.scout_draft_rooms%rowtype; seat public.scout_draft_teams%rowtype; chosen text; label_text text;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select * into rm from public.scout_draft_rooms where id=p_room_id for update;
 if not found or rm.host_user_id is distinct from auth.uid() then raise exception 'HOST_ONLY';end if;
 if rm.status<>'lobby' then raise exception 'DRAFT_ALREADY_STARTED';end if;
 if rm.opponent_mode='computer' then raise exception 'BOT_ROOM_PRIVATE';end if;
 if p_enabled is null then raise exception 'INVALID_SEAT';end if;
 select * into seat from public.scout_draft_teams where room_id=rm.id and team_index=p_team_index for update;
 if not found or seat.user_id is not null then raise exception 'SEAT_TAKEN';end if;
 if seat.is_bot=p_enabled then return jsonb_build_object('changed',false);end if;
 if p_enabled then
  select v.profile,v.label into chosen,label_text
  from (values ('aggressive','Agresif'),('safe','Garantici'),('balanced','Dengeli'),('upside','Sürprizci'),('value','Fırsatçı'),('attack','Hücumcu'),('defense','Savunmacı')) v(profile,label)
  where not exists(select 1 from public.scout_draft_teams t where t.room_id=rm.id and t.is_bot and t.bot_profile=v.profile)
  order by random() limit 1;
  if chosen is null then raise exception 'NO_ELIGIBLE_CANDIDATE';end if;
  update public.scout_draft_teams set is_bot=true,bot_profile=chosen,team_name='Bilgisayar '||seat.team_index||' · '||label_text where id=seat.id;
 else
  update public.scout_draft_teams set is_bot=false,bot_profile=null,team_name='Takım '||seat.team_index where id=seat.id;
 end if;
 update public.scout_draft_rooms set updated_at=clock_timestamp() where id=rm.id;
 return jsonb_build_object('changed',true,'is_bot',p_enabled,'profile',chosen);
end $$;
revoke all on function public.scout_draft_set_lobby_bot(uuid,integer,boolean) from public,anon;
grant execute on function public.scout_draft_set_lobby_bot(uuid,integer,boolean) to authenticated;
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
 if not exists(
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
   order by (private.scout_draft_profile_score(bot.bot_profile,pr,sp.position)+private.scout_draft_position_need(rm.id,bot.id,sp.position)) desc,sp.id
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
   order by (private.scout_draft_profile_score(bot.bot_profile,pr,sp.position)+private.scout_draft_position_need(rm.id,bot.id,sp.position)) desc,sp.id limit 1;
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
   order by (private.scout_draft_profile_score(bot.bot_profile,pr,sp.position)+private.scout_draft_position_need(rm.id,bot.id,sp.position)) desc,sp.id limit 1;
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
       select private.scout_draft_bid_value(t.bot_profile,pr,v_pos,rm.id,t.id)
       from public.scout_player_projections pr
       where pr.run_id=rm.model_run_id and pr.player_id=lot.player_id
     ),0))::integer)
  )>lot.current_bid
 order by (select private.scout_draft_bid_value(t.bot_profile,pr,v_pos,rm.id,t.id) from public.scout_player_projections pr where pr.run_id=rm.model_run_id and pr.player_id=lot.player_id) desc nulls last,count_all.total asc,t.draft_order
 limit 1;
 if not found then
   return jsonb_build_object('advanced',false,'reason','BOTS_PASSED');
 end if;
 select count(*),coalesce(sum(price),0) into v_count,v_spent
 from public.scout_draft_picks where room_id=rm.id and team_id=bot.id;
 v_bid_cap:=least(
   rm.auction_budget-v_spent-(14-v_count),
   greatest(1,ceil(coalesce((
     select private.scout_draft_bid_value(bot.bot_profile,pr,v_pos,rm.id,bot.id)
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
;
CREATE OR REPLACE FUNCTION public.scout_draft_complete_bot_lineups()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare bot record; lineup record;
begin
 if new.status<>'finished' or old.status='finished' or not new.lineup_required then return new;end if;
 for bot in select id,bot_profile from public.scout_draft_teams where room_id=new.id and is_bot=true loop
 select * into lineup from private.scout_draft_best_bot_lineup(new.id,bot.id,new.model_run_id,bot.bot_profile);
 if not found or cardinality(lineup.starters)<>11 or cardinality(lineup.bench)<>4 then raise exception 'BOT_LINEUP_INCOMPLETE';end if;
 insert into public.scout_draft_lineups(room_id,team_id,gameweek,formation,captain_player_id,manager_card,starters,bench,ready)
 values(new.id,bot.id,new.gameweek,lineup.formation,lineup.captain,lineup.manager_card,lineup.starters,lineup.bench,true)
 on conflict(room_id,team_id,gameweek) do nothing;
 end loop;
 return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.scout_draft_join(p_code text, p_team_index integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_user uuid:=auth.uid();v_room public.scout_draft_rooms%rowtype;v_team public.scout_draft_teams%rowtype;
begin
 if v_user is null then raise exception 'AUTH_REQUIRED';end if;
 if p_team_index not between 1 and 8 then raise exception 'INVALID_SEAT';end if;
 select * into v_room from public.scout_draft_rooms where invite_code=upper(btrim(p_code)) for update;
 if not found then raise exception 'ROOM_NOT_FOUND';end if;
 if v_room.opponent_mode='computer' then raise exception 'BOT_ROOM_PRIVATE';end if;
 if v_room.status<>'lobby' then raise exception 'DRAFT_ALREADY_STARTED';end if;
 if exists(select 1 from public.scout_draft_teams where room_id=v_room.id and user_id=v_user) then
   raise exception 'ALREADY_JOINED';
 end if;
 select * into v_team from public.scout_draft_teams
 where room_id=v_room.id and team_index=p_team_index for update;
 if not found or v_team.user_id is not null or v_team.is_bot then raise exception 'SEAT_TAKEN';end if;
 update public.scout_draft_teams set user_id=v_user where id=v_team.id;
 update public.scout_draft_rooms set updated_at=now() where id=v_room.id;
 return v_room.id;
end $function$
;
CREATE OR REPLACE FUNCTION public.scout_draft_join_named(p_code text, p_team_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare u uuid:=auth.uid();rm public.scout_draft_rooms%rowtype;t public.scout_draft_teams%rowtype;
 name_clean text:=btrim(p_team_name);
begin
 if u is null then raise exception 'AUTH_REQUIRED';end if;
 if name_clean is null or char_length(name_clean) not between 1 and 40 then raise exception 'INVALID_TEAM_NAMES';end if;
 select * into rm from public.scout_draft_rooms where invite_code=upper(btrim(p_code)) for update;
 if not found then raise exception 'ROOM_NOT_FOUND';end if;
 if rm.opponent_mode='computer' then raise exception 'BOT_ROOM_PRIVATE';end if;
 if rm.status<>'lobby' then raise exception 'DRAFT_ALREADY_STARTED';end if;
 if exists(select 1 from public.scout_draft_teams where room_id=rm.id and user_id=u) then
   raise exception 'ALREADY_JOINED';end if;
 if exists(select 1 from public.scout_draft_teams
           where room_id=rm.id and (user_id is not null or is_bot) and lower(team_name)=lower(name_clean))
 then raise exception 'TEAM_NAME_TAKEN';end if;
 select * into t from public.scout_draft_teams where room_id=rm.id and user_id is null and not is_bot
 order by team_index limit 1 for update;
 if not found then raise exception 'ROOM_FULL';end if;
 update public.scout_draft_teams set user_id=u,team_name=name_clean where id=t.id;
 update public.scout_draft_rooms set updated_at=clock_timestamp() where id=rm.id;
 return rm.id;
end $function$
;
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
 order by case when team.is_bot then private.scout_draft_profile_score(team.bot_profile,pr,sp.position)+private.scout_draft_position_need(rm.id,team.id,sp.position) else pr.xfp end desc,sp.id limit 1;
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
;
