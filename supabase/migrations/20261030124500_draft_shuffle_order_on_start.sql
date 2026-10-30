-- A room's seat/join index is not its draft pick order.
-- Draw the actual order once, atomically, when a fully occupied lobby starts.
-- Both classic (Snake/Normal) and auction turn logic already use draft_order.
-- Historical/in-progress rooms are untouched.
create or replace function public.scout_draft_start(p_room_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp
as $draft_start$
declare rm public.scout_draft_rooms%rowtype;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select * into rm from public.scout_draft_rooms where id=p_room_id for update;
 if not found or rm.host_user_id<>auth.uid() then raise exception 'HOST_ONLY';end if;
 if rm.status<>'lobby' then raise exception 'DRAFT_ALREADY_STARTED';end if;
 if (select count(*) from public.scout_draft_teams
     where room_id=rm.id and (user_id is not null or is_bot))<>rm.team_count
 then raise exception 'WAIT_FOR_ALL_PLAYERS';end if;

 -- Unique (room_id,draft_order) is DEFERRABLE INITIALLY DEFERRED.
 -- One set-based shuffle preserves every slot in [1,team_count].
 -- gen_random_uuid gives each participant an independent server-side draw;
 -- team_index only breaks the astronomically unlikely UUID tie.
 with shuffled as (
   select t.id,
      row_number() over (order by gen_random_uuid(),t.team_index)::integer as new_order
   from public.scout_draft_teams t
   where t.room_id=rm.id
 )
 update public.scout_draft_teams t
 set draft_order=s.new_order
 from shuffled s
 where t.id=s.id and t.room_id=rm.id;

 update public.scout_draft_rooms
 set status='drafting',next_pick=1,
     turn_started_at=case when rm.rules_version=2 and rm.draft_kind='classic'
         then clock_timestamp() else null end,
     updated_at=clock_timestamp()
 where id=p_room_id;
end $draft_start$;

revoke all on function public.scout_draft_start(uuid) from public,anon;
grant execute on function public.scout_draft_start(uuid) to authenticated;
