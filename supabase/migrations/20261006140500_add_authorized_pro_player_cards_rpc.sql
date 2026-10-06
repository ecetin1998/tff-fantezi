-- Authorized Pro overlay. The function is callable only by signed-in users and re-checks active Pro status server-side.
create or replace function public.scout_pro_player_cards(p_run_id uuid default null)
returns setof public.v_current_player_cards
language plpgsql
stable
security definer
set search_path = ''
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
  select c.* from public.v_current_player_cards c
  where p_run_id is null or c.run_id=p_run_id;
end;
$$;
revoke execute on function public.scout_pro_player_cards(uuid) from public, anon;
grant execute on function public.scout_pro_player_cards(uuid) to authenticated;
