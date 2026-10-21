-- Read only public-grade model columns from the run frozen at room creation.
-- A lobby invite can reveal only team names, not user identities or model internals.
create or replace function public.scout_draft_lobby(p_code text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_room public.scout_draft_rooms%rowtype;v_seats jsonb;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select * into v_room from public.scout_draft_rooms where invite_code=upper(btrim(p_code));
 if not found then raise exception 'ROOM_NOT_FOUND';end if;
 select coalesce(jsonb_agg(jsonb_build_object(
 'team_index',team_index,'name',team_name,'occupied',user_id is not null,
 'draft_order',draft_order) order by draft_order),'[]'::jsonb)
 into v_seats from public.scout_draft_teams where room_id=v_room.id;
 return jsonb_build_object('code',v_room.invite_code,'status',v_room.status,
 'gameweek',v_room.gameweek,'mode',v_room.mode,'teams',v_seats);
end $$;

create or replace function public.scout_draft_pool(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_run uuid;v_players jsonb;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 if not exists(select 1 from public.scout_draft_teams where room_id=p_room_id and user_id=auth.uid())
 then raise exception 'ROOM_ACCESS_DENIED';end if;
 select model_run_id into v_run from public.scout_draft_rooms where id=p_room_id;
 select coalesce(jsonb_agg(jsonb_build_object(
 'id',sp.id,'name',sp.full_name,'team',st.name,'position',sp.position,
 'role',sp.primary_role,'xfp',pr.xfp,'core_xfp',pr.core_xfp,'x_bonus',pr.x_bonus,
 'x_minutes',pr.x_minutes,'xi_probability',pr.xi_probability,
 'availability_probability',pr.availability_probability,
 'availability_type',av.availability_type,'opponent',pr.opponent_name
 ) order by pr.xfp desc),'[]'::jsonb) into v_players
 from public.scout_player_projections pr
 join public.scout_players sp on sp.id=pr.player_id
 join public.scout_teams st on st.id=sp.team_id
 left join public.scout_availability av on av.run_id=pr.run_id and av.player_id=pr.player_id
 where pr.run_id=v_run and sp.active=true and pr.xfp is not null;
 return v_players;
end $$;
revoke all on function public.scout_draft_lobby(text) from public,anon;
revoke all on function public.scout_draft_pool(uuid) from public,anon;
grant execute on function public.scout_draft_lobby(text) to authenticated;
grant execute on function public.scout_draft_pool(uuid) to authenticated;
