begin;

-- Keep the replay worker token in Supabase Vault. The Edge Function asks this
-- service-role-only validator instead of embedding a token hash in source.
create or replace function public.validate_enrichment_replay_worker_token(p_token text)
returns boolean
language sql
security definer
set search_path=''
as $fn$
  select exists(
    select 1
    from vault.decrypted_secrets s
    where s.name='mh1_replay_worker_token'
      and s.decrypted_secret=p_token
  );
$fn$;

revoke all on function public.validate_enrichment_replay_worker_token(text)
from public,anon,authenticated;
grant execute on function public.validate_enrichment_replay_worker_token(text)
to service_role;

commit;
