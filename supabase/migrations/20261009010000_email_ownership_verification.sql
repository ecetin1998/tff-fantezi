-- Separate proof of mailbox ownership from Supabase's auto-confirmed email flag.
create table if not exists public.scout_email_verifications (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  verified_at timestamptz not null default now()
);
alter table public.scout_email_verifications enable row level security;
revoke all on public.scout_email_verifications from anon, authenticated;
grant select on public.scout_email_verifications to authenticated;
drop policy if exists "Read own email verification" on public.scout_email_verifications;
create policy "Read own email verification" on public.scout_email_verifications
  for select to authenticated using ((select auth.uid()) = user_id);
-- Writes are service-role-only, after server-side OTP verification.
