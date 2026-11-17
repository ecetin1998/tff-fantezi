-- FotMob matchDetails 5904758 source-consistent MH7 team advanced.
-- Live FotMob JSON obtained from https://www.fotmob.com/api/data/matchDetails?matchId=5904758
-- Canonical permalink https://www.fotmob.com/tr/matches/gaziantep-fk-vs-corum-fk/tzrbrsj
-- Compare to source player metrics / shot map in adjacent migration.
DO $$
BEGIN
 IF NOT EXISTS (
 SELECT 1 FROM public.scout_match_history
 WHERE season='2026-27' AND match_id=317838 AND gameweek=7
 AND home_team_id=18 AND away_team_id=8
 AND home_goals=0 AND away_goals=3 AND match_status='Bitti'
 ) THEN RAISE EXCEPTION 'MH7 FotMob fixture changed'; END IF;
 IF (SELECT count(*) FROM public.scout_verified_weekly_attack
 WHERE match_id=317838 AND gameweek=7 AND season='2026-27'
 AND source='FotMob matchDetails 2026 MH7 independently matched FT playerStats+shotmap')<>32
 THEN RAISE EXCEPTION '32 source-verified players missing'; END IF;
END $$;

WITH team(team_id,xg,xga,shots,sot,opp_sot,big_chances,big_chances_missed,
touches,keeper_saves,possession,sp_xg) AS(
 VALUES
 (18::bigint,0.99::numeric,2.67::numeric,12,2,7,2,2,18,4,54::numeric,0.03::numeric),
 (8::bigint,2.67::numeric,0.99::numeric,13,7,2,3,0,25,2,46::numeric,0.01::numeric)
)
UPDATE public.scout_verified_team_match_advanced a
SET xg=t.xg,xga=t.xga,shots=t.shots,shots_on_target=t.sot,
 opponent_shots_on_target=t.opp_sot,big_chances=t.big_chances,
 big_chances_missed=t.big_chances_missed,
 touches_in_opposition_box=t.touches,keeper_saves=t.keeper_saves,
 possession_pct=t.possession,set_piece_xg=t.sp_xg,
 source_kind='fotmob_matchDetails_2026_gw7_tff_verified',
 source_observed_at=now()
FROM team t WHERE a.season='2026-27' AND a.gameweek=7
 AND a.match_id=317838 AND a.team_id=t.team_id
 AND a.source_kind IN (
  'fotmob_match_page_xg_matchpulse_shots_highlightly_sot_mh7',
  'fotmob_matchDetails_2026_gw7_tff_verified'
 );

WITH team(team_id,xg,xga,shots,sot,opp_sot,big_chances,big_chances_missed,
touches,keeper_saves,possession,sp_xg) AS(
 VALUES
 (18::bigint,0.99::numeric,2.67::numeric,12,2,7,2,2,18,4,54::numeric,0.03::numeric),
 (8::bigint,2.67::numeric,0.99::numeric,13,7,2,3,0,25,2,46::numeric,0.01::numeric)
),
audit AS(
 SELECT t.team_id,metric,val
 FROM team t
 CROSS JOIN LATERAL (
 VALUES ('xg',t.xg),('xga',t.xga),
 ('shots',t.shots::numeric),('shots_on_target',t.sot::numeric),
 ('opponent_shots_on_target',t.opp_sot::numeric),
 ('big_chances',t.big_chances::numeric),
 ('big_chances_missed',t.big_chances_missed::numeric),
 ('touches_in_opposition_box',t.touches::numeric),
 ('keeper_saves',t.keeper_saves::numeric),
 ('possession_pct',t.possession),('set_piece_xg',t.sp_xg)
 ) details(metric,val)
)
INSERT INTO public.scout_verified_match_metric_provenance
 (season,gameweek,match_id,team_id,metric,value,source_name,source_url,
  corroboration_url,note)
SELECT '2026-27',7,317838,team_id,metric,val,'FotMob',
 'https://www.fotmob.com/tr/matches/gaziantep-fk-vs-corum-fk/tzrbrsj',
 CASE WHEN metric IN ('xg','xga','shots','possession_pct') THEN
 'https://web-production-a0606.up.railway.app/match/gaziantep-fk-vs-corum-fk-2026-10-11/stats'
 ELSE NULL END,
 'Source consistency: FotMob matchDetails 5904758, 0-3 FT, October 11 2026; provider values must not be mixed'
FROM audit
ON CONFLICT (season,gameweek,match_id,team_id,metric)
 DO UPDATE SET value=EXCLUDED.value,source_name=EXCLUDED.source_name,
  source_url=EXCLUDED.source_url,corroboration_url=EXCLUDED.corroboration_url,
  note=EXCLUDED.note,verified_at=now();

DO $$
BEGIN
 IF (SELECT count(*) FROM public.scout_verified_team_match_advanced
 WHERE season='2026-27' AND gameweek=7 AND match_id=317838
 AND source_kind='fotmob_matchDetails_2026_gw7_tff_verified')<>2
 THEN RAISE EXCEPTION 'Verified source consistency team update failed'; END IF;
 IF EXISTS (
 SELECT team_id FROM public.scout_verified_weekly_attack
 WHERE match_id=317838 AND gameweek=7 AND season='2026-27'
 GROUP BY team_id
 HAVING (team_id=18 AND
 (abs(sum(xg)-0.99)>0.015 OR sum(shots)<>12 OR sum(shots_on_target)<>2))
 OR (team_id=8 AND
 (abs(sum(xg)-2.67)>0.015 OR sum(shots)<>13 OR sum(shots_on_target)<>7))
 ) THEN RAISE EXCEPTION 'FotMob player totals do not reproduce FotMob team stats'; END IF;
 IF (SELECT count(*) FROM public.scout_verified_match_metric_provenance
 WHERE season='2026-27' AND gameweek=7 AND match_id=317838
 AND source_name='FotMob')<>22
 THEN RAISE EXCEPTION 'Not all 22 team stats verified from FotMob'; END IF;
END $$;
