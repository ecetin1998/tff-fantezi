-- MH9 official TFF 2026/27 schedule; original provider match IDs.
-- Source: https://www.tff.org/default.aspx?ftxtID=2966&pageID=600
-- Source details: https://www.tff.org/Default.aspx?macID=<verified ID>&pageID=29
-- Dates held in public.fixtures are in Europe/Istanbul local time; never
-- treat those naive timestamps as UTC. No fantasy actuals created.
BEGIN;
DO $verify$
DECLARE
 matched int;
 inserted_pairs int;
 distinct_teams int;
BEGIN
 WITH v(match_id,hid,aid,local_time) AS (VALUES (317858::bigint,14::bigint,4::bigint,'2026-10-23 20:00'::text),
 (317857,16,3,'2026-10-24 13:30'),(317856,18,2,'2026-10-24 16:00'),
 (317864,15,5,'2026-10-24 19:00'),(317861,7,11,'2026-10-25 16:00'),
 (317860,10,8,'2026-10-25 19:00'),(317859,12,1,'2026-10-26 19:00'),
 (317863,9,13,'2026-10-26 19:00'),(317862,17,6,'2026-10-26 21:30'))
 SELECT count(*),count(DISTINCT f.home_team_id)+count(DISTINCT f.away_team_id)
   INTO matched,distinct_teams
 FROM v JOIN public.fixtures f
   ON f.gameweek=9 AND f.home_team_id=v.hid AND f.away_team_id=v.aid
   AND to_char(f.match_date,'YYYY-MM-DD HH24:MI')=v.local_time;
 IF matched<>9 OR distinct_teams<>18 THEN
   RAISE EXCEPTION 'MH9 canonical TFF team/kickoff pairs not matched: % matches, % teams',matched,distinct_teams;
 END IF;
 WITH v(match_id,hid,aid,local_time) AS (VALUES (317858::bigint,14::bigint,4::bigint,'2026-10-23 20:00'::text),
 (317857,16,3,'2026-10-24 13:30'),(317856,18,2,'2026-10-24 16:00'),
 (317864,15,5,'2026-10-24 19:00'),(317861,7,11,'2026-10-25 16:00'),
 (317860,10,8,'2026-10-25 19:00'),(317859,12,1,'2026-10-26 19:00'),
 (317863,9,13,'2026-10-26 19:00'),(317862,17,6,'2026-10-26 21:30'))
 SELECT count(*) INTO inserted_pairs FROM public.scout_match_history h
 WHERE h.gameweek=9 AND NOT EXISTS (
  SELECT 1 FROM v WHERE v.match_id=h.match_id
    AND v.hid=h.home_team_id AND v.aid=h.away_team_id
 );
 IF inserted_pairs>0 THEN RAISE EXCEPTION 'unknown existing MH9 match rows: %',inserted_pairs; END IF;
 WITH v(match_id,hid,aid,local_time) AS (VALUES (317858::bigint,14::bigint,4::bigint,'2026-10-23 20:00'::text),
 (317857,16,3,'2026-10-24 13:30'),(317856,18,2,'2026-10-24 16:00'),
 (317864,15,5,'2026-10-24 19:00'),(317861,7,11,'2026-10-25 16:00'),
 (317860,10,8,'2026-10-25 19:00'),(317859,12,1,'2026-10-26 19:00'),
 (317863,9,13,'2026-10-26 19:00'),(317862,17,6,'2026-10-26 21:30'))
 SELECT count(*) INTO inserted_pairs FROM public.scout_match_history h JOIN v
   ON v.match_id=h.match_id WHERE h.gameweek<>9;
 IF inserted_pairs>0 THEN RAISE EXCEPTION 'TFF match ID collision with other gameweek'; END IF;
END
$verify$;
WITH v(match_id,hid,aid,local_time) AS (VALUES (317858::bigint,14::bigint,4::bigint,'2026-10-23 20:00'::text),
 (317857,16,3,'2026-10-24 13:30'),(317856,18,2,'2026-10-24 16:00'),
 (317864,15,5,'2026-10-24 19:00'),(317861,7,11,'2026-10-25 16:00'),
 (317860,10,8,'2026-10-25 19:00'),(317859,12,1,'2026-10-26 19:00'),
 (317863,9,13,'2026-10-26 19:00'),(317862,17,6,'2026-10-26 21:30'))
INSERT INTO public.scout_match_history
 (match_id,gameweek,kickoff_at,home_team_id,home_team_name,away_team_id,away_team_name,
  home_goals,away_goals,match_status,fantasy_closure,source_updated_at,season)
SELECT v.match_id,9,f.match_date AT TIME ZONE 'Europe/Istanbul',
  f.home_team_id,home.name,f.away_team_id,away.name,
  NULL,NULL,'Fikstür','Maç öncesi',now(),'2026-27'
FROM v JOIN public.fixtures f
  ON f.gameweek=9 AND f.home_team_id=v.hid AND f.away_team_id=v.aid
 JOIN public.scout_teams home ON home.id=f.home_team_id
 JOIN public.scout_teams away ON away.id=f.away_team_id
WHERE NOT EXISTS (SELECT 1 FROM public.scout_match_history h WHERE h.match_id=v.match_id);
DO $check$
DECLARE n int;
BEGIN
 SELECT count(*) INTO n FROM public.scout_match_history
 WHERE gameweek=9 AND season='2026-27' AND home_goals IS NULL AND away_goals IS NULL
 AND match_status='Fikstür';
 IF n<>9 THEN RAISE EXCEPTION 'MH9 source-verified history not exactly nine unplayed fixtures: %',n; END IF;
END
$check$;
COMMIT;
