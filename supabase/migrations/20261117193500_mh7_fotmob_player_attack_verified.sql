-- Verified same-source MH7 player xG/xA from FotMob public full-time matchDetails.
-- Source: https://www.fotmob.com/tr/matches/gaziantep-fk-vs-corum-fk/tzrbrsj
-- Snapshot consulted 2026-11-17, FotMob matchId 5904758, fulltime 0-3.
-- xG: sum of shotmap expectedGoals per player (4-decimal precision).
-- xA: explicit playerStats expected_assists; when absent, zero supported by
-- scorecard with no chances or xG+xA identical to xG. Store derivation.
-- IMPORTANT: This is distinct from Highlightly; do not overwrite its NULL xG/xA.
-- Fantasy played minutes and official scoring are not touched.
CREATE TABLE IF NOT EXISTS public.scout_verified_player_match_metric_provenance (
 season text NOT NULL,
 gameweek integer NOT NULL,
 match_id bigint NOT NULL,
 player_id bigint NOT NULL,
 fotmob_player_id bigint NOT NULL,
 fotmob_name text NOT NULL,
 xg numeric NOT NULL,
 xa numeric NOT NULL,
 shots integer NOT NULL,
 shots_on_target integer NOT NULL,
 key_passes integer NOT NULL,
 xa_evidence text NOT NULL CHECK(xa_evidence IN ('explicit_xa','no_explicit_xa')),
 source_url text NOT NULL,
 verified_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(season,gameweek,match_id,player_id)
);
ALTER TABLE public.scout_verified_player_match_metric_provenance ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scout_verified_player_match_metric_provenance FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.scout_verified_player_match_metric_provenance TO service_role;

DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.scout_match_history
 WHERE season='2026-27' AND gameweek=7 AND match_id=317838
   AND home_team_id=18 AND away_team_id=8 AND home_goals=0 AND away_goals=3
   AND match_status='Bitti')
 THEN RAISE EXCEPTION 'MH7 FotMob match fixture guard failed'; END IF;
 IF (SELECT count(*) FROM public.scout_verified_team_match_advanced
 WHERE season='2026-27' AND gameweek=7 AND match_id=317838
   AND ((team_id=18 AND xg=0.99) OR (team_id=8 AND xg=2.67)))<>2
 THEN RAISE EXCEPTION 'Missing exact FotMob team xG prerequisite'; END IF;
END $$;

WITH evidence(fotmob_player_id,player_id,team_id,provider_name,xg,xa,shots,sot,key_passes,xa_evidence,provider_minutes) AS (
 VALUES
 (1359613,1539,18,'Abakar Sylla',0,0.01,0,0,2,'explicit_xa',90),
 (298923,568,18,'Alexandru Maxim',0,0.02,0,0,2,'explicit_xa',84),
 (783806,567,18,'Deian Sorescu',0.1037,0.34,3,0,4,'explicit_xa',90),
 (967759,561,18,'Drissa Camara',0.6110,0.05,4,2,0,'explicit_xa',31),
 (938521,536,18,'Halil Dervişoğlu',0,0.01,0,0,0,'explicit_xa',59),
 (1051411,573,18,'Kacper Kozłowski',0.2307,0.02,3,0,1,'explicit_xa',90),
 (1194358,554,18,'Kacper Tobiasz',0,0,0,0,0,'no_explicit_xa',90),
 (1211252,564,18,'Kerim Çalhanoğlu',0,0.01,0,0,0,'explicit_xa',90),
 (766957,572,18,'Luis Pérez',0.0278,0.01,1,0,0,'explicit_xa',83),
 (523380,550,18,'Myenty Abena',0,0,0,0,0,'no_explicit_xa',90),
 (1289513,576,18,'Ogün Özcicek',0.0187,0.01,1,0,0,'explicit_xa',58),
 (1564576,1609,18,'Sabahattin Destici',0,0.02,0,0,0,'explicit_xa',7),
 (317267,578,18,'Serdar Dursun',0,0,0,0,0,'no_explicit_xa',17),
 (1050160,844,18,'Sontje Hansen',0,0.06,0,0,0,'explicit_xa',6),
 (951084,557,18,'Ulrich Meleke',0,0.02,0,0,1,'explicit_xa',32),
 (1637892,559,18,'Victor Gidado',0,0.01,0,0,0,'explicit_xa',73),
 (1186780,249,8,'Alexandre Penetra',0.0149,0.01,1,0,1,'explicit_xa',90),
 (1106569,608,8,'Alexandros Kyziridis',1.2796,0.78,5,3,2,'explicit_xa',84),
 (1336714,247,8,'Andrei Borza',0.0392,0.01,1,1,0,'explicit_xa',84),
 (1210674,250,8,'Arda Sengül',0,0.02,0,0,1,'explicit_xa',6),
 (955596,389,8,'Berat Özdemir',0,0.01,0,0,0,'explicit_xa',58),
 (602261,187,8,'Caglar Söyüncü',0,0.01,0,0,0,'explicit_xa',90),
 (603477,193,8,'Cengiz Ünder',0.7038,0.04,4,2,3,'explicit_xa',84),
 (1528815,1307,8,'Ermin Mahmić',0,0,0,0,0,'no_explicit_xa',6),
 (602095,235,8,'Gökhan Sazdagi',0,0.48,0,0,1,'explicit_xa',73),
 (1077685,239,8,'Hrvoje Smolčić',0,0,0,0,0,'no_explicit_xa',90),
 (1075457,237,8,'Jesús Ramírez',0.0247,0.04,1,0,1,'explicit_xa',90),
 (535789,234,8,'Marcos Felipe',0,0,0,0,0,'no_explicit_xa',90),
 (842682,585,8,'Markus Seehusen Karlsbakk',0.6106,0,1,1,1,'no_explicit_xa',17),
 (1064272,611,8,'Mohamed Diomandé',0,0.22,0,0,1,'explicit_xa',90),
 (762028,248,8,'Ylber Ramadani',0,0.01,0,0,0,'explicit_xa',32),
 (1174708,1406,8,'Youssoufa Moukoko',0,0.01,0,0,0,'explicit_xa',6)
),checked AS (
 SELECT e.* FROM evidence e
 JOIN public.scout_players p ON p.id=e.player_id AND p.team_id=e.team_id
 JOIN public.scout_highlightly_player_matches h ON h.season='2026-27'
  AND h.match_id=317838 AND h.player_id=e.player_id AND h.team_id=e.team_id
  AND h.minutes>0
 WHERE e.provider_minutes>0 AND e.xg>=0 AND e.xa>=0
   AND e.shots>=e.sot AND e.sot>=0
)
INSERT INTO public.scout_verified_weekly_attack
(season,gameweek,match_id,player_id,team_id,provider_player_id,
 xg,xa,shots,shots_on_target,key_passes,source,observed_at)
SELECT '2026-27',7,317838,player_id,team_id,fotmob_player_id,
 xg,xa,shots,sot,key_passes,
 'FotMob matchDetails 2026 MH7 independently matched FT playerStats+shotmap',now()
FROM checked
ON CONFLICT(season,gameweek,player_id) DO NOTHING;

WITH evidence(fotmob_player_id,player_id,team_id,provider_name,xg,xa,shots,sot,key_passes,xa_evidence,provider_minutes) AS (
 VALUES
 (1359613,1539,18,'Abakar Sylla',0,0.01,0,0,2,'explicit_xa',90),
 (298923,568,18,'Alexandru Maxim',0,0.02,0,0,2,'explicit_xa',84),
 (783806,567,18,'Deian Sorescu',0.1037,0.34,3,0,4,'explicit_xa',90),
 (967759,561,18,'Drissa Camara',0.6110,0.05,4,2,0,'explicit_xa',31),
 (938521,536,18,'Halil Dervişoğlu',0,0.01,0,0,0,'explicit_xa',59),
 (1051411,573,18,'Kacper Kozłowski',0.2307,0.02,3,0,1,'explicit_xa',90),
 (1194358,554,18,'Kacper Tobiasz',0,0,0,0,0,'no_explicit_xa',90),
 (1211252,564,18,'Kerim Çalhanoğlu',0,0.01,0,0,0,'explicit_xa',90),
 (766957,572,18,'Luis Pérez',0.0278,0.01,1,0,0,'explicit_xa',83),
 (523380,550,18,'Myenty Abena',0,0,0,0,0,'no_explicit_xa',90),
 (1289513,576,18,'Ogün Özcicek',0.0187,0.01,1,0,0,'explicit_xa',58),
 (1564576,1609,18,'Sabahattin Destici',0,0.02,0,0,0,'explicit_xa',7),
 (317267,578,18,'Serdar Dursun',0,0,0,0,0,'no_explicit_xa',17),
 (1050160,844,18,'Sontje Hansen',0,0.06,0,0,0,'explicit_xa',6),
 (951084,557,18,'Ulrich Meleke',0,0.02,0,0,1,'explicit_xa',32),
 (1637892,559,18,'Victor Gidado',0,0.01,0,0,0,'explicit_xa',73),
 (1186780,249,8,'Alexandre Penetra',0.0149,0.01,1,0,1,'explicit_xa',90),
 (1106569,608,8,'Alexandros Kyziridis',1.2796,0.78,5,3,2,'explicit_xa',84),
 (1336714,247,8,'Andrei Borza',0.0392,0.01,1,1,0,'explicit_xa',84),
 (1210674,250,8,'Arda Sengül',0,0.02,0,0,1,'explicit_xa',6),
 (955596,389,8,'Berat Özdemir',0,0.01,0,0,0,'explicit_xa',58),
 (602261,187,8,'Caglar Söyüncü',0,0.01,0,0,0,'explicit_xa',90),
 (603477,193,8,'Cengiz Ünder',0.7038,0.04,4,2,3,'explicit_xa',84),
 (1528815,1307,8,'Ermin Mahmić',0,0,0,0,0,'no_explicit_xa',6),
 (602095,235,8,'Gökhan Sazdagi',0,0.48,0,0,1,'explicit_xa',73),
 (1077685,239,8,'Hrvoje Smolčić',0,0,0,0,0,'no_explicit_xa',90),
 (1075457,237,8,'Jesús Ramírez',0.0247,0.04,1,0,1,'explicit_xa',90),
 (535789,234,8,'Marcos Felipe',0,0,0,0,0,'no_explicit_xa',90),
 (842682,585,8,'Markus Seehusen Karlsbakk',0.6106,0,1,1,1,'no_explicit_xa',17),
 (1064272,611,8,'Mohamed Diomandé',0,0.22,0,0,1,'explicit_xa',90),
 (762028,248,8,'Ylber Ramadani',0,0.01,0,0,0,'explicit_xa',32),
 (1174708,1406,8,'Youssoufa Moukoko',0,0.01,0,0,0,'explicit_xa',6)
)
INSERT INTO public.scout_verified_player_match_metric_provenance
 (season,gameweek,match_id,player_id,fotmob_player_id,fotmob_name,
  xg,xa,shots,shots_on_target,key_passes,xa_evidence,source_url)
SELECT '2026-27',7,317838,player_id,fotmob_player_id,provider_name,
 xg,xa,shots,sot,key_passes,xa_evidence,
 'https://www.fotmob.com/tr/matches/gaziantep-fk-vs-corum-fk/tzrbrsj'
FROM evidence
ON CONFLICT(season,gameweek,match_id,player_id) DO NOTHING;

DO $$
BEGIN
 IF (SELECT count(*) FROM public.scout_verified_weekly_attack
 WHERE season='2026-27' AND gameweek=7 AND match_id=317838
   AND source='FotMob matchDetails 2026 MH7 independently matched FT playerStats+shotmap')<>32
 THEN RAISE EXCEPTION 'Expected exactly 32 verified played FotMob player rows'; END IF;
 IF (SELECT count(*) FROM public.scout_verified_player_match_metric_provenance
 WHERE season='2026-27' AND gameweek=7 AND match_id=317838)<>32
 THEN RAISE EXCEPTION 'Player per-field provenance incomplete'; END IF;
 IF EXISTS(
 SELECT team_id FROM public.scout_verified_weekly_attack
 WHERE season='2026-27' AND gameweek=7 AND match_id=317838
 GROUP BY team_id
 HAVING count(*)<>16 OR
  (team_id=18 AND abs(sum(xg)-0.99)>0.015) OR
  (team_id=8 AND abs(sum(xg)-2.67)>0.015) OR
  (team_id=18 AND (sum(shots)<>12 OR sum(shots_on_target)<>2)) OR
  (team_id=8 AND (sum(shots)<>13 OR sum(shots_on_target)<>7))
 ) THEN RAISE EXCEPTION 'Player totals diverge from full-time FotMob team source'; END IF;
END $$;
