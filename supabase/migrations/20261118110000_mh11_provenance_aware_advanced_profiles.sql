-- Stage 1: source-aware reconciliation of 99 closed 2026-27 match sources
-- into verified recent-FotMob model windows, weekly action ledgers and detailed
-- team profiles. NEVER blend raw Highlightly xG with FotMob xG.
-- The unrelated, verified fantasy-scoring ledger remains unchanged.
BEGIN;

-- Safe canonical aliases: same team, same historical match, 0-2 minute offset.
DO $guard$
BEGIN
 IF (SELECT COUNT(*) FROM scout_highlightly_player_matches h
   JOIN scout_player_weekly_points w ON w.player_id=370
     AND w.match_id=h.match_id AND w.gameweek=h.gameweek AND w.is_final
   WHERE h.season='2026-27' AND h.team_id=12
     AND h.provider_player_id=6932170 AND h.player_id IS NULL
     AND abs(w.minutes-h.minutes)<=2 AND h.minutes>0)<>3
 THEN RAISE EXCEPTION 'Mihaila source identity/played minutes not verified'; END IF;
 IF (SELECT COUNT(*) FROM scout_highlightly_player_matches h
   JOIN scout_player_weekly_points w ON w.player_id=1075
     AND w.match_id=h.match_id AND w.gameweek=h.gameweek AND w.is_final
   WHERE h.season='2026-27' AND h.team_id=3
     AND h.provider_player_id=3405143 AND h.player_id IS NULL
     AND w.minutes=h.minutes AND h.minutes=90)<>3
 THEN RAISE EXCEPTION 'Mouanga source identity/played minutes not verified'; END IF;
 IF NOT EXISTS(SELECT 1 FROM scout_players WHERE id=370 AND team_id=12 AND
   full_name='Mihai Valentin Mihăilă') OR
   NOT EXISTS(SELECT 1 FROM scout_players WHERE id=1075 AND team_id=3 AND
   full_name='Kevin Camron Mouanga')
 THEN RAISE EXCEPTION 'Alias canonical identity mismatch'; END IF;
END $guard$;

INSERT INTO scout_highlightly_player_aliases
 (season,provider_player_id,team_id,player_id,provider_name,canonical_name,
  verification_method,evidence)
VALUES
 ('2026-27',6932170,12,370,'Valentin Mihai Mihăilă','Mihai Valentin Mihăilă',
  'team_full_name_review',jsonb_build_object('review','same team match IDs + ±2-minute source',
   'gameweeks',jsonb_build_array(3,4,5))),
 ('2026-27',3405143,3,1075,'Kévin Mouanga','Kevin Camron Mouanga',
  'team_full_name_review',jsonb_build_object('review','same team match IDs + 90-minute exact source',
   'gameweeks',jsonb_build_array(5,6,7)))
ON CONFLICT(season,provider_player_id,team_id) DO NOTHING;
UPDATE scout_highlightly_player_matches h SET player_id=
 CASE WHEN provider_player_id=6932170 THEN 370
      WHEN provider_player_id=3405143 THEN 1075 END
WHERE season='2026-27' AND player_id IS NULL
 AND ((provider_player_id=6932170 AND team_id=12 AND player_name='Valentin Mihai Mihăilă')
   OR (provider_player_id=3405143 AND team_id=3 AND player_name='Kévin Mouanga'));

-- New time-window observability fields, without repurposing preexisting
-- xg_total / xa_total (which are older provider-specific cumulative snapshots).
ALTER TABLE scout_player_season_stats
 ADD COLUMN IF NOT EXISTS advanced_actions_through_gameweek integer,
 ADD COLUMN IF NOT EXISTS advanced_actions_source text,
 ADD COLUMN IF NOT EXISTS advanced_actions_verified_appearances integer,
 ADD COLUMN IF NOT EXISTS advanced_actions_played_appearances integer;

-- Keep the 5-week historical action baseline intact; only fill missing
-- baselines for players with NO final playing minutes before GW6.
INSERT INTO scout_player_advanced_baseline(
 season,player_id,through_gameweek,shots,shots_on_target,key_passes,
 crosses,successful_crosses,takeons,successful_takeons)
SELECT '2026-27',p.id,5,0,0,0,0,0,0,0
FROM scout_players p
WHERE p.active AND NOT EXISTS(
 SELECT 1 FROM scout_player_advanced_baseline b WHERE b.season='2026-27' AND b.player_id=p.id)
 AND NOT EXISTS(
 SELECT 1 FROM scout_player_weekly_points w WHERE w.player_id=p.id
 AND w.gameweek<=5 AND w.is_final AND w.minutes>0)
ON CONFLICT(season,player_id) DO NOTHING;

-- Action evidence for GWs 6-11: prefer independently verified FotMob action
-- fields; otherwise accept explicit Highlightly match fields. Sahadan-verified
-- existing GW6/7 actions retain their precedence (ON CONFLICT DO NOTHING).
WITH o AS(
 SELECT w.player_id,w.gameweek,w.match_id,w.minutes
 FROM scout_player_weekly_points w JOIN scout_players p ON p.id=w.player_id AND p.active
 WHERE w.gameweek BETWEEN 6 AND 11 AND w.is_final AND w.minutes>0
),
candidate AS(
 SELECT o.*,
   coalesce(v.shots,h.shots) shots,
   coalesce(v.shots_on_target,h.shots_on_target) sot,
   coalesce(v.key_passes,h.key_passes) kp,
   h.dribbles takeons,h.successful_dribbles successful_takeons,
   CASE WHEN v.shots IS NOT NULL AND v.key_passes IS NOT NULL
     THEN 'FotMob_verified_player_actions'
     WHEN h.player_id IS NOT NULL THEN 'Highlightly_match_actions_source'
     ELSE 'FotMob_partial_player_actions' END source
 FROM o LEFT JOIN scout_verified_weekly_attack_reconciled v
  ON v.season='2026-27' AND v.player_id=o.player_id
  AND v.gameweek=o.gameweek AND v.match_id=o.match_id
 LEFT JOIN scout_highlightly_player_matches h
  ON h.season='2026-27' AND h.player_id=o.player_id
  AND h.gameweek=o.gameweek AND h.match_id=o.match_id
)
INSERT INTO scout_player_advanced_weekly(
 season,gameweek,player_id,shots,shots_on_target,key_passes,
 crosses,successful_crosses,takeons,successful_takeons,source,source_updated_at)
SELECT '2026-27',gameweek,player_id,coalesce(shots,0)::int,
 coalesce(sot,0)::int,coalesce(kp,0)::int,0,0,
 coalesce(takeons,0)::int,coalesce(successful_takeons,0)::int,
 source||' • crosses_unobserved_not_season_total',now()
FROM candidate WHERE shots IS NOT NULL AND sot IS NOT NULL AND kp IS NOT NULL
 AND shots>=sot AND sot>=0 AND kp>=0
ON CONFLICT(season,gameweek,player_id) DO NOTHING;

-- Clean source-specific recent FotMob sample; never use full-season minutes
-- as denominator for only GW8-GW11 xG/xA. Absent value remains NULL.
CREATE TABLE IF NOT EXISTS scout_player_recent_verified_advanced_window(
 season text NOT NULL,player_id bigint NOT NULL REFERENCES scout_players(id),
 from_gameweek integer NOT NULL,to_gameweek integer NOT NULL,
 played_games integer NOT NULL,played_minutes numeric NOT NULL,
 xg_observed_games integer NOT NULL,xg_observed_minutes numeric NOT NULL,
 xa_observed_games integer NOT NULL,xa_observed_minutes numeric NOT NULL,
 xg_total numeric,xa_total numeric,
 xg_per90 numeric,xa_per90 numeric,
 source_name text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(season,player_id,to_gameweek),
 CONSTRAINT source_week_order CHECK(from_gameweek<=to_gameweek)
);
ALTER TABLE scout_player_recent_verified_advanced_window ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON scout_player_recent_verified_advanced_window FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON scout_player_recent_verified_advanced_window TO service_role;

WITH o AS(
 SELECT w.player_id,w.gameweek,w.match_id,sum(w.minutes) minutes
 FROM scout_player_weekly_points w JOIN scout_players p ON p.id=w.player_id AND p.active
 WHERE w.gameweek BETWEEN 8 AND 11 AND w.is_final AND w.minutes>0
 GROUP BY w.player_id,w.gameweek,w.match_id
),
a AS(
 SELECT o.player_id,count(*) played_games,sum(o.minutes) played_minutes,
 count(*) FILTER(WHERE v.xg IS NOT NULL) xg_games,
 coalesce(sum(o.minutes) FILTER(WHERE v.xg IS NOT NULL),0) xg_minutes,
 sum(v.xg) xg_total,
 count(*) FILTER(WHERE v.xa IS NOT NULL) xa_games,
 coalesce(sum(o.minutes) FILTER(WHERE v.xa IS NOT NULL),0) xa_minutes,
 sum(v.xa) xa_total
 FROM o LEFT JOIN scout_verified_weekly_attack_reconciled v
 ON v.season='2026-27' AND v.player_id=o.player_id
 AND v.gameweek=o.gameweek AND v.match_id=o.match_id GROUP BY o.player_id
)
INSERT INTO scout_player_recent_verified_advanced_window(
 season,player_id,from_gameweek,to_gameweek,
 played_games,played_minutes,xg_observed_games,xg_observed_minutes,
 xa_observed_games,xa_observed_minutes,xg_total,xa_total,
 xg_per90,xa_per90,source_name)
SELECT '2026-27',p.id,8,11,
 coalesce(a.played_games,0),coalesce(a.played_minutes,0),
 coalesce(a.xg_games,0),coalesce(a.xg_minutes,0),
 coalesce(a.xa_games,0),coalesce(a.xa_minutes,0),
 a.xg_total,a.xa_total,
 CASE WHEN a.xg_games>=2 AND a.xg_minutes>=180
   THEN round(a.xg_total*90/a.xg_minutes,6) ELSE NULL END,
 CASE WHEN a.xa_games>=2 AND a.xa_minutes>=180
   THEN round(a.xa_total*90/a.xa_minutes,6) ELSE NULL END,
 'FotMob_MH8_11_verified_match_level_exposure'
FROM scout_players p LEFT JOIN a ON a.player_id=p.id WHERE p.active
ON CONFLICT(season,player_id,to_gameweek) DO UPDATE
 SET played_games=EXCLUDED.played_games,played_minutes=EXCLUDED.played_minutes,
 xg_observed_games=EXCLUDED.xg_observed_games,
 xg_observed_minutes=EXCLUDED.xg_observed_minutes,
 xa_observed_games=EXCLUDED.xa_observed_games,
 xa_observed_minutes=EXCLUDED.xa_observed_minutes,
 xg_total=EXCLUDED.xg_total,xa_total=EXCLUDED.xa_total,
 xg_per90=EXCLUDED.xg_per90,xa_per90=EXCLUDED.xa_per90,
 source_name=EXCLUDED.source_name,updated_at=now();

-- Only replace cumulative ACTION counts when all playing weeks after the
-- historical GW5 baseline have trustworthy action rows. Legacy crosses,
-- takeons and xG/xA totals are unchanged if the evidence is partial.
WITH o AS(
 SELECT p.id player_id,count(w.player_id) FILTER(WHERE w.gameweek BETWEEN 6 AND 11
   AND w.is_final AND w.minutes>0) played_6_11
 FROM scout_players p LEFT JOIN scout_player_weekly_points w ON w.player_id=p.id
 WHERE p.active GROUP BY p.id
),
a AS(
 SELECT player_id,count(*) weekly_evidence,sum(shots) shots,
 sum(shots_on_target) shots_on_target,sum(key_passes) key_passes
 FROM scout_player_advanced_weekly WHERE season='2026-27'
 AND gameweek BETWEEN 6 AND 11 GROUP BY player_id
),
full_actions AS(
 SELECT o.player_id,o.played_6_11,coalesce(a.weekly_evidence,0) evidence,
 b.shots+coalesce(a.shots,0) shots,
 b.shots_on_target+coalesce(a.shots_on_target,0) shots_on_target,
 b.key_passes+coalesce(a.key_passes,0) key_passes
 FROM o JOIN scout_player_advanced_baseline b
 ON b.season='2026-27' AND b.player_id=o.player_id AND b.through_gameweek=5
 LEFT JOIN a ON a.player_id=o.player_id
)
UPDATE scout_player_season_stats s SET
 shots=full_actions.shots,shots_on_target=full_actions.shots_on_target,
 key_passes=full_actions.key_passes,
 advanced_actions_through_gameweek=11,
 advanced_actions_source='GW1-5 Sahadan baseline + GW6-11 source-verified per-week actions (FotMob/Highlightly)',
 advanced_actions_verified_appearances=full_actions.evidence,
 advanced_actions_played_appearances=full_actions.played_6_11,updated_at=now()
FROM full_actions WHERE s.season='2026-27' AND s.player_id=full_actions.player_id
 AND s.through_gameweek=11 AND full_actions.evidence=full_actions.played_6_11
 AND full_actions.shots>=full_actions.shots_on_target;

-- For incompletely covered players, expose the gap and DO NOT overwrite
-- existing historic action counts or misrepresent missing as 0.
WITH o AS(
 SELECT p.id player_id,count(w.player_id) FILTER(WHERE w.gameweek BETWEEN 6 AND 11
   AND w.is_final AND w.minutes>0) played
 FROM scout_players p LEFT JOIN scout_player_weekly_points w
 ON w.player_id=p.id WHERE p.active GROUP BY p.id
),
a AS(SELECT player_id,count(*) evidence FROM scout_player_advanced_weekly
 WHERE season='2026-27' AND gameweek BETWEEN 6 AND 11 GROUP BY player_id)
UPDATE scout_player_season_stats s SET
 advanced_actions_verified_appearances=coalesce(a.evidence,0),
 advanced_actions_played_appearances=o.played
FROM o LEFT JOIN a ON a.player_id=o.player_id
WHERE s.season='2026-27' AND s.player_id=o.player_id
 AND s.advanced_actions_through_gameweek IS DISTINCT FROM 11;

-- One-source recent complete team sample: 18 clubs × 4 MH8–MH11 FotMob games.
CREATE TABLE IF NOT EXISTS scout_team_recent_verified_advanced_window(
 season text NOT NULL,team_id bigint NOT NULL REFERENCES scout_teams(id),
 from_gameweek integer NOT NULL,to_gameweek integer NOT NULL,
 source_matches integer NOT NULL,
 attack_xg_per_match numeric NOT NULL,defense_xga_per_match numeric NOT NULL,
 shots_per_match numeric NOT NULL,shots_on_target_per_match numeric NOT NULL,
 opponent_shots_per_match numeric NOT NULL,
 possession_avg numeric,big_chances_avg numeric,big_chances_missed_per_match numeric,
 touches_in_box_per_match numeric,opponent_touches_in_box_per_match numeric,
 set_piece_xg_per_match numeric,opponent_set_piece_xg_per_match numeric,
 shot_accuracy numeric,xg_per_shot numeric,set_piece_xg_share numeric,
 opponent_set_piece_xg_share numeric,
 provider_matches integer NOT NULL DEFAULT 0,
 provider_crosses_per_match numeric,provider_cross_success_rate numeric,
 provider_takeons_per_match numeric,provider_takeon_success_rate numeric,
 provider_chances_created_per_match numeric,
 source_name text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(season,team_id,to_gameweek)
);
ALTER TABLE scout_team_recent_verified_advanced_window ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON scout_team_recent_verified_advanced_window FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON scout_team_recent_verified_advanced_window TO service_role;

WITH src AS(
 SELECT v.*,opp.shots opp_shots,opp.touches_in_opposition_box opp_touches,
  opp.set_piece_xg opp_set_piece_xg,opp.xg opp_xg
 FROM scout_verified_team_match_advanced v
 JOIN scout_verified_team_match_advanced opp
 ON opp.season=v.season AND opp.match_id=v.match_id
 AND opp.team_id=v.opponent_team_id
 WHERE v.season='2026-27' AND v.gameweek BETWEEN 8 AND 11
),
a AS(
 SELECT team_id,count(*) n,
 round(avg(xg),6) xg,round(avg(xga),6) xga,
 round(avg(shots),6) shots,round(avg(shots_on_target),6) sot,
 round(avg(opp_shots),6) opp_shots,
 round(avg(possession_pct),6) pos,
 round(avg(big_chances),6) bc,round(avg(big_chances_missed),6) bcm,
 round(avg(touches_in_opposition_box),6) touch,
 round(avg(opp_touches),6) opp_touch,
 round(avg(set_piece_xg),6) spxg,
 round(avg(opp_set_piece_xg),6) opp_spxg,
 sum(shots_on_target)::numeric/nullif(sum(shots),0) accuracy,
 sum(xg)/nullif(sum(shots),0) xg_shot,
 sum(set_piece_xg)/nullif(sum(xg),0) sp_share,
 sum(opp_set_piece_xg)/nullif(sum(opp_xg),0) opp_sp_share
 FROM src GROUP BY team_id
),
hl AS(
 SELECT team_id,count(*) n,
 round(avg(crosses),6) cross_avg,
 sum(successful_crosses)::numeric/nullif(sum(crosses),0) cross_rate,
 round(avg(dribbles),6) takeons,
 sum(successful_dribbles)::numeric/nullif(sum(dribbles),0) takeon_rate,
 round(avg(key_passes),6) chances
 FROM scout_highlightly_team_matches WHERE season='2026-27' AND gameweek<=11
 GROUP BY team_id
)
INSERT INTO scout_team_recent_verified_advanced_window(
 season,team_id,from_gameweek,to_gameweek,source_matches,
 attack_xg_per_match,defense_xga_per_match,shots_per_match,
 shots_on_target_per_match,opponent_shots_per_match,possession_avg,big_chances_avg,
 big_chances_missed_per_match,touches_in_box_per_match,opponent_touches_in_box_per_match,
 set_piece_xg_per_match,opponent_set_piece_xg_per_match,shot_accuracy,xg_per_shot,
 set_piece_xg_share,opponent_set_piece_xg_share,
 provider_matches,provider_crosses_per_match,provider_cross_success_rate,
 provider_takeons_per_match,provider_takeon_success_rate,provider_chances_created_per_match,
 source_name)
SELECT '2026-27',a.team_id,8,11,a.n,
 a.xg,a.xga,a.shots,a.sot,a.opp_shots,a.pos,a.bc,a.bcm,a.touch,a.opp_touch,
 a.spxg,a.opp_spxg,a.accuracy,a.xg_shot,a.sp_share,a.opp_sp_share,
 coalesce(hl.n,0),hl.cross_avg,hl.cross_rate,hl.takeons,hl.takeon_rate,hl.chances,
 'FotMob_MH8_11_verifiable_recent_window; Highlightly_own_provider_action_window'
FROM a LEFT JOIN hl ON hl.team_id=a.team_id
WHERE a.n=4
ON CONFLICT(season,team_id,to_gameweek) DO UPDATE
 SET source_matches=EXCLUDED.source_matches,attack_xg_per_match=EXCLUDED.attack_xg_per_match,
 defense_xga_per_match=EXCLUDED.defense_xga_per_match,
 shots_per_match=EXCLUDED.shots_per_match,
 shots_on_target_per_match=EXCLUDED.shots_on_target_per_match,
 opponent_shots_per_match=EXCLUDED.opponent_shots_per_match,
 possession_avg=EXCLUDED.possession_avg,big_chances_avg=EXCLUDED.big_chances_avg,
 big_chances_missed_per_match=EXCLUDED.big_chances_missed_per_match,
 touches_in_box_per_match=EXCLUDED.touches_in_box_per_match,
 opponent_touches_in_box_per_match=EXCLUDED.opponent_touches_in_box_per_match,
 set_piece_xg_per_match=EXCLUDED.set_piece_xg_per_match,
 opponent_set_piece_xg_per_match=EXCLUDED.opponent_set_piece_xg_per_match,
 shot_accuracy=EXCLUDED.shot_accuracy,xg_per_shot=EXCLUDED.xg_per_shot,
 set_piece_xg_share=EXCLUDED.set_piece_xg_share,
 opponent_set_piece_xg_share=EXCLUDED.opponent_set_piece_xg_share,
 provider_matches=EXCLUDED.provider_matches,
 provider_crosses_per_match=EXCLUDED.provider_crosses_per_match,
 provider_cross_success_rate=EXCLUDED.provider_cross_success_rate,
 provider_takeons_per_match=EXCLUDED.provider_takeons_per_match,
 provider_takeon_success_rate=EXCLUDED.provider_takeon_success_rate,
 provider_chances_created_per_match=EXCLUDED.provider_chances_created_per_match,
 updated_at=now();

-- Preserve old PPDA, side/channels and full-season xG aggregates as separate
-- historical windows. Refresh only the fields that are independently sourced.
UPDATE scout_team_tactical_profiles t SET
 advanced_profile_through_gameweek=11,
 advanced_profile_matches=w.source_matches,
 advanced_profile_source=
 'FotMob_MH8_11_reconciled_4_matches; Highlightly_actions_observed; PPDA_channels_legacy_preserved',
 possession_avg=w.possession_avg,
 touches_in_box_per_match=w.touches_in_box_per_match,
 shot_accuracy=w.shot_accuracy,xg_per_shot=w.xg_per_shot,
 set_piece_xg_per_match=w.set_piece_xg_per_match,
 set_piece_xg_share=w.set_piece_xg_share,
 big_chances_missed_per_match=w.big_chances_missed_per_match,
 opponent_touches_in_box_per_match=w.opponent_touches_in_box_per_match,
 opponent_shots_per_match=w.opponent_shots_per_match,
 opponent_set_piece_xg_per_match=w.opponent_set_piece_xg_per_match,
 opponent_set_piece_xg_share=w.opponent_set_piece_xg_share,
 crosses_per_match=w.provider_crosses_per_match,
 cross_success_rate=w.provider_cross_success_rate,
 takeons_per_match=w.provider_takeons_per_match,
 takeon_success_rate=w.provider_takeon_success_rate,
 chances_created_per_match=w.provider_chances_created_per_match,
 updated_at=now()
FROM scout_team_recent_verified_advanced_window w
WHERE w.season='2026-27' AND w.to_gameweek=11 AND w.source_matches=4
AND w.provider_matches>=6 AND t.season=w.season AND t.team_id=w.team_id;

-- Exact, non-fabricated readiness gates before changing the model.
DO $qa$
DECLARE total_active integer; source_players integer; source_teams integer;
BEGIN
 SELECT count(*) INTO total_active FROM scout_players WHERE active;
 SELECT count(*) INTO source_players FROM scout_player_recent_verified_advanced_window
  WHERE season='2026-27' AND from_gameweek=8 AND to_gameweek=11;
 SELECT count(*) INTO source_teams FROM scout_team_recent_verified_advanced_window
  WHERE season='2026-27' AND from_gameweek=8 AND to_gameweek=11
   AND source_matches=4;
 IF total_active<>456 OR source_players<>456 OR source_teams<>18
 THEN RAISE EXCEPTION 'Reconciliation exact roster/team coverage check failed: %/%/%',
 total_active,source_players,source_teams; END IF;
 IF (SELECT count(*) FROM scout_team_tactical_profiles
  WHERE season='2026-27' AND advanced_profile_through_gameweek=11)<>
 18 THEN RAISE EXCEPTION 'Team profiles not updated to MH11 recent verified window'; END IF;
 IF EXISTS(SELECT 1 FROM scout_player_recent_verified_advanced_window
 WHERE season='2026-27' AND to_gameweek=11 AND
 (xg_observed_games>played_games OR xa_observed_games>played_games OR
 xg_observed_minutes>played_minutes OR xa_observed_minutes>played_minutes OR
 xg_total<0 OR xa_total<0 OR xg_per90<0 OR xa_per90<0))
 THEN RAISE EXCEPTION 'Unverifiable player xG/xA exposure or negative rates'; END IF;
 IF EXISTS(SELECT 1 FROM scout_team_recent_verified_advanced_window
 WHERE season='2026-27' AND to_gameweek=11
 AND (shot_accuracy<0 OR shot_accuracy>1 OR set_piece_xg_share<0
 OR set_piece_xg_share>1 OR provider_matches<6))
 THEN RAISE EXCEPTION 'Team source window invalid'; END IF;
 IF (SELECT count(*) FROM scout_highlightly_targeted_readiness
 WHERE sufficient_matches=99 AND targeted_coverage_complete AND pending_api_calls_minimum=0)<>1
 THEN RAISE EXCEPTION '99/99 source capture prerequisite changed'; END IF;
END $qa$;
COMMIT;
