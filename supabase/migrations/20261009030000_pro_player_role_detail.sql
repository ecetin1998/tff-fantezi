-- Only active Pro users can read current run role signals for a player.
create or replace function public.scout_pro_player_role(p_player_id bigint,p_run_id uuid)
returns table (
  signal text,
  last2_xi_probability numeric,
  previous2_xi_probability numeric,
  last2_minutes numeric,
  previous2_minutes numeric
)
language plpgsql stable security definer set search_path=''
as $$
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.scout_subscriptions s
    where s.user_id=(select auth.uid())
      and s.plan='pro'
      and s.status in ('active','trialing')
      and (s.valid_until is null or s.valid_until>now())
  ) then
    raise exception 'pro subscription required' using errcode='42501';
  end if;
  return query
    select r.signal,r.last2_xi_probability,r.previous2_xi_probability,
           r.last2_minutes,r.previous2_minutes
    from public.scout_role_signals r
    where r.player_id=p_player_id and r.run_id=p_run_id
    limit 1;
end;
$$;
revoke all on function public.scout_pro_player_role(bigint,uuid) from public,anon;
grant execute on function public.scout_pro_player_role(bigint,uuid) to authenticated;
