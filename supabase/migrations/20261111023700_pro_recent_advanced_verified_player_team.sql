create or replace function public.scout_pro_player_recent_advanced(p_player_id bigint)
returns table(gameweek integer,minutes numeric,xg numeric,xa numeric,shots integer,shots_on_target integer,key_passes integer,source_note text)
language plpgsql stable security definer set search_path='' as $fn$
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.scout_subscriptions s where s.user_id=(select auth.uid())
      and s.plan='pro' and s.status in ('active','trialing')
      and (s.valid_until is null or s.valid_until>now())
  ) then raise exception 'pro subscription required' using errcode='42501'; end if;
  return query
  select a.gameweek,w.minutes::numeric,a.xg,a.xa,a.shots,a.shots_on_target,a.key_passes,a.source
  from public.scout_verified_weekly_attack a
  join public.scout_player_weekly_points w
    on w.gameweek=a.gameweek and w.player_id=a.player_id and w.match_id=a.match_id
    and w.is_final=true and w.minutes>0
  where a.season='2026-27' and a.player_id=p_player_id
  order by a.gameweek desc limit 4;
end;
$fn$;

create or replace function public.scout_pro_team_recent_advanced(p_team_id bigint)
returns table(first_gameweek integer,through_gameweek integer,source_matches bigint,
  xg numeric,xga numeric,shots numeric,shots_on_target numeric,
  big_chances numeric,big_chances_missed numeric,touches_in_opposition_box numeric,
  set_piece_xg numeric,possession_pct numeric,keeper_saves numeric)
language plpgsql stable security definer set search_path='' as $fn$
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.scout_subscriptions s where s.user_id=(select auth.uid())
      and s.plan='pro' and s.status in ('active','trialing')
      and (s.valid_until is null or s.valid_until>now())
  ) then raise exception 'pro subscription required' using errcode='42501'; end if;
  return query
  with latest as (
    select max(g.gameweek) gw
    from public.scout_verified_team_match_advanced g
    where g.season='2026-27' and g.team_id=p_team_id
  )
  select min(a.gameweek),max(a.gameweek),count(*)::bigint,
    sum(a.xg),sum(a.xga),sum(a.shots)::numeric,sum(a.shots_on_target)::numeric,
    case when count(a.big_chances)=count(*) then sum(a.big_chances)::numeric else null end,
    case when count(a.big_chances_missed)=count(*) then sum(a.big_chances_missed)::numeric else null end,
    case when count(a.touches_in_opposition_box)=count(*) then sum(a.touches_in_opposition_box)::numeric else null end,
    case when count(a.set_piece_xg)=count(*) then sum(a.set_piece_xg) else null end,
    case when count(a.possession_pct)=count(*) then avg(a.possession_pct) else null end,
    case when count(a.keeper_saves)=count(*) then sum(a.keeper_saves)::numeric else null end
  from public.scout_verified_team_match_advanced a cross join latest l
  where a.season='2026-27' and a.team_id=p_team_id and a.gameweek between l.gw-3 and l.gw
  having count(*)=4 and min(a.gameweek)=max(a.gameweek)-3;
end;
$fn$;

revoke all on function public.scout_pro_player_recent_advanced(bigint) from public,anon;
revoke all on function public.scout_pro_team_recent_advanced(bigint) from public,anon;
grant execute on function public.scout_pro_player_recent_advanced(bigint) to authenticated;
grant execute on function public.scout_pro_team_recent_advanced(bigint) to authenticated;
comment on function public.scout_pro_player_recent_advanced(bigint) is 'Pro only source-observed player action values; NULL not zero; 0-minute unverified DNP excluded.';
comment on function public.scout_pro_team_recent_advanced(bigint) is 'Pro only recent four source-verified contiguous team matches; no extrapolation over missing weeks.';
