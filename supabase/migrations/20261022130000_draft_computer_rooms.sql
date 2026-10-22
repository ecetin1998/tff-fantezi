-- Draft Arena opponent type: invitations vs authorized local CPU seats.
-- Default keeps every existing draft and league as a friends room.
alter table public.scout_draft_rooms
 add column if not exists opponent_mode text not null default 'friends'
 check(opponent_mode in ('friends','computer'));
alter table public.scout_draft_teams
 add column if not exists is_bot boolean not null default false;
alter table public.scout_draft_rooms
 add column if not exists last_bot_action_at timestamptz;
-- A bot cannot be owned by a human account.
alter table public.scout_draft_teams
 add constraint scout_draft_bot_has_no_user check(not is_bot or user_id is null);

create or replace function public.scout_draft_create_vs_bot(
 p_team_name text,p_mode text default 'snake',p_team_count integer default 2
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
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
 update public.scout_draft_teams set is_bot=true
 where room_id=new_room and team_index>1 and user_id is null;
 return room_data||jsonb_build_object('opponent_mode','computer','bot_count',p_team_count-1);
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
 'run_id',rm.model_run_id,'mode',rm.mode,'opponent_mode',rm.opponent_mode,'draft_kind',rm.draft_kind,'team_count',rm.team_count,
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

create or replace function public.scout_draft_start(p_room_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare rm public.scout_draft_rooms%rowtype;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select * into rm from public.scout_draft_rooms where id=p_room_id for update;
 if not found or rm.host_user_id<>auth.uid() then raise exception 'HOST_ONLY';end if;
 if rm.status<>'lobby' then raise exception 'DRAFT_ALREADY_STARTED';end if;
 if (select count(*) from public.scout_draft_teams where room_id=rm.id and (user_id is not null or is_bot))<>rm.team_count
 then raise exception 'WAIT_FOR_ALL_PLAYERS';end if;
 update public.scout_draft_rooms set status='drafting',next_pick=1,turn_started_at=case when rm.rules_version=2 and rm.draft_kind='classic' then clock_timestamp() else null end,updated_at=clock_timestamp() where id=p_room_id;
end $$;

create or replace function public.scout_draft_lobby(p_code text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare rm public.scout_draft_rooms%rowtype;seats jsonb;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select * into rm from public.scout_draft_rooms where invite_code=upper(btrim(p_code));
 if not found or (rm.opponent_mode='computer' and rm.host_user_id is distinct from auth.uid()) then raise exception 'ROOM_NOT_FOUND';end if;
 select coalesce(jsonb_agg(jsonb_build_object('team_index',team_index,
 'name',team_name,'occupied',user_id is not null or is_bot,'is_bot',is_bot,'draft_order',draft_order) order by draft_order),'[]'::jsonb)
 into seats from public.scout_draft_teams where room_id=rm.id;
 return jsonb_build_object('code',rm.invite_code,'status',rm.status,'gameweek',rm.gameweek,
 'mode',rm.mode,'draft_kind',rm.draft_kind,'team_count',rm.team_count,
 'auction_budget',rm.auction_budget,'teams',seats);
end $$;

create or replace function public.scout_draft_join_named(p_code text,p_team_name text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
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
           where room_id=rm.id and user_id is not null and lower(team_name)=lower(name_clean))
 then raise exception 'TEAM_NAME_TAKEN';end if;
 select * into t from public.scout_draft_teams where room_id=rm.id and user_id is null
 order by team_index limit 1 for update;
 if not found then raise exception 'ROOM_FULL';end if;
 update public.scout_draft_teams set user_id=u,team_name=name_clean where id=t.id;
 update public.scout_draft_rooms set updated_at=clock_timestamp() where id=rm.id;
 return rm.id;
end $$;

create or replace function public.scout_draft_my_rooms()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',r.id,'code',r.invite_code,'team_name',t.team_name,
   'gameweek',r.gameweek,'status',r.status,'draft_kind',r.draft_kind,
   'mode',r.mode,'opponent_mode',r.opponent_mode,'team_count',r.team_count,'created_at',r.created_at,
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
   'mode',r.mode,'opponent_mode',r.opponent_mode,'team_count',r.team_count,'created_at',r.created_at,
   'completed_at',r.completed_at,'is_host',r.host_user_id=auth.uid(),
 'hidden',true,
   'picked', (select count(*) from public.scout_draft_picks p where p.room_id=r.id)
 ) order by r.created_at desc),'[]'::jsonb) into result
 from public.scout_draft_rooms r
 join public.scout_draft_teams t on t.room_id=r.id and t.user_id=auth.uid()
 join public.scout_draft_hidden_rooms h on h.room_id=r.id and h.user_id=auth.uid();
 return result;
end $$;
revoke all on function public.scout_draft_create_vs_bot(text,text,integer) from public,anon;
grant execute on function public.scout_draft_create_vs_bot(text,text,integer) to authenticated;
