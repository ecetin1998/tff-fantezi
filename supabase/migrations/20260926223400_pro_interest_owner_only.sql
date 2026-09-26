begin;

drop policy if exists "users insert own pro interest" on public.scout_pro_interest;
drop policy if exists "users read own pro interest" on public.scout_pro_interest;
drop policy if exists "users update own pro interest" on public.scout_pro_interest;
drop policy if exists "users delete own pro interest" on public.scout_pro_interest;

create policy "users insert own pro interest" on public.scout_pro_interest
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "users read own pro interest" on public.scout_pro_interest
  for select to authenticated
  using ((select auth.uid()) = user_id);

commit;
