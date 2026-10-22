-- Draft tournaments are single-matchweek competitions with a final, frozen XI.
-- Keep older rooms exactly as before (including historical score views).
-- No new games are scheduled and no current model/lifecycle data is mutated.
-- Backfill only on FIRST application; a retry must not turn any new
-- one-week tournaments back into legacy multiweek rooms.
do $once$
begin
 if not exists (
   select 1 from information_schema.columns
   where table_schema='public' and table_name='scout_draft_rooms'
     and column_name='single_week_only'
 ) then
   alter table public.scout_draft_rooms
    add column if not exists single_week_only boolean not null default true;
   -- Existing rooms predate the one-week contract: preserve their old reports.
   update public.scout_draft_rooms set single_week_only=false;
 end if;
end $once$;

-- Member-only room state: project fixed matchweek and post-ready mode.
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
 'team_name',t.team_name,'occupied',t.user_id is not null or t.is_bot, 'is_bot',t.is_bot,'mine',t.user_id=auth.uid(),
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
 'run_id',rm.model_run_id,'mode',rm.mode,'opponent_mode',rm.opponent_mode,'single_week_only',rm.single_week_only,'draft_kind',rm.draft_kind,'team_count',rm.team_count,
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
-- Member-only readiness state: before all ready share ONLY names/flags;
-- once all ready, expose finalized XI/bench/captain/card for every participant.
create or replace function public.scout_draft_lineup_state(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 rm public.scout_draft_rooms%rowtype; mine public.scout_draft_teams%rowtype;
 chosen_week int;deadline timestamptz;members jsonb;my_lineup jsonb; all_ready boolean;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 select * into rm from public.scout_draft_rooms where id=p_room_id;
 if not found then raise exception 'ROOM_NOT_FOUND';end if;
 select * into mine from public.scout_draft_teams where room_id=rm.id and user_id=auth.uid();
 if not found then raise exception 'ROOM_ACCESS_DENIED';end if;
 if rm.status<>'finished' then raise exception 'DRAFT_NOT_FINISHED';end if;
 if rm.single_week_only then
   chosen_week:=rm.gameweek;
 else
   select greatest(rm.gameweek,coalesce((select max(gameweek) from public.scout_model_runs
   where is_current=true and status='ready'),rm.gameweek)) into chosen_week;
 end if;
 select deadline_at into deadline from public.scout_gameweeks where gameweek=chosen_week;
 select coalesce(jsonb_agg(jsonb_build_object(
 'team_id',t.id,'name',t.team_name,'mine',t.id=mine.id,'is_bot',t.is_bot,
 'ready',coalesce(l.ready,false),
 'formation',case when rm.league_active_at is not null then l.formation else null end,
 'starters',case when rm.league_active_at is not null then l.starters else null end,
 'bench',case when rm.league_active_at is not null then l.bench else null end,
 'captain',case when rm.league_active_at is not null then l.captain_player_id else null end,
 'card',case when rm.league_active_at is not null then l.manager_card else null end
 ) order by t.draft_order),'[]'::jsonb) into members
 from public.scout_draft_teams t
 left join public.scout_draft_lineups l
 on l.room_id=rm.id and l.team_id=t.id and l.gameweek=chosen_week
 where t.room_id=rm.id;
 select jsonb_build_object('starters',l.starters,'bench',l.bench,
   'captain',l.captain_player_id,
   'card',case when l.gameweek=chosen_week then l.manager_card else 'none' end,
   'ready',case when l.gameweek=chosen_week then l.ready else false end,
   'saved_at',l.saved_at,'formation',l.formation,'based_on_gameweek',l.gameweek)
 into my_lineup
 from public.scout_draft_lineups l
 where l.room_id=rm.id and l.team_id=mine.id and l.gameweek<=chosen_week
 order by l.gameweek desc limit 1;
 select count(*)=count(*) filter(where l.ready is true) into all_ready
 from public.scout_draft_teams t
 left join public.scout_draft_lineups l on l.room_id=rm.id and l.team_id=t.id
 and l.gameweek=chosen_week where t.room_id=rm.id;
 return jsonb_build_object(
 'room_id',rm.id,'gameweek',chosen_week,'draft_gameweek',rm.gameweek,
 'deadline_at',deadline,
 'can_edit',deadline is not null and clock_timestamp()<deadline
    and (not rm.single_week_only or rm.league_active_at is null),
 'single_week_only',rm.single_week_only,
 'lineup_required',rm.lineup_required,
 'league_active',not rm.lineup_required or rm.league_active_at is not null,
 'league_active_at',rm.league_active_at,
 'all_ready',all_ready,'teams',members,'my',my_lineup);
end $$;
-- Atomic lineup save: no editing after the entire one-week league activates.
create or replace function public.scout_draft_save_lineup(
 p_room_id uuid,p_gameweek integer,p_starters integer[],p_bench integer[],
 p_captain integer,p_manager_card text default 'none',p_ready boolean default true
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 rm public.scout_draft_rooms%rowtype; tm public.scout_draft_teams%rowtype;
 all_ids integer[];gk integer;df integer;md integer;fw integer;formation text;
 deadline timestamptz;current_week integer;is_all_ready boolean;old_card text;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select * into rm from public.scout_draft_rooms where id=p_room_id for update;
 if not found then raise exception 'ROOM_NOT_FOUND';end if;
 select * into tm from public.scout_draft_teams where room_id=rm.id and user_id=auth.uid();
 if not found then raise exception 'ROOM_ACCESS_DENIED';end if;
 if rm.status<>'finished' or not rm.lineup_required then raise exception 'DRAFT_NOT_FINISHED';end if;
 if rm.single_week_only and rm.league_active_at is not null then raise exception 'LEAGUE_LINEUPS_LOCKED';end if;
 if rm.single_week_only then
   current_week:=rm.gameweek;
 else
   select greatest(rm.gameweek,coalesce((select max(gameweek) from public.scout_model_runs
   where is_current=true and status='ready'),rm.gameweek)) into current_week;
 end if;
 if p_gameweek is distinct from current_week or p_gameweek>34 then raise exception 'INVALID_GAMEWEEK';end if;
 select deadline_at into deadline from public.scout_gameweeks where gameweek=p_gameweek;
 if deadline is null or clock_timestamp()>=deadline then raise exception 'LINEUP_LOCKED';end if;
 if cardinality(p_starters)<>11 or cardinality(p_bench)<>4 then raise exception 'INVALID_LINEUP_SIZE';end if;
 all_ids:=p_starters||p_bench;
 if (select count(distinct x) from unnest(all_ids) x)<>15 then raise exception 'DUPLICATE_PLAYER';end if;
 if (select count(*) from public.scout_draft_picks
  where room_id=rm.id and team_id=tm.id and player_id=any(all_ids))<>15
 then raise exception 'INVALID_LINEUP_PLAYERS';end if;
 if not (p_captain=any(p_starters)) then raise exception 'INVALID_CAPTAIN';end if;
 if p_manager_card is null or p_manager_card not in ('none','triple_captain','quad_captain','bench_boost')
 then raise exception 'INVALID_MANAGER_CARD';end if;
 if not exists(select 1 from public.scout_players where id=p_bench[1] and position='GK')
 then raise exception 'BENCH_KEEPER_REQUIRED';end if;
 select count(*) filter(where sp.position='GK'),count(*) filter(where sp.position='DEF'),
 count(*) filter(where sp.position='MID'),count(*) filter(where sp.position='FWD')
 into gk,df,md,fw from public.scout_players sp where sp.id=any(p_starters);
 formation:=df::text||'-'||md::text||'-'||fw::text;
 if gk<>1 or not exists(
   select 1 from public.scout_game_rules g,
     jsonb_array_elements_text(g.rules->'formations') fm(value)
   where g.season=(select max(season) from public.scout_game_rules)
     and fm.value=formation
 ) then raise exception 'INVALID_FORMATION';end if;
 select manager_card into old_card from public.scout_draft_lineups
 where room_id=rm.id and team_id=tm.id and gameweek=p_gameweek;
 if p_manager_card<>'none' and exists(
   select 1 from public.scout_draft_lineups l where l.room_id=rm.id and l.team_id=tm.id
   and l.gameweek<>p_gameweek and l.manager_card=p_manager_card
 ) then raise exception 'CARD_ALREADY_USED';end if;
 insert into public.scout_draft_lineups(room_id,team_id,gameweek,formation,captain_player_id,manager_card,starters,bench,ready)
 values(rm.id,tm.id,p_gameweek,formation,p_captain,p_manager_card,p_starters,p_bench,coalesce(p_ready,true))
 on conflict(room_id,team_id,gameweek) do update set
 formation=excluded.formation,captain_player_id=excluded.captain_player_id,
 manager_card=excluded.manager_card,starters=excluded.starters,bench=excluded.bench,
 ready=excluded.ready,saved_at=clock_timestamp();
 if rm.league_active_at is null then
  select count(*)=count(*) filter(where l.ready is true) into is_all_ready
  from public.scout_draft_teams t left join public.scout_draft_lineups l
  on l.room_id=rm.id and l.team_id=t.id and l.gameweek=p_gameweek
  where t.room_id=rm.id;
  if is_all_ready then
    update public.scout_draft_rooms set league_active_at=clock_timestamp(),updated_at=clock_timestamp()
    where id=rm.id;
  end if;
 end if;
 return jsonb_build_object('saved',true,'ready',coalesce(p_ready,true),
   'formation',formation,'league_started',coalesce(is_all_ready,false));
end $$;
-- Actual fantasy scoring: all data restricted to draft's frozen model matchweek.
create or replace function public.scout_draft_live_standings(
  p_room_id uuid,
  p_gameweek integer default null
) returns jsonb language plpgsql security definer
set search_path=public,pg_temp as $$
declare
  rm public.scout_draft_rooms%rowtype;
  season_key text;
  max_week integer;
  display_week integer;
  team_data jsonb;
  week_data jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into rm from public.scout_draft_rooms where id=p_room_id;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if not exists (
    select 1 from public.scout_draft_teams
    where room_id=rm.id and user_id=auth.uid()
  ) then raise exception 'ROOM_ACCESS_DENIED'; end if;
  if rm.status<>'finished' then raise exception 'DRAFT_NOT_FINISHED'; end if;
  if rm.lineup_required and rm.league_active_at is null then raise exception 'LEAGUE_NOT_READY';end if;

  -- Match status records identify the season. Points themselves have no season field.
  select coalesce((
    select season from public.scout_match_history
    where gameweek=rm.gameweek and season is not null
    order by kickoff_at limit 1
  ), '2026-27') into season_key;

  select greatest(
    rm.gameweek,
    coalesce((select max(gameweek) from public.scout_model_runs
      where is_current=true and status='ready'),rm.gameweek),
    coalesce((select max(gameweek) from public.scout_match_history
      where season=season_key and match_status<>'Fikstür'),rm.gameweek)
  ) into max_week;
  -- Single-matchweek draft tournaments remain tied to their original frozen model.
  -- Archived older rooms retain their legacy multiweek viewing behavior.
  if rm.single_week_only then max_week:=rm.gameweek;end if;
  max_week:=least(max_week,34);
  display_week:=coalesce(p_gameweek,max_week);
  if display_week<rm.gameweek or display_week>max_week then
    raise exception 'INVALID_GAMEWEEK';
  end if;

  with week_closure as (
    select mh.gameweek,
      count(*)::integer as match_count,
      count(*) filter (where mh.match_status='Bitti' and mh.fantasy_closure='KAPANDI')::integer as verified_matches,
      bool_and(mh.match_status='Bitti' and mh.fantasy_closure='KAPANDI') as all_closed
    from public.scout_match_history mh
    where mh.season=season_key and mh.gameweek between rm.gameweek and max_week
    group by mh.gameweek
  ),
  -- Only source rows with is_final=true AND verified match closure are counted.
  -- A source row without match_id can count only once the entire week is closed.
  verified as (
    select pk.team_id, pk.player_id, pts.gameweek, pts.points,pts.minutes,
      pts.source_updated_at,pts.match_id
    from public.scout_draft_picks pk
    join public.scout_player_weekly_points pts on pts.player_id=pk.player_id
    left join public.scout_match_history match_record
      on match_record.match_id=pts.match_id and match_record.gameweek=pts.gameweek
      and match_record.season=season_key
    left join week_closure wc on wc.gameweek=pts.gameweek
    where pk.room_id=rm.id
      and pts.gameweek between rm.gameweek and max_week
      and pts.is_final is true and pts.points is not null
      and (
        (match_record.match_id is not null
          and match_record.match_status='Bitti'
          and match_record.fantasy_closure='KAPANDI')
        or (pts.match_id is null and wc.all_closed is true)
      )
  ),
  lineup_verified as (
    select v.*,l.starters,l.bench,l.captain_player_id,
      case when l.gameweek=v.gameweek then l.manager_card else 'none' end as card
    from verified v left join lateral (
      select line.gameweek,line.starters,line.bench,line.captain_player_id,line.manager_card
      from public.scout_draft_lineups line
      where line.room_id=rm.id and line.team_id=v.team_id and line.gameweek<=v.gameweek
        and line.ready is true
      order by line.gameweek desc limit 1
    ) l on true
  ),
  absent as (
    select v.team_id,v.gameweek,sp.position,
      row_number() over(partition by v.team_id,v.gameweek,sp.position
                        order by array_position(v.starters,v.player_id)) as slot
    from lineup_verified v join public.scout_players sp on sp.id=v.player_id
    where v.starters is not null and v.player_id=any(v.starters)
      and coalesce(v.minutes,-1)=0
  ),
  available_bench as (
    select v.team_id,v.gameweek,v.player_id,sp.position,
      row_number() over(partition by v.team_id,v.gameweek,sp.position
                        order by array_position(v.bench,v.player_id)) as slot
    from lineup_verified v join public.scout_players sp on sp.id=v.player_id
    where v.bench is not null and v.player_id=any(v.bench)
      and coalesce(v.minutes,0)>0 and v.card<>'bench_boost'
  ),
  auto_subs as (
    select b.team_id,b.gameweek,b.player_id from available_bench b
    join absent a on a.team_id=b.team_id and a.gameweek=b.gameweek
      and a.position=b.position and a.slot=b.slot
  ),
  scored as (
    select v.*,(
      case
        when not rm.lineup_required then v.points
        when v.starters is null then 0
        when v.player_id=any(v.starters) then v.points
        when v.card='bench_boost' and v.player_id=any(v.bench) then v.points
        when exists(select 1 from auto_subs s where s.team_id=v.team_id
          and s.gameweek=v.gameweek and s.player_id=v.player_id) then v.points
        else 0
      end
      +case when rm.lineup_required and v.starters is not null
        and v.player_id=v.captain_player_id and v.player_id=any(v.starters)
        then v.points*(case v.card when 'triple_captain' then 2
                                    when 'quad_captain' then 3 else 1 end)
        else 0 end
    )::integer as scored_points,
    (not rm.lineup_required or v.player_id=any(v.starters)
      or (v.card='bench_boost' and v.player_id=any(v.bench))
      or exists(select 1 from auto_subs s where s.team_id=v.team_id
        and s.gameweek=v.gameweek and s.player_id=v.player_id)) as credited,
    exists(select 1 from auto_subs s where s.team_id=v.team_id
      and s.gameweek=v.gameweek and s.player_id=v.player_id) as auto_sub
    from lineup_verified v
  ),
  team_totals as (
    select team_id,sum(scored_points)::integer as total_points,
      max(source_updated_at) as updated_at from scored group by team_id
  ),
  selected_week_totals as (
    select team_id,sum(scored_points)::integer as week_points,
      count(*)::integer as verified_players
    from scored where gameweek=display_week group by team_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'team_id',t.id,'team_name',t.team_name,'draft_order',t.draft_order,
      'mine',t.user_id=auth.uid(),
      'total_points',coalesce(tt.total_points,0),
      'week_points',coalesce(wt.week_points,0),
      'verified_players',coalesce(wt.verified_players,0),
      'player_count',(select count(*) from public.scout_draft_picks p
        where p.team_id=t.id and p.room_id=rm.id),
      'updated_at',tt.updated_at,
      'weekly',(
        select coalesce(jsonb_agg(jsonb_build_object(
          'gameweek',w.gameweek,
          'points',coalesce((select sum(v.scored_points) from scored v
            where v.team_id=t.id and v.gameweek=w.gameweek),0),
          'verified_players',(select count(*) from scored v
            where v.team_id=t.id and v.gameweek=w.gameweek)
        ) order by w.gameweek),'[]'::jsonb)
        from generate_series(rm.gameweek,max_week) as w(gameweek)
      ),
      'players',(
        select coalesce(jsonb_agg(jsonb_build_object(
          'player_id',sp.id,'name',sp.full_name,'position',sp.position,
          'pick_number',pk.pick_number,'price',pk.price,
          'points',v.points,'counted_points',v.scored_points,
           'is_starter',coalesce(pk.player_id=any(v.starters),false),
           'is_bench',coalesce(pk.player_id=any(v.bench),false),
           'is_captain',coalesce(pk.player_id=v.captain_player_id,false),
           'auto_sub',coalesce(v.auto_sub,false),
           'credited',coalesce(v.credited,false),
          'base_points',wp.base_points,'bonus_points',wp.bonus_points,
          'minutes',case when v.player_id is not null then wp.minutes else null end,
          'status',case
            when v.player_id is not null then 'verified'
            when fm.match_id is null then 'no_fixture'
            when fm.match_status='Bitti' and fm.fantasy_closure='KAPANDI' then 'awaiting_points'
            when fm.match_status='Bitti' then 'verifying'
            when fm.match_status='Fikstür' then 'scheduled'
            else 'in_progress'
          end,
          'match',case when fm.match_id is null then null else jsonb_build_object(
            'home',fm.home_team_name,'away',fm.away_team_name,
            'home_goals',fm.home_goals,'away_goals',fm.away_goals,
            'kickoff_at',fm.kickoff_at,'status',fm.match_status,
            'fantasy_closure',fm.fantasy_closure
          ) end
        ) order by pk.pick_number),'[]'::jsonb)
        from public.scout_draft_picks pk
        join public.scout_players sp on sp.id=pk.player_id
        left join scored v on v.team_id=pk.team_id and v.player_id=pk.player_id
          and v.gameweek=display_week
        left join public.scout_player_weekly_points wp on wp.player_id=pk.player_id
          and wp.gameweek=display_week and v.player_id is not null
        left join lateral (
          select m.match_id,m.home_team_name,m.away_team_name,m.home_goals,
            m.away_goals,m.kickoff_at,m.match_status,m.fantasy_closure
          from public.scout_match_history m
          where m.season=season_key and m.gameweek=display_week
            and (m.home_team_id=sp.team_id or m.away_team_id=sp.team_id)
          order by m.kickoff_at desc limit 1
        ) fm on true
        where pk.room_id=rm.id and pk.team_id=t.id
      )
    ) order by coalesce(tt.total_points,0) desc,
          coalesce(wt.week_points,0) desc,t.draft_order),'[]'::jsonb)
  into team_data
  from public.scout_draft_teams t
  left join team_totals tt on tt.team_id=t.id
  left join selected_week_totals wt on wt.team_id=t.id
  where t.room_id=rm.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'gameweek',w.gameweek,
    'matches',coalesce((select count(*) from public.scout_match_history mh
      where mh.season=season_key and mh.gameweek=w.gameweek),0),
    'verified_matches',coalesce((select count(*) from public.scout_match_history mh
      where mh.season=season_key and mh.gameweek=w.gameweek
        and mh.match_status='Bitti' and mh.fantasy_closure='KAPANDI'),0)
  ) order by w.gameweek),'[]'::jsonb)
  into week_data
  from generate_series(rm.gameweek,max_week) as w(gameweek);

  return jsonb_build_object(
    'room_id',rm.id,'draft_gameweek',rm.gameweek,
    'selected_gameweek',display_week,'latest_gameweek',max_week,
    'season',season_key,'single_week_only',rm.single_week_only,
    'scoring_rule',case when rm.lineup_required then 'lineup_xi_captain_cards' else 'all_15_players' end,
    'only_verified_scores',true,
    'updated_at',clock_timestamp(),
    'weeks',week_data,'teams',team_data
  );
end $$;
