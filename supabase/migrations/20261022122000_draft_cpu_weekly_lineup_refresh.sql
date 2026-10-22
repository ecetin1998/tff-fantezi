-- On every new gameweek, bot opponents independently build a new best-XI.
-- Historical confirmed lineups remain immutable, and human squads are untouched.
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
 select greatest(rm.gameweek,coalesce((select max(gameweek) from public.scout_model_runs
 where is_current=true and status='ready'),rm.gameweek)) into chosen_week;
 select deadline_at into deadline from public.scout_gameweeks where gameweek=chosen_week;
 if rm.opponent_mode='computer' then
  perform private.scout_draft_prepare_cpu_lineups(rm.id,chosen_week);
 end if;
 select coalesce(jsonb_agg(jsonb_build_object(
 'team_id',t.id,'name',t.team_name,'mine',t.id=mine.id,
 'ready',coalesce(l.ready,false),'formation',case when rm.league_active_at is not null then l.formation else null end
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
 'deadline_at',deadline,'can_edit',deadline is not null and clock_timestamp()<deadline,
 'lineup_required',rm.lineup_required,
 'league_active',not rm.lineup_required or rm.league_active_at is not null,
 'league_active_at',rm.league_active_at,
 'all_ready',all_ready,'teams',members,'my',my_lineup);
end $$;
