-- 2026-08-17, MH1: Samsunspor 3-3 Göztepe, internal match 317792.
-- Source: FotMob matchDetails matchId=5904712, exact 3-3 FT snapshot, same
-- source model as the existing team totals (2.80 / 1.71).
-- https://www.fotmob.com/api/data/matchDetails?matchId=5904712
-- https://www.fotmob.com/matches/goztepe-vs-samsunspor/14l32o
-- Shotmap xG full-time: Samsun 2.7956 and Göztepe 1.7125.
-- 30/30 PLAYED FotMob players matched to historical club, player ID
-- and +/-2 minutes in separate Highlightly box scores.
-- 25 explicit xA, 4 evidenced zero xA, 1 UNKNOWN (Ogün Bayrak: one
-- chance created but source did not publish xA/xGI). Never impute zero.
-- Official fantasy scores, MH12 xFP or future-season active roster unchanged.
DO $$
BEGIN
 IF NOT EXISTS(
  SELECT 1 FROM public.scout_match_history
  WHERE season='2026-27' AND gameweek=1 AND match_id=317792
    AND home_team_id=15 AND away_team_id=10
    AND home_goals=3 AND away_goals=3 AND match_status='Bitti'
    AND kickoff_at::date=DATE '2026-08-17'
 ) THEN RAISE EXCEPTION 'MH1 Samsun-Goztepe match identity guard failed'; END IF;
 IF NOT EXISTS(
  SELECT 1 FROM scout_players WHERE id=441 AND team_id=15
    AND full_name='Ali Badra Diabaté'
 ) THEN RAISE EXCEPTION 'Ali Diabate canonical identity not verified'; END IF;
 IF EXISTS(
  SELECT 1 FROM public.scout_highlightly_player_matches
  WHERE season='2026-27' AND team_id=15 AND provider_player_id=101699507
    AND player_id IS NOT NULL AND player_id<>441
 ) THEN RAISE EXCEPTION 'Ali Diabate conflicting mapped player'; END IF;
 IF (SELECT count(*) FROM public.scout_highlightly_player_matches
  WHERE season='2026-27' AND team_id=15 AND provider_player_id=101699507
    AND player_name='Badra Diabbate Ali' AND match_id IN(317792,317796))<>2
 THEN RAISE EXCEPTION 'Ali Diabate two historical matches not present'; END IF;
 IF EXISTS(
  SELECT 1 FROM public.scout_verified_team_match_advanced
  WHERE season='2026-27' AND match_id=317792 AND
    (source_kind<>'fotmob_matchDetails_2026_gw1_source_verified'
     OR (team_id=15 AND abs(xg-2.8)>0.01)
     OR (team_id=10 AND abs(xg-1.71)>0.01))
 ) THEN RAISE EXCEPTION 'Verified team source cannot be replaced'; END IF;
END $$;

INSERT INTO public.scout_highlightly_player_aliases
 (season,provider_player_id,team_id,player_id,provider_name,canonical_name,
  verification_method,evidence)
VALUES ('2026-27',101699507,15,441,'Badra Diabbate Ali','Ali Badra Diabaté',
 'independently_matched_team_and_90_minutes',
 jsonb_build_object('fotmob_player_id',1883406,
   'fotmob_name','Ali Diabaté','fotmob_match_id',5904712,
   'highlightly_match_ids',jsonb_build_array(317792,317796),
   'canonical_active',false,
   'source_url','https://www.fotmob.com/api/data/matchDetails?matchId=5904712'))
ON CONFLICT (season,provider_player_id,team_id) DO UPDATE
 SET evidence=EXCLUDED.evidence,verified_at=now()
 WHERE scout_highlightly_player_aliases.player_id=441;
UPDATE public.scout_highlightly_player_matches
SET player_id=441 WHERE season='2026-27' AND team_id=15
  AND provider_player_id=101699507 AND player_name='Badra Diabbate Ali'
  AND player_id IS NULL;

WITH team(team_id,opp_id,xg,xga,shots,sot,opp_sot,big_chances,missed,touches,poss,saves,set_piece_xg) AS (
 VALUES
  (15::bigint,10::bigint,2.80::numeric,1.71::numeric,21,3,7,3,2,30,69::numeric,4,0::numeric),
  (10::bigint,15::bigint,1.71::numeric,2.80::numeric,20,7,3,3,2,27,31::numeric,0,0.46::numeric)
)
INSERT INTO public.scout_verified_team_match_advanced(
 season,gameweek,match_id,team_id,opponent_team_id,xg,xga,
 shots,shots_on_target,opponent_shots_on_target,
 big_chances,big_chances_missed,touches_in_opposition_box,possession_pct,
 keeper_saves,set_piece_xg,source_kind,source_observed_at)
SELECT '2026-27',1,317792,team_id,opp_id,xg,xga,shots,sot,opp_sot,
big_chances,missed,touches,poss,saves,set_piece_xg,
'fotmob_matchDetails_2026_gw1_source_verified',now()
FROM team ON CONFLICT(season,gameweek,match_id,team_id) DO NOTHING;

-- One uniquely verified canonical mapping per played historical player.
WITH evidence(fotmob_player_id,player_id,team_id,fotmob_name,xg,xa,shots,sot,key_passes,xa_evidence,provider_minutes) AS (
 VALUES
 (1304343,286,10,'Allan Godói',0.0457,0.09,1,0,0,'explicit_xa',90),
 (1315351,288,10,'Taha Altıkardeş',0,0,0,0,0,'no_explicit_xa',90),
 (864556,289,10,'Alexis Antunes',0.0133,0.05,1,1,2,'explicit_xa',60),
 (721329,290,10,'Luka Gugeshashvili',0,0,0,0,0,'no_explicit_xa',90),
 (1665499,292,10,'Ege Yıldırım',0.0288,0,1,1,0,'no_explicit_xa',90),
 (890155,294,10,'Ogün Bayrak',0,NULL,0,0,1,'unknown_xa',1),
 (1118178,295,10,'Juan',0.5302,0.01,1,1,0,'explicit_xa',29),
 (1301081,299,10,'Arda Kurtulan',0.0413,0.02,2,0,0,'explicit_xa',89),
 (1284559,300,10,'Novatus Miroshi',0.2100,0.1,3,1,1,'explicit_xa',90),
 (1463351,303,10,'Janderson',0,0.02,0,0,1,'explicit_xa',30),
 (1185467,304,10,'Rhaldney',0,0.02,0,0,0,'explicit_xa',30),
 (1514625,306,10,'Amin Cherni',0.0163,0.09,1,0,1,'explicit_xa',90),
 (678812,308,10,'Efkan Bekiroğlu',0.4098,0.12,3,1,2,'explicit_xa',30),
 (1459652,310,10,'André',0.0230,0.01,1,0,1,'explicit_xa',60),
 (1202031,313,10,'Alex Matos',0.0709,0.07,3,1,2,'explicit_xa',60),
 (1307663,314,10,'Sinclair Armstrong',0.3231,0.08,3,1,0,'explicit_xa',61),
 (1883406,441,15,'Ali Diabaté',0.0196,0.01,1,0,0,'explicit_xa',90),
 (1215016,443,15,'Samed Onur',0,0.02,0,0,0,'explicit_xa',12),
 (861962,445,15,'Toni Borevković',0,0.01,0,0,0,'explicit_xa',90),
 (938537,446,15,'Fatih Kaya',0.1835,0.01,2,0,1,'explicit_xa',20),
 (796756,457,15,'Logi Tómasson',0.1375,0.08,2,0,0,'explicit_xa',90),
 (915238,459,15,'Antoine Makoumbou',0.1030,0.02,2,0,1,'explicit_xa',70),
 (953517,460,15,'Marius Mouandilmadji',1.6041,0.19,4,1,1,'explicit_xa',90),
 (908589,462,15,'Celil Yüksel',0.1275,0.12,3,1,1,'explicit_xa',90),
 (1666481,463,15,'Anto Sekongo',0.1615,0.02,1,0,1,'explicit_xa',12),
 (955627,466,15,'Yalçin Kayan',0.0746,0.05,2,0,3,'explicit_xa',78),
 (305679,467,15,'Emre Kilinç',0.3843,0.06,4,1,1,'explicit_xa',90),
 (305148,470,15,'Okan Kocuk',0,0,0,0,0,'no_explicit_xa',90),
 (1284496,472,15,'Josafat Mendes',0,0.22,0,0,4,'explicit_xa',90),
 (1883401,474,15,'Saikuba Jarju',0,0.05,0,0,1,'explicit_xa',78)
),
checked AS (
 SELECT e.* FROM evidence e
 JOIN public.scout_players p ON p.id=e.player_id AND p.team_id=e.team_id
 JOIN public.scout_highlightly_player_matches h ON h.season='2026-27'
  AND h.match_id=317792 AND h.team_id=e.team_id AND h.player_id=e.player_id
  AND h.minutes>0 AND abs(h.minutes-e.provider_minutes)<=2
 WHERE e.provider_minutes>0 AND e.xg>=0 AND(e.xa>=0 OR e.xa IS NULL)
 AND e.shots>=e.sot AND e.sot>=0 AND e.key_passes>=0
 AND (e.xa IS NOT NULL OR e.xa_evidence='unknown_xa')
)
INSERT INTO public.scout_verified_weekly_attack (
 season,gameweek,match_id,player_id,team_id,provider_player_id,
 xg,xa,shots,shots_on_target,key_passes,source,observed_at)
SELECT '2026-27',1,317792,player_id,team_id,fotmob_player_id,
 xg,xa,shots,sot,key_passes,
 'FotMob matchDetails 2026 MH1 verified FT playerStats+shotmap',now()
FROM checked
ON CONFLICT(season,gameweek,player_id) DO NOTHING;

WITH evidence(fotmob_player_id,player_id,team_id,fotmob_name,xg,xa,shots,sot,key_passes,xa_evidence,provider_minutes) AS (
 VALUES
 (1304343,286,10,'Allan Godói',0.0457,0.09,1,0,0,'explicit_xa',90),
 (1315351,288,10,'Taha Altıkardeş',0,0,0,0,0,'no_explicit_xa',90),
 (864556,289,10,'Alexis Antunes',0.0133,0.05,1,1,2,'explicit_xa',60),
 (721329,290,10,'Luka Gugeshashvili',0,0,0,0,0,'no_explicit_xa',90),
 (1665499,292,10,'Ege Yıldırım',0.0288,0,1,1,0,'no_explicit_xa',90),
 (890155,294,10,'Ogün Bayrak',0,NULL,0,0,1,'unknown_xa',1),
 (1118178,295,10,'Juan',0.5302,0.01,1,1,0,'explicit_xa',29),
 (1301081,299,10,'Arda Kurtulan',0.0413,0.02,2,0,0,'explicit_xa',89),
 (1284559,300,10,'Novatus Miroshi',0.2100,0.1,3,1,1,'explicit_xa',90),
 (1463351,303,10,'Janderson',0,0.02,0,0,1,'explicit_xa',30),
 (1185467,304,10,'Rhaldney',0,0.02,0,0,0,'explicit_xa',30),
 (1514625,306,10,'Amin Cherni',0.0163,0.09,1,0,1,'explicit_xa',90),
 (678812,308,10,'Efkan Bekiroğlu',0.4098,0.12,3,1,2,'explicit_xa',30),
 (1459652,310,10,'André',0.0230,0.01,1,0,1,'explicit_xa',60),
 (1202031,313,10,'Alex Matos',0.0709,0.07,3,1,2,'explicit_xa',60),
 (1307663,314,10,'Sinclair Armstrong',0.3231,0.08,3,1,0,'explicit_xa',61),
 (1883406,441,15,'Ali Diabaté',0.0196,0.01,1,0,0,'explicit_xa',90),
 (1215016,443,15,'Samed Onur',0,0.02,0,0,0,'explicit_xa',12),
 (861962,445,15,'Toni Borevković',0,0.01,0,0,0,'explicit_xa',90),
 (938537,446,15,'Fatih Kaya',0.1835,0.01,2,0,1,'explicit_xa',20),
 (796756,457,15,'Logi Tómasson',0.1375,0.08,2,0,0,'explicit_xa',90),
 (915238,459,15,'Antoine Makoumbou',0.1030,0.02,2,0,1,'explicit_xa',70),
 (953517,460,15,'Marius Mouandilmadji',1.6041,0.19,4,1,1,'explicit_xa',90),
 (908589,462,15,'Celil Yüksel',0.1275,0.12,3,1,1,'explicit_xa',90),
 (1666481,463,15,'Anto Sekongo',0.1615,0.02,1,0,1,'explicit_xa',12),
 (955627,466,15,'Yalçin Kayan',0.0746,0.05,2,0,3,'explicit_xa',78),
 (305679,467,15,'Emre Kilinç',0.3843,0.06,4,1,1,'explicit_xa',90),
 (305148,470,15,'Okan Kocuk',0,0,0,0,0,'no_explicit_xa',90),
 (1284496,472,15,'Josafat Mendes',0,0.22,0,0,4,'explicit_xa',90),
 (1883401,474,15,'Saikuba Jarju',0,0.05,0,0,1,'explicit_xa',78)
)
INSERT INTO public.scout_verified_player_match_metric_provenance (
 season,gameweek,match_id,player_id,fotmob_player_id,fotmob_name,
 xg,xa,shots,shots_on_target,key_passes,xa_evidence,source_url)
SELECT '2026-27',1,317792,player_id,fotmob_player_id,fotmob_name,
 xg,xa,shots,sot,key_passes,xa_evidence,
 'https://www.fotmob.com/api/data/matchDetails?matchId=5904712'
FROM evidence WHERE xa IS NOT NULL
ON CONFLICT(season,gameweek,match_id,player_id) DO NOTHING;

-- An absent source field isn't a measured zero. Keep a durable gap record.
CREATE TABLE IF NOT EXISTS public.scout_verified_player_source_missing_metrics (
 season text NOT NULL,gameweek integer NOT NULL,match_id bigint NOT NULL,
 player_id bigint NOT NULL,metric text NOT NULL,
 source_name text NOT NULL,source_url text NOT NULL,reason text NOT NULL,
 observed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(season,gameweek,match_id,player_id,metric)
);
ALTER TABLE public.scout_verified_player_source_missing_metrics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scout_verified_player_source_missing_metrics FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.scout_verified_player_source_missing_metrics TO service_role;

INSERT INTO public.scout_verified_player_source_missing_metrics
(season,gameweek,match_id,player_id,metric,source_name,source_url,reason)
VALUES('2026-27',1,317792,294,'xa','FotMob',
 'https://www.fotmob.com/api/data/matchDetails?matchId=5904712',
 'Ogün Bayrak: source shows 1 created chance, but no explicit expected_assists or xGI; preserve xa NULL, not fabricated zero')
ON CONFLICT(season,gameweek,match_id,player_id,metric) DO NOTHING;

WITH team(team_id,xg,xga,shots,sot,opp_sot,big_chances,missed,touches,poss,saves,sp_xg) AS (
 VALUES
 (15::bigint,2.80::numeric,1.71::numeric,21,3,7,3,2,30,69::numeric,4,0::numeric),
 (10::bigint,1.71::numeric,2.80::numeric,20,7,3,3,2,27,31::numeric,0,0.46::numeric)
),
metrics AS (
 SELECT t.team_id,m.metric,m.val FROM team t CROSS JOIN LATERAL (
  VALUES ('xg',t.xg),('xga',t.xga),
  ('shots',t.shots::numeric),('shots_on_target',t.sot::numeric),
  ('opponent_shots_on_target',t.opp_sot::numeric),
  ('big_chances',t.big_chances::numeric),('big_chances_missed',t.missed::numeric),
  ('touches_in_opposition_box',t.touches::numeric),('possession_pct',t.poss),
  ('keeper_saves',t.saves::numeric),('set_piece_xg',t.sp_xg)
 )m(metric,val)
)
INSERT INTO public.scout_verified_match_metric_provenance(
 season,gameweek,match_id,team_id,metric,value,source_name,
 source_url,corroboration_url,note)
SELECT '2026-27',1,317792,team_id,metric,val,'FotMob',
 'https://www.fotmob.com/matches/goztepe-vs-samsunspor/14l32o',
 'https://www.fotmob.com/api/data/matchDetails?matchId=5904712',
 'FotMob exact matchId 5904712, fulltime 3-3 on 2026-08-17; 21/20 shotmap and source-consistent advanced metrics'
FROM metrics
ON CONFLICT(season,gameweek,match_id,team_id,metric) DO NOTHING;

DO $$
BEGIN
 IF (SELECT count(*) FROM public.scout_highlightly_player_matches
 WHERE season='2026-27' AND team_id=15 AND provider_player_id=101699507
 AND player_id=441 AND match_id IN(317792,317796))<>2
 THEN RAISE EXCEPTION 'Historical Ali Diabate mapping incomplete'; END IF;
 IF (SELECT count(*) FROM public.scout_verified_weekly_attack
 WHERE season='2026-27' AND gameweek=1 AND match_id=317792
 AND source='FotMob matchDetails 2026 MH1 verified FT playerStats+shotmap')<>30
 THEN RAISE EXCEPTION 'Exactly 30 played FotMob player records required'; END IF;
 IF (SELECT count(*) FROM public.scout_verified_weekly_attack
 WHERE season='2026-27' AND match_id=317792
 AND xg IS NOT NULL AND xa IS NOT NULL)<>29
 THEN RAISE EXCEPTION '29 fully source-evidenced player xG/xA records required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.scout_verified_weekly_attack
 WHERE season='2026-27' AND match_id=317792 AND player_id=294
 AND xg=0 AND xa IS NULL)
 THEN RAISE EXCEPTION 'Unverified Ogün xa must remain NULL'; END IF;
 IF (SELECT count(*) FROM public.scout_verified_player_match_metric_provenance
 WHERE season='2026-27' AND match_id=317792)<>29
 THEN RAISE EXCEPTION '29 matching player provenance rows required'; END IF;
 IF (SELECT count(*) FROM public.scout_verified_player_source_missing_metrics
 WHERE season='2026-27' AND match_id=317792 AND metric='xa')<>1
 THEN RAISE EXCEPTION 'Single unmeasured xA provenance gap required'; END IF;
 IF (SELECT count(*) FROM public.scout_verified_team_match_advanced
 WHERE season='2026-27' AND gameweek=1 AND match_id=317792
 AND source_kind='fotmob_matchDetails_2026_gw1_source_verified')<>2
 THEN RAISE EXCEPTION 'MH1 verified team statistics incomplete'; END IF;
 IF (SELECT count(*) FROM public.scout_verified_match_metric_provenance
 WHERE season='2026-27' AND gameweek=1 AND match_id=317792 AND source_name='FotMob')<>22
 THEN RAISE EXCEPTION '22 team metrics provenance incomplete'; END IF;
 IF EXISTS(
 SELECT team_id FROM public.scout_verified_weekly_attack
 WHERE season='2026-27' AND gameweek=1 AND match_id=317792
 GROUP BY team_id
 HAVING(team_id=15 AND(count(*)<>14 OR sum(shots)<>21 OR sum(shots_on_target)<>3
 OR abs(sum(xg)-2.80)>0.01))
 OR(team_id=10 AND(count(*)<>16 OR sum(shots)<>20 OR sum(shots_on_target)<>7
 OR abs(sum(xg)-1.71)>0.01))
 ) THEN RAISE EXCEPTION 'Player shotmap and team xG/SOT consistency failed'; END IF;
 IF (SELECT sufficient_matches FROM public.scout_highlightly_targeted_readiness)<>99
 THEN RAISE EXCEPTION 'Verified 99/99 sufficient matches not reached'; END IF;
END $$;
