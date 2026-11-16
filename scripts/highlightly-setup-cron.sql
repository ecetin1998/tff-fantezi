-- Requires pg_cron, pg_net, Supabase Vault, and private Highlightly source tables.
-- API key remains Supabase Edge Secret HIGHLIGHTLY_API_KEY, never here.
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name='scout_highlightly_cron_auth') THEN
   PERFORM vault.create_secret(encode(gen_random_bytes(32),'hex'),'scout_highlightly_cron_auth','Highlightly source ingestion secret');
 END IF;
END $$;
INSERT INTO public.scout_highlightly_sync_control(id,auth_sha256,daily_budget)
SELECT 1,encode(sha256(convert_to(decrypted_secret,'UTF8')),'hex'),72
FROM vault.decrypted_secrets WHERE name='scout_highlightly_cron_auth'
ON CONFLICT(id) DO UPDATE SET auth_sha256=excluded.auth_sha256;
SELECT cron.schedule('fantezi-highlightly-supplementary-sync','15 4,12,20 * * *',
  $job$
  SELECT net.http_post(
    url=>'https://nnoagjayvrwyjtizhnfz.supabase.co/functions/v1/highlightly-sync',
    headers=>jsonb_build_object(
      'Content-Type','application/json',
      'x-sync-auth',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='scout_highlightly_cron_auth')),
    body=>'{}'::jsonb,timeout_milliseconds=>140000);
  $job$);
-- Stop if needed: SELECT cron.unschedule('fantezi-highlightly-supplementary-sync');
