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
  from public.scout_verified_weekly_attack_reconciled a
  join public.scout_player_weekly_points w
    on w.gameweek=a.gameweek and w.player_id=a.player_id and w.match_id=a.match_id
    and w.is_final=true and w.minutes>0
  where a.season='2026-27' and a.player_id=p_player_id
  order by a.gameweek desc limit 4;
end;
$fn$;

revoke all on function public.scout_pro_player_recent_advanced(bigint) from public,anon;
grant execute on function public.scout_pro_player_recent_advanced(bigint) to authenticated;
comment on function public.scout_pro_player_recent_advanced(bigint) is 'Pro only verified player observations and team-total reconciled no-shot zeros; other unknowns remain NULL.';
