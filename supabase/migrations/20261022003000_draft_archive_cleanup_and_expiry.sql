-- Non-destructive inactive draft-room cleanup. Finished competitions are immutable.
alter table public.scout_draft_rooms drop constraint if exists scout_draft_rooms_status_check;
alter table public.scout_draft_rooms add constraint scout_draft_rooms_status_check
 check(status in ('lobby','drafting','finished','cancelled','expired'));
alter table public.scout_draft_rooms
 add column if not exists last_member_seen_at timestamptz not null default clock_timestamp();
-- Existing rooms get their last real action as baseline (not the deployment time).
update public.scout_draft_rooms set last_member_seen_at=greatest(created_at,updated_at)
 where status in ('lobby','drafting');
create index if not exists scout_draft_expiry_idx on public.scout_draft_rooms(last_member_seen_at)
 where status in ('lobby','drafting');

create or replace function private.scout_draft_expire_inactive()
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
 update public.scout_draft_rooms set status='expired',updated_at=clock_timestamp()
 where status in ('lobby','drafting')
 and last_member_seen_at < clock_timestamp()-interval '24 hours';
 get diagnostics n=row_count;
 return n;
end $$;
revoke all on function private.scout_draft_expire_inactive() from public,anon,authenticated;
select cron.schedule('scout-draft-expire-inactive','*/15 * * * *',
  'select private.scout_draft_expire_inactive()');

create table if not exists public.scout_draft_hidden_rooms(
 user_id uuid not null,room_id uuid not null references public.scout_draft_rooms(id) on delete cascade,
 hidden_at timestamptz not null default clock_timestamp(),primary key(user_id,room_id)
);
alter table public.scout_draft_hidden_rooms enable row level security;
revoke all on public.scout_draft_hidden_rooms from public,anon,authenticated;

create or replace function public.scout_draft_hide_room(p_room_id uuid,p_hidden boolean default true)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 if not exists(select 1 from public.scout_draft_teams
   where room_id=p_room_id and user_id=auth.uid())
 then raise exception 'ROOM_ACCESS_DENIED';end if;
 if p_hidden then
   insert into public.scout_draft_hidden_rooms(user_id,room_id)
   values(auth.uid(),p_room_id) on conflict(user_id,room_id) do nothing;
 else
   delete from public.scout_draft_hidden_rooms
   where user_id=auth.uid() and room_id=p_room_id;
 end if;
 return jsonb_build_object('hidden',p_hidden,'room_id',p_room_id);
end $$;

create or replace function public.scout_draft_cancel_room(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare rm public.scout_draft_rooms%rowtype;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select * into rm from public.scout_draft_rooms where id=p_room_id for update;
 if not found then raise exception 'ROOM_NOT_FOUND';end if;
 if rm.host_user_id is distinct from auth.uid() then raise exception 'HOST_ONLY';end if;
 if rm.status='finished' then raise exception 'FINISHED_ROOM_PROTECTED';end if;
 if rm.status not in ('lobby','drafting') then
   return jsonb_build_object('room_id',rm.id,'status',rm.status);
 end if;
 update public.scout_draft_rooms set status='cancelled',updated_at=clock_timestamp()
 where id=rm.id;
 return jsonb_build_object('room_id',rm.id,'status','cancelled');
end $$;

-- Server-enforced heartbeat: dead rooms cannot be resurrected by polling.
create or replace function public.scout_draft_heartbeat(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare rm public.scout_draft_rooms%rowtype; t timestamptz:=clock_timestamp();
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select * into rm from public.scout_draft_rooms where id=p_room_id for update;
 if not found then raise exception 'ROOM_NOT_FOUND';end if;
 if not exists(select 1 from public.scout_draft_teams
   where room_id=p_room_id and user_id=auth.uid())
 then raise exception 'ROOM_ACCESS_DENIED';end if;
 if rm.status in ('lobby','drafting') and rm.last_member_seen_at<t-interval '24 hours' then
   update public.scout_draft_rooms set status='expired',updated_at=t where id=rm.id;
   return jsonb_build_object('active',false,'status','expired');
 end if;
 if rm.status not in ('lobby','drafting') then
   return jsonb_build_object('active',false,'status',rm.status);
 end if;
 if rm.last_member_seen_at<t-interval '45 seconds' then
   update public.scout_draft_rooms set last_member_seen_at=t where id=rm.id;
 end if;
 return jsonb_build_object('active',true,'status',rm.status,'expires_at',
   greatest(t,rm.last_member_seen_at)+interval '24 hours');
end $$;

create or replace function public.scout_draft_my_rooms()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',r.id,'code',r.invite_code,'team_name',t.team_name,
   'gameweek',r.gameweek,'status',r.status,'draft_kind',r.draft_kind,
   'mode',r.mode,'team_count',r.team_count,'created_at',r.created_at,
   'completed_at',r.completed_at,'is_host',r.host_user_id=auth.uid(),
 'idle_expires_at',case when r.status in ('lobby','drafting') then r.last_member_seen_at+interval '24 hours' else null end,
   'picked', (select count(*) from public.scout_draft_picks p where p.room_id=r.id)
 ) order by r.created_at desc),'[]'::jsonb) into result
 from public.scout_draft_rooms r
 join public.scout_draft_teams t on t.room_id=r.id and t.user_id=auth.uid()
 where r.status in ('lobby','drafting','finished') and not exists(select 1 from public.scout_draft_hidden_rooms h where h.room_id=r.id and h.user_id=auth.uid());
 return result;
end $$;

create or replace function public.scout_draft_my_hidden_rooms()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',r.id,'code',r.invite_code,'team_name',t.team_name,
   'gameweek',r.gameweek,'status',r.status,'draft_kind',r.draft_kind,
   'mode',r.mode,'team_count',r.team_count,'created_at',r.created_at,
   'completed_at',r.completed_at,'is_host',r.host_user_id=auth.uid(),
 'hidden',true,
   'picked', (select count(*) from public.scout_draft_picks p where p.room_id=r.id)
 ) order by r.created_at desc),'[]'::jsonb) into result
 from public.scout_draft_rooms r
 join public.scout_draft_teams t on t.room_id=r.id and t.user_id=auth.uid()
 join public.scout_draft_hidden_rooms h on h.room_id=r.id and h.user_id=auth.uid();
 return result;
end $$;

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
 'team_name',t.team_name,'occupied',t.user_id is not null,'mine',t.user_id=auth.uid(),
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
 'run_id',rm.model_run_id,'mode',rm.mode,'draft_kind',rm.draft_kind,'team_count',rm.team_count,
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


revoke all on function public.scout_draft_hide_room(uuid,boolean) from public,anon;
revoke all on function public.scout_draft_cancel_room(uuid) from public,anon;
revoke all on function public.scout_draft_heartbeat(uuid) from public,anon;
revoke all on function public.scout_draft_my_hidden_rooms() from public,anon;
grant execute on function public.scout_draft_hide_room(uuid,boolean) to authenticated;
grant execute on function public.scout_draft_cancel_room(uuid) to authenticated;
grant execute on function public.scout_draft_heartbeat(uuid) to authenticated;
grant execute on function public.scout_draft_my_hidden_rooms() to authenticated;
