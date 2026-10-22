-- Draft Arena: server-driven CPU picks and managed weekly XI/captain/cards.
-- All CPU choices use frozen public xFP from the room's run; never access Pro-only overlay.
create or replace function private.scout_draft_cpu_candidate(
 p_room_id uuid,p_team_id uuid,p_run_id uuid,p_difficulty text
) returns integer language sql stable security definer set search_path=public,pg_temp as $$
  with own as (
    select count(*)::int as players from public.scout_draft_picks p
    where p.room_id=p_room_id and p.team_id=p_team_id
  )
  select sp.id from public.scout_player_projections pr
  join public.scout_players sp on sp.id=pr.player_id
  cross join own
  where pr.run_id=p_run_id and sp.active and sp.position in ('GK','DEF','MID','FWD')
    and pr.xfp is not null and coalesce(pr.availability_probability,1)>0
    and not exists(select 1 from public.scout_draft_picks other
      where other.room_id=p_room_id and other.player_id=sp.id)
    and (select count(*) from public.scout_draft_picks mine
      join public.scout_players selected on selected.id=mine.player_id
      where mine.room_id=p_room_id and mine.team_id=p_team_id
      and selected.position=sp.position)
      <case sp.position when 'GK' then 2 when 'DEF' then 5
                             when 'MID' then 5 else 3 end
  order by (
     greatest(0,pr.xfp)*(
       case p_difficulty when 'hard' then .68 else .81 end
       +case p_difficulty when 'hard' then .32 else .19 end
        *greatest(0,least(1,coalesce(pr.xi_probability,.7))))
     +greatest(0,least(90,coalesce(pr.x_minutes,50)))/90.0
        *(case p_difficulty when 'hard' then .50 else .23 end)
     +case sp.position when 'FWD' then .28 when 'MID' then .13
        when 'DEF' then .04 else -.20 end
     -case when coalesce(pr.availability_probability,1)<.6
        then case p_difficulty when 'hard' then 1.8 else .8 end else 0 end
     -- Avoid stacking too many assets from the same team without imposing an
     -- unfamiliar hard club cap on only the computer.
     -.35*(select count(*) from public.scout_draft_picks mine
       join public.scout_players ownsp on ownsp.id=mine.player_id
       where mine.room_id=p_room_id and mine.team_id=p_team_id
         and ownsp.team_id=sp.team_id)
     +case when own.players>=9 and sp.position='GK' and
       (select count(*) from public.scout_draft_picks mine
          join public.scout_players selected on selected.id=mine.player_id
          where mine.room_id=p_room_id and mine.team_id=p_team_id
            and selected.position='GK')=0 then 2.1 else 0 end
     +get_byte(decode(substr(md5(p_room_id::text||p_team_id::text||sp.id::text),1,2),'hex'),0)/255.0
       *(case p_difficulty when 'easy' then 2.5
          when 'hard' then .15 else .65 end)
   ) desc,sp.id
  limit 1;
$$;
revoke all on function private.scout_draft_cpu_candidate(uuid,uuid,uuid,text)
 from public,anon,authenticated;

create or replace function public.scout_draft_cpu_advance(
 p_room_id uuid,p_max_steps integer default 14
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 rm public.scout_draft_rooms%rowtype;
 team public.scout_draft_teams%rowtype;
 round_num integer;seat integer;player integer;steps integer:=0;
 max_steps integer:=least(greatest(coalesce(p_max_steps,14),1),16);
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select * into rm from public.scout_draft_rooms where id=p_room_id for update;
 if not found then raise exception 'ROOM_NOT_FOUND';end if;
 if not exists(select 1 from public.scout_draft_teams
     where room_id=p_room_id and user_id=auth.uid() and is_bot=false)
 then raise exception 'ROOM_ACCESS_DENIED';end if;
 if rm.opponent_mode<>'computer' then raise exception 'NOT_COMPUTER_ROOM';end if;
 if rm.status<>'drafting' or rm.draft_kind<>'classic'
 then return jsonb_build_object('advanced',false,'status',rm.status);end if;
 for i in 1..max_steps loop
   if rm.next_pick>rm.team_count*15 then exit;end if;
   round_num:=((rm.next_pick-1)/rm.team_count)+1;
   seat:=mod(rm.next_pick-1,rm.team_count)+1;
   if rm.mode='snake' and mod(round_num,2)=0 then seat:=rm.team_count+1-seat;end if;
   select * into team from public.scout_draft_teams
   where room_id=rm.id and draft_order=seat;
   if not found or not team.is_bot then exit;end if;
   player:=private.scout_draft_cpu_candidate(rm.id,team.id,rm.model_run_id,rm.bot_difficulty);
   if player is null then
     raise exception 'CPU_NO_ELIGIBLE_PLAYER';
   end if;
   insert into public.scout_draft_picks(room_id,team_id,player_id,pick_number,auto_selected)
   values(rm.id,team.id,player,rm.next_pick,true);
   steps:=steps+1;
   update public.scout_draft_rooms set
     next_pick=rm.next_pick+1,
     turn_started_at=case when rm.next_pick=rm.team_count*15
       then null else clock_timestamp() end,
     status=case when rm.next_pick=rm.team_count*15
       then 'finished' else 'drafting' end,
     updated_at=clock_timestamp()
   where id=rm.id;
   rm.next_pick:=rm.next_pick+1;
   if rm.next_pick>rm.team_count*15 then exit;end if;
 end loop;
 return jsonb_build_object('advanced',steps>0,'steps',steps,
    'next_pick',rm.next_pick,
    'status',case when rm.next_pick>rm.team_count*15 then 'finished'
                   else 'drafting' end);
end $$;
revoke all on function public.scout_draft_cpu_advance(uuid,integer) from public,anon;
grant execute on function public.scout_draft_cpu_advance(uuid,integer) to authenticated;

-- Automatically maintain CPU XI + 4 bench + captain for each active week,
-- using that week's current projections where possible, falling back to
-- the immutable draft projections. Never changes the 15 drafted players.
create or replace function private.scout_draft_prepare_cpu_lineups(
 p_room_id uuid,p_gameweek integer
) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare
 rm public.scout_draft_rooms%rowtype;
 current_run uuid;
 tm public.scout_draft_teams%rowtype;
 form text;d integer;m integer;f integer;
 candidate integer[];best integer[];bench integer[];best_value numeric;
 val numeric;captain integer;captain_xfp numeric;bench_xfp numeric;
 selected_card text;created_count integer:=0;
begin
 select * into rm from public.scout_draft_rooms where id=p_room_id;
 if not found or rm.status<>'finished' or rm.opponent_mode<>'computer'
   or p_gameweek is null or p_gameweek not between rm.gameweek and 34
 then return 0;end if;
 select id into current_run from public.scout_model_runs
 where is_current and status='ready' and gameweek=p_gameweek
 order by generated_at desc limit 1;
 current_run:=coalesce(current_run,rm.model_run_id);
 for tm in select * from public.scout_draft_teams
    where room_id=rm.id and is_bot
    order by draft_order loop
   if exists(select 1 from public.scout_draft_lineups
      where room_id=rm.id and team_id=tm.id and gameweek=p_gameweek)
   then continue;end if;
   if (select count(*) from public.scout_draft_picks
       where room_id=rm.id and team_id=tm.id)<>15 then continue;end if;
   best_value:=null;
   best:=null;
   for form in select jsonb_array_elements_text(rules->'formations')
     from public.scout_game_rules where season=(select max(season) from public.scout_game_rules)
   loop
     d:=split_part(form,'-',1)::integer;
     m:=split_part(form,'-',2)::integer;
     f:=split_part(form,'-',3)::integer;
     with ranked as (
       select sp.id,sp.position,
        coalesce(cur.xfp,orig.xfp,0) score,
        row_number() over(partition by sp.position
          order by coalesce(cur.xfp,orig.xfp,0) desc,sp.id) n
       from public.scout_draft_picks pick
       join public.scout_players sp on sp.id=pick.player_id
       left join public.scout_player_projections cur
        on cur.run_id=current_run and cur.player_id=sp.id
       left join public.scout_player_projections orig
        on orig.run_id=rm.model_run_id and orig.player_id=sp.id
       where pick.room_id=rm.id and pick.team_id=tm.id
     )
     select array_agg(id order by position,n),sum(score)
     into candidate,val
     from ranked
     where n<=case position when 'GK' then 1
       when 'DEF' then d when 'MID' then m else f end;
     if cardinality(candidate)=11 and (best_value is null or val>best_value) then
       best:=candidate;best_value:=val;
     end if;
   end loop;
   if cardinality(best)<>11 then continue;end if;
   select array_agg(sp.id order by case sp.position when 'GK' then 0 else 1 end,
                     coalesce(cur.xfp,orig.xfp,0) desc,sp.id)
   into bench
   from public.scout_draft_picks pick
   join public.scout_players sp on sp.id=pick.player_id
   left join public.scout_player_projections cur
     on cur.run_id=current_run and cur.player_id=sp.id
   left join public.scout_player_projections orig
     on orig.run_id=rm.model_run_id and orig.player_id=sp.id
   where pick.room_id=rm.id and pick.team_id=tm.id and not (sp.id=any(best));
   if cardinality(bench)<>4 then continue;end if;
   select sp.id,coalesce(cur.xfp,orig.xfp,0)
   into captain,captain_xfp
   from public.scout_players sp
   left join public.scout_player_projections cur
      on cur.run_id=current_run and cur.player_id=sp.id
   left join public.scout_player_projections orig
      on orig.run_id=rm.model_run_id and orig.player_id=sp.id
   where sp.id=any(best) and sp.position<>'GK'
   order by coalesce(cur.xfp,orig.xfp,0) desc,sp.id limit 1;
   if captain is null then continue;end if;
   selected_card:='none';
   if rm.bot_difficulty<>'easy' and p_gameweek>rm.gameweek then
     select coalesce(sum(coalesce(cur.xfp,orig.xfp,0)),0) into bench_xfp
     from public.scout_players sp
     left join public.scout_player_projections cur
       on cur.run_id=current_run and cur.player_id=sp.id
     left join public.scout_player_projections orig
       on orig.run_id=rm.model_run_id and orig.player_id=sp.id
     where sp.id=any(bench);
     if bench_xfp>=14 and not exists(select 1 from public.scout_draft_lineups
       where room_id=rm.id and team_id=tm.id and manager_card='bench_boost')
     then selected_card:='bench_boost';
     elsif captain_xfp>=8.5 and not exists(select 1 from public.scout_draft_lineups
       where room_id=rm.id and team_id=tm.id and manager_card='quad_captain')
     then selected_card:='quad_captain';
     elsif captain_xfp>=7 and not exists(select 1 from public.scout_draft_lineups
       where room_id=rm.id and team_id=tm.id and manager_card='triple_captain')
     then selected_card:='triple_captain';
     end if;
   end if;
   insert into public.scout_draft_lineups(
     room_id,team_id,gameweek,formation,captain_player_id,manager_card,
     starters,bench,ready)
   values(rm.id,tm.id,p_gameweek,
     (select count(*) from public.scout_players
       where id=any(best) and position='DEF')::text||'-'||
     (select count(*) from public.scout_players
       where id=any(best) and position='MID')::text||'-'||
     (select count(*) from public.scout_players
       where id=any(best) and position='FWD')::text,
      captain,selected_card,best,bench,true)
   on conflict(room_id,team_id,gameweek) do nothing;
   created_count:=created_count+1;
 end loop;
 return created_count;
end $$;
revoke all on function private.scout_draft_prepare_cpu_lineups(uuid,integer)
 from public,anon,authenticated;

create or replace function private.scout_draft_cpu_lineups_on_finish()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare current_week integer;
begin
 if new.opponent_mode='computer' then
   select greatest(new.gameweek,coalesce((
     select max(gameweek) from public.scout_model_runs
     where is_current and status='ready'),new.gameweek))
   into current_week;
   perform private.scout_draft_prepare_cpu_lineups(new.id,current_week);
 end if;
 return new;
end $$;
drop trigger if exists scout_draft_cpu_lineups_finished on public.scout_draft_rooms;
create trigger scout_draft_cpu_lineups_finished
after update of status on public.scout_draft_rooms
for each row when (new.status='finished' and old.status is distinct from 'finished')
execute function private.scout_draft_cpu_lineups_on_finish();
revoke all on function private.scout_draft_cpu_lineups_on_finish()
 from public,anon,authenticated;
