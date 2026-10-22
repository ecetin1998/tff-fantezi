-- Add the frozen room's actual gameweek fixture to public-grade draft player cards.
-- Read-only data; all user authorization and model/projection fields stay unchanged.
create or replace function public.scout_draft_pool(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_run uuid;v_week integer;v_players jsonb;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 if not exists(select 1 from public.scout_draft_teams
  where room_id=p_room_id and user_id=auth.uid())
 then raise exception 'ROOM_ACCESS_DENIED';end if;
 select model_run_id,gameweek into v_run,v_week
 from public.scout_draft_rooms where id=p_room_id;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',sp.id,'name',sp.full_name,'team',st.name,'position',sp.position,
  'role',sp.primary_role,'xfp',pr.xfp,'core_xfp',pr.core_xfp,'x_bonus',pr.x_bonus,
  'x_minutes',pr.x_minutes,'xi_probability',pr.xi_probability,
  'availability_probability',pr.availability_probability,
  'availability_type',av.availability_type,
  'opponent',pr.opponent_name,
  -- Explicit fixture fields are sourced from the room's week, not the
  -- current/latest site run. They are null if no official fixture is known.
  'fixture_opponent',fixture.opponent_name,
  'fixture_venue',fixture.venue,
  'price',sp.price,'value_score',pr.value_score,'total_points',ss.actual_points
 ) order by pr.xfp desc),'[]'::jsonb) into v_players
 from public.scout_player_projections pr
 join public.scout_players sp on sp.id=pr.player_id
 join public.scout_teams st on st.id=sp.team_id
 left join public.scout_availability av
  on av.run_id=pr.run_id and av.player_id=pr.player_id
 left join lateral (
   select actual_points from public.scout_player_season_stats
   where player_id=sp.id and through_gameweek<v_week
   order by season desc,through_gameweek desc,updated_at desc limit 1
 ) ss on true
 left join lateral (
   select
    case when mh.home_team_id=sp.team_id then mh.away_team_name
         else mh.home_team_name end as opponent_name,
    case when mh.home_team_id=sp.team_id then 'Ev'
         else 'Dep' end as venue
   from public.scout_match_history mh
   where mh.gameweek=v_week
     and (mh.home_team_id=sp.team_id or mh.away_team_id=sp.team_id)
   -- In case two seasons contain the same round, prefer the latest fixture.
   order by mh.kickoff_at desc,mh.match_id desc limit 1
 ) fixture on true
 where pr.run_id=v_run and sp.active=true and pr.xfp is not null;
 return v_players;
end $$;
revoke all on function public.scout_draft_pool(uuid) from public,anon;
grant execute on function public.scout_draft_pool(uuid) to authenticated;
