create or replace function public.enqueue_enrichment_replay_chunk(
  p_gameweek integer,
  p_seed integer,
  p_draws integer default 10000
)
returns bigint
language plpgsql
security definer
set search_path='public','vault','net'
as $fn$
declare
  v_token text;
  v_request bigint;
begin
  if p_gameweek < 1 or p_gameweek > 6 then
    raise exception 'gameweek must be 1..6';
  end if;
  if p_draws < 1 or p_draws > 10000 then
    raise exception 'draws out of range';
  end if;

  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name='mh1_replay_worker_token'
  limit 1;

  if v_token is null then
    raise exception 'Replay worker token missing';
  end if;

  select net.http_get(
    url := 'https://nnoagjayvrwyjtizhnfz.supabase.co/functions/v1/run-enrichment-replay-chunk',
    params := jsonb_build_object(
      'gw',p_gameweek,
      'draws',p_draws,
      'seed',p_seed,
      'benchmark','scoutplus-3.3-enrichment-replay-v2-2026-09-28'
    ),
    headers := jsonb_build_object('x-run-token',v_token),
    timeout_milliseconds := 120000
  ) into v_request;

  return v_request;
end;
$fn$;

revoke all on function public.enqueue_enrichment_replay_chunk(integer,integer,integer)
from public,anon,authenticated;
grant execute on function public.enqueue_enrichment_replay_chunk(integer,integer,integer)
to service_role;
