-- New CPU personalities; historical lineups remain untouched.
alter table public.scout_draft_teams add column if not exists bot_profile text;
alter table public.scout_draft_teams add constraint scout_draft_bot_profile_check check(bot_profile is null or (is_bot and bot_profile in ('aggressive','safe','balanced','upside','value','attack','defense')));
create or replace function private.scout_draft_profile_score(profile text,p public.scout_player_projections,pos text)
returns numeric language sql immutable set search_path=pg_catalog,public,pg_temp as $$
select coalesce(p.xfp,0)+case coalesce(profile,'balanced')
when 'aggressive' then .34*(coalesce(p.p90,p.xfp,0)-coalesce(p.xfp,0))+1.2*coalesce(p.six_plus_probability,0)
when 'safe' then .48*(coalesce(p.p25,p.xfp,0)-coalesce(p.xfp,0))+1.5*coalesce(p.xi_probability,0)+.55*coalesce(p.x_minutes,0)/90
when 'upside' then .50*(coalesce(p.p90,p.xfp,0)-coalesce(p.xfp,0))+.6*coalesce(p.six_plus_probability,0)-.18*coalesce(p.xi_probability,0)
when 'value' then .20*(coalesce(p.p75,p.xfp,0)-coalesce(p.xfp,0))+.65*coalesce(p.xi_probability,0)
when 'attack' then .20*(coalesce(p.p90,p.xfp,0)-coalesce(p.xfp,0))+case when pos in ('MID','FWD') then .55 else 0 end+coalesce(p.expected_goals,0)*.8+coalesce(p.expected_assists,0)*.5
when 'defense' then .30*(coalesce(p.p25,p.xfp,0)-coalesce(p.xfp,0))+.9*coalesce(p.over60_probability,0)+case when pos in ('GK','DEF') then .85 else 0 end
else .12*(coalesce(p.p75,p.xfp,0)-coalesce(p.xfp,0))+.5*coalesce(p.xi_probability,0)+.2*coalesce(p.x_minutes,0)/90 end
-case when coalesce(p.availability_probability,1)<.5 then 1.5*(.5-coalesce(p.availability_probability,1)) else 0 end;
$$;
create or replace function private.scout_draft_position_need(rid uuid,tid uuid,pos text)
returns numeric language sql stable set search_path=pg_catalog,public,pg_temp as $$
select case when count(*)=0 then case when pos='GK' then .2 else .6 end
when count(*)<case pos when 'GK' then 1 when 'DEF' then 3 when 'MID' then 2 else 1 end then .35
when count(*)>=case pos when 'GK' then 1 when 'DEF' then 4 when 'MID' then 4 else 2 end then -.35 else 0 end
from public.scout_draft_picks k join public.scout_players sp on sp.id=k.player_id
where k.room_id=rid and k.team_id=tid and sp.position=pos;
$$;
create or replace function private.scout_draft_bid_value(profile text,p public.scout_player_projections,pos text,rid uuid,tid uuid)
returns numeric language sql stable set search_path=pg_catalog,public,pg_temp as $$
select greatest(1,private.scout_draft_profile_score(profile,p,pos)*case coalesce(profile,'balanced')
when 'aggressive' then 2.05 when 'safe' then 1.7 when 'upside' then 1.85 when 'value' then 1.35 when 'attack' then 1.95 when 'defense' then 1.8 else 1.8 end
+coalesce(p.xi_probability,0)*1.6+private.scout_draft_position_need(rid,tid,pos)*2);
$$;
create or replace function private.scout_draft_best_bot_lineup(rid uuid,tid uuid,runid uuid,profile text)
returns table(formation text,starters integer[],bench integer[],captain integer,manager_card text,utility numeric)
language sql stable set search_path=pg_catalog,public,pg_temp as $$
with players as (
 select k.player_id,sp.position,coalesce(pr.xfp,0) xfp,private.scout_draft_profile_score(profile,pr,sp.position) score,
 coalesce(pr.p25,pr.xfp,0) floor_score,coalesce(pr.p90,pr.xfp,0) ceiling_score
 from public.scout_draft_picks k join public.scout_players sp on sp.id=k.player_id
 left join public.scout_player_projections pr on pr.run_id=runid and pr.player_id=k.player_id
 where k.room_id=rid and k.team_id=tid
), ranked as (
 select *,row_number() over(partition by position order by score desc,xfp desc,player_id) rn from players
), formations as (
 select f.value form,split_part(f.value,'-',1)::int d,split_part(f.value,'-',2)::int m,split_part(f.value,'-',3)::int a
 from public.scout_game_rules g cross join lateral jsonb_array_elements_text(g.rules->'formations') f(value)
 where g.season=(select max(season) from public.scout_game_rules)
), layouts as (
 select f.form,array_agg(r.player_id order by case r.position when 'GK' then 0 when 'DEF' then 1 when 'MID' then 2 else 3 end,r.score desc,r.player_id) filter(where q.starting) starters,
 array_agg(r.player_id order by (r.position='GK') desc,r.score desc,r.player_id) filter(where not q.starting) bench,
 sum(r.score) filter(where q.starting) xi_score,sum(r.score) filter(where not q.starting) bench_score
 from formations f cross join ranked r cross join lateral(select r.rn<=case r.position when 'GK' then 1 when 'DEF' then f.d when 'MID' then f.m else f.a end starting) q
 group by f.form
), options as (
 select l.*,c.player_id captain,card.card,
 l.xi_score+c.score+case card.card when 'bench_boost' then l.bench_score when 'triple_captain' then c.score when 'quad_captain' then 2*c.score else 0 end
 -case when coalesce(profile,'balanced') in ('safe','defense') then case card.card when 'quad_captain' then .30*greatest(0,c.ceiling_score-c.floor_score) when 'triple_captain' then .12*greatest(0,c.ceiling_score-c.floor_score) else 0 end else 0 end utility
 from layouts l join players c on c.player_id=any(l.starters) and c.position<>'GK'
 cross join (values ('none'),('triple_captain'),('quad_captain'),('bench_boost')) card(card)
 where cardinality(l.starters)=11 and cardinality(l.bench)=4
 and (card.card='none' or not exists(select 1 from public.scout_draft_lineups used join public.scout_draft_rooms rm on rm.id=rid where used.room_id=rid and used.team_id=tid and used.gameweek<>rm.gameweek and used.manager_card=card.card))
)
select o.form,o.starters,o.bench,o.captain,o.card,o.utility from options o order by o.utility desc,o.xi_score desc,o.form,o.captain,o.card limit 1;
$$;
revoke all on function private.scout_draft_profile_score(text,public.scout_player_projections,text) from public,anon,authenticated;
revoke all on function private.scout_draft_position_need(uuid,uuid,text) from public,anon,authenticated;
revoke all on function private.scout_draft_bid_value(text,public.scout_player_projections,text,uuid,uuid) from public,anon,authenticated;
revoke all on function private.scout_draft_best_bot_lineup(uuid,uuid,uuid,text) from public,anon,authenticated;
CREATE OR REPLACE FUNCTION public.scout_draft_create_vs_bot(p_team_name text, p_mode text DEFAULT 'snake'::text, p_team_count integer DEFAULT 2)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare room_data jsonb;new_room uuid;team_names text[];i integer;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 if p_team_count not between 2 and 8 then raise exception 'INVALID_TEAM_COUNT';end if;
 if p_team_name is null or length(btrim(p_team_name)) not between 1 and 40
 then raise exception 'INVALID_TEAM_NAMES';end if;
 if p_mode not in ('snake','linear','auction') then raise exception 'INVALID_MODE';end if;
 team_names:=array[btrim(p_team_name)];
 for i in 1..p_team_count-1 loop
   team_names:=array_append(team_names,'Bilgisayar '||i::text);
 end loop;
 room_data:=public.scout_draft_create(team_names,p_mode);
 new_room:=(room_data->>'room_id')::uuid;
 update public.scout_draft_rooms set opponent_mode='computer',updated_at=clock_timestamp()
 where id=new_room and host_user_id=auth.uid() and status='lobby';
 with shuffled as (
 select profile,label,row_number() over(order by random()) slot
 from (values ('aggressive','Agresif'),('safe','Garantici'),('balanced','Dengeli'),('upside','Sürprizci'),('value','Fırsatçı'),('attack','Hücumcu'),('defense','Savunmacı')) v(profile,label)
 )
 update public.scout_draft_teams t set is_bot=true,bot_profile=s.profile,
 team_name='Bilgisayar '||(t.team_index-1)::text||' · '||s.label
 from shuffled s where t.room_id=new_room and t.team_index>1 and t.user_id is null and s.slot=t.team_index-1;
 return room_data||jsonb_build_object('opponent_mode','computer','bot_count',p_team_count-1);
end $function$
;
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
create or replace function public.scout_draft_complete_bot_lineups()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare bot record; lineup record;
begin
 if new.status<>'finished' or old.status='finished' or new.opponent_mode<>'computer' or not new.lineup_required then return new;end if;
 for bot in select id,bot_profile from public.scout_draft_teams where room_id=new.id and is_bot=true loop
 select * into lineup from private.scout_draft_best_bot_lineup(new.id,bot.id,new.model_run_id,bot.bot_profile);
 if not found or cardinality(lineup.starters)<>11 or cardinality(lineup.bench)<>4 then raise exception 'BOT_LINEUP_INCOMPLETE';end if;
 insert into public.scout_draft_lineups(room_id,team_id,gameweek,formation,captain_player_id,manager_card,starters,bench,ready)
 values(new.id,bot.id,new.gameweek,lineup.formation,lineup.captain,lineup.manager_card,lineup.starters,lineup.bench,true)
 on conflict(room_id,team_id,gameweek) do nothing;
 end loop;
 return new;
end $$;
do $$
declare failures integer;
begin
 select count(*) into failures from public.scout_draft_lineups l join public.scout_draft_teams t on t.id=l.team_id join public.scout_draft_rooms rm on rm.id=l.room_id
 left join lateral private.scout_draft_best_bot_lineup(l.room_id,l.team_id,rm.model_run_id,'balanced') opt on true
 where t.is_bot and (opt.formation is null or cardinality(opt.starters)<>11 or cardinality(opt.bench)<>4 or not opt.captain=any(opt.starters)
 or cardinality(array(select distinct x from unnest(opt.starters||opt.bench) x))<>15);
 if failures>0 then raise exception 'BOT_OPTIMIZER_VALIDATION_FAILED: %',failures;end if;
end $$;
