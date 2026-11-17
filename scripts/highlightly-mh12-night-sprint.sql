-- Temporary accelerated ingestion for MH12 deadline, 21 Nov 2026 12:30 TR.
-- Preserve existing fantezi-highlightly-supplementary-sync schedule unchanged.
-- UTC 00:05,00:35,01:05,01:35,02:05,02:35,03:05,03:35.
-- Turkey (Europe/Istanbul): 03:05,03:35,04:05,04:35,05:05,05:35,06:05,06:35.
-- Safety: existing Highlightly Edge quota/lease logic remains authoritative:
-- integration budget 72/day, provider reserve >=10, max 7 matches per invocation.
-- Job removes itself after the deadline on 22 Nov 2026 at its first 03:05 TR slot.
DO $create$
DECLARE id bigint;
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM cron.job WHERE jobname='fantezi-highlightly-supplementary-sync' AND active=true
 ) THEN RAISE EXCEPTION 'Original Highlightly cron must remain active'; END IF;
 IF NOT EXISTS (
   SELECT 1 FROM vault.decrypted_secrets WHERE name='scout_highlightly_cron_auth'
 ) THEN RAISE EXCEPTION 'Existing Vault authorization missing'; END IF;

 SELECT cron.schedule(
   'fantezi-highlightly-mh12-night-sprint',
   '5,35 0-3 * * *',
   $job$
   DO $night$
   BEGIN
     IF (now() AT TIME ZONE 'Europe/Istanbul')::date >= DATE '2026-11-22' THEN
       PERFORM cron.unschedule('fantezi-highlightly-mh12-night-sprint');
     ELSE
       PERFORM net.http_post(
         url=>'https://nnoagjayvrwyjtizhnfz.supabase.co/functions/v1/highlightly-sync',
         headers=>jsonb_build_object(
           'Content-Type','application/json',
           'x-sync-auth',(SELECT decrypted_secret FROM vault.decrypted_secrets
             WHERE name='scout_highlightly_cron_auth')
         ),
         body=>'{}'::jsonb,
         timeout_milliseconds=>140000
       );
     END IF;
   END
   $night$;
   $job$
 ) INTO id;
 IF id IS NULL THEN RAISE EXCEPTION 'Nightly catch-up cron creation failed'; END IF;
END $create$;

-- Inspect:
SELECT jobid,jobname,schedule,active FROM cron.job
WHERE jobname IN ('fantezi-highlightly-supplementary-sync',
                  'fantezi-highlightly-mh12-night-sprint')
ORDER BY jobid;
-- Emergency stop: SELECT cron.unschedule('fantezi-highlightly-mh12-night-sprint');
