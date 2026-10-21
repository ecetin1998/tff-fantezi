-- Draft Arena: member-only live standings calculated from verified actual fantasy points.
-- Deliberately read-only: weekly lifecycle remains the single source of truth.
-- A full 15-player drafted squad counts, since Draft Arena does not have a starting-XI selector.
-- Gameweeks accumulate from the draft room's frozen initial gameweek.
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
  -- Limit the active season's view to its 34 gameweeks.
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
    select pk.team_id, pk.player_id, pts.gameweek, pts.points,
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
  team_totals as (
    select team_id, sum(points)::integer as total_points,
      count(*)::integer as scored_player_weeks,
      max(source_updated_at) as updated_at
    from verified group by team_id
  ),
  selected_week_totals as (
    select team_id, sum(points)::integer as week_points,
      count(*)::integer as verified_players
    from verified where gameweek=display_week group by team_id
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
          'points',coalesce((select sum(v.points) from verified v
            where v.team_id=t.id and v.gameweek=w.gameweek),0),
          'verified_players',(select count(*) from verified v
            where v.team_id=t.id and v.gameweek=w.gameweek)
        ) order by w.gameweek),'[]'::jsonb)
        from generate_series(rm.gameweek,max_week) as w(gameweek)
      ),
      'players',(
        select coalesce(jsonb_agg(jsonb_build_object(
          'player_id',sp.id,'name',sp.full_name,'position',sp.position,
          'pick_number',pk.pick_number,'price',pk.price,
          'points',v.points,
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
        left join verified v on v.team_id=pk.team_id and v.player_id=pk.player_id
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
    'season',season_key,'scoring_rule','all_15_players',
    'only_verified_scores',true,
    'updated_at',clock_timestamp(),
    'weeks',week_data,'teams',team_data
  );
end $$;

revoke all on function public.scout_draft_live_standings(uuid,integer) from public,anon;
grant execute on function public.scout_draft_live_standings(uuid,integer) to authenticated;
