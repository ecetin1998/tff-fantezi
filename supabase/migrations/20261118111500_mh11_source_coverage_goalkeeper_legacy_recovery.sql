-- Source QA completion: recover 3 fully observed historical GW1–5
-- action baselines, and goalkeeper zero SHOTS (not unmeasured key passes)
-- for GW8–9/10. Preserve one unresolved player identity gap.
BEGIN;

-- Three new active roster members lacked the legacy GW5 baseline even though
-- their pre-GW6 appearances are fully match-ID/club/minute sourced.
WITH official AS (
 SELECT w.player_id,w.gameweek,w.match_id,w.minutes
 FROM scout_player_weekly_points w WHERE w.player_id IN(85,391,396)
  AND w.gameweek<=5 AND w.is_final AND w.minutes>0
), candidates AS (
 SELECT w.player_id,w.gameweek,h.shots,h.shots_on_target,h.key_passes,
 h.dribbles,h.successful_dribbles
 FROM official w JOIN scout_highlightly_player_matches h
 ON h.season='2026-27' AND h.player_id=w.player_id
 AND h.match_id=w.match_id AND h.gameweek=w.gameweek
 AND abs(h.minutes-w.minutes)<=2
)
INSERT INTO scout_player_advanced_baseline(
 season,player_id,through_gameweek,shots,shots_on_target,
 key_passes,crosses,successful_crosses,takeons,successful_takeons)
SELECT '2026-27',c.player_id,5,sum(c.shots)::integer,
 sum(c.shots_on_target)::integer,sum(c.key_passes)::integer,
 0,0,sum(c.dribbles)::integer,sum(c.successful_dribbles)::integer
FROM candidates c GROUP BY c.player_id
HAVING (count(*)=4 AND c.player_id=85)
 OR(count(*)=1 AND c.player_id IN(391,396))
ON CONFLICT(season,player_id) DO NOTHING;

-- FotMob reconciled shots explicitly prove GK zero attempts; FotMob does NOT
-- provide GK key-pass values. A required NOT NULL weekly column is written
-- with placeholder 0 but source permanently signals UNMEASURED, and the
-- canonical season key_passes is intentionally left unchanged for GKs.
WITH candidate AS (
 SELECT v.player_id,v.gameweek,v.shots,v.shots_on_target
 FROM scout_verified_weekly_attack_reconciled v
 JOIN scout_players p ON p.id=v.player_id AND p.active AND p.position='GK'
 JOIN scout_player_weekly_points w ON w.player_id=v.player_id
 AND w.gameweek=v.gameweek AND w.match_id=v.match_id
 AND w.is_final AND w.minutes>0
 WHERE v.season='2026-27' AND v.gameweek BETWEEN 6 AND 11
 AND v.shots=0 AND v.shots_on_target=0
 AND v.key_passes IS NULL
)
INSERT INTO scout_player_advanced_weekly(
 season,gameweek,player_id,shots,shots_on_target,key_passes,
 crosses,successful_crosses,takeons,successful_takeons,source,source_updated_at)
SELECT '2026-27',gameweek,player_id,0,0,0,0,0,0,0,
 'FotMob_verified_GK_zero_shots • key_passes_UNMEASURED_not_zero',now()
FROM candidate ON CONFLICT(season,gameweek,player_id) DO NOTHING;

WITH o AS(
 SELECT p.id player_id,p.position,
 count(w.player_id) FILTER(WHERE w.gameweek BETWEEN 6 AND 11 AND w.is_final AND w.minutes>0) played_6_11
 FROM scout_players p LEFT JOIN scout_player_weekly_points w ON w.player_id=p.id
 WHERE p.active GROUP BY p.id,p.position
), a AS(
 SELECT player_id,count(*) n,sum(shots) shots,sum(shots_on_target) sot,
 sum(key_passes) keys,
 count(*) FILTER(WHERE source ILIKE '%key_passes_UNMEASURED%') key_unknown_games
 FROM scout_player_advanced_weekly
 WHERE season='2026-27' AND gameweek BETWEEN 6 AND 11
 GROUP BY player_id
), complete AS(
 SELECT o.player_id,o.position,o.played_6_11,coalesce(a.n,0) observed,
 b.shots+coalesce(a.shots,0) shots,
 b.shots_on_target+coalesce(a.sot,0) sot,
 b.key_passes+coalesce(a.keys,0) keys,coalesce(a.key_unknown_games,0) key_unknown_games
 FROM o JOIN scout_player_advanced_baseline b ON b.season='2026-27'
 AND b.player_id=o.player_id AND b.through_gameweek=5
 LEFT JOIN a ON a.player_id=o.player_id
)
UPDATE scout_player_season_stats s SET
 shots=c.shots,shots_on_target=c.sot,
 key_passes=CASE WHEN c.key_unknown_games>0 THEN s.key_passes ELSE c.keys END,
 advanced_actions_through_gameweek=11,
 advanced_actions_source=CASE WHEN c.key_unknown_games>0
 THEN 'GW1-11 verified shot actions; goalkeeper keypasses missing in GW8-9'
 ELSE 'GW1-5 reviewed baseline + GW6-11 verified per-match action evidence' END,
 advanced_actions_verified_appearances=c.observed,
 advanced_actions_played_appearances=c.played_6_11,
 updated_at=now()
FROM complete c WHERE s.season='2026-27' AND s.player_id=c.player_id
 AND s.through_gameweek=11 AND c.observed=c.played_6_11
 AND c.shots>=c.sot;

DO $qa$
DECLARE updated integer;
BEGIN
 SELECT count(*) INTO updated
 FROM scout_player_season_stats s JOIN scout_players p ON p.id=s.player_id
 WHERE p.active AND s.season='2026-27'
 AND s.advanced_actions_through_gameweek=11;
 IF updated<>455 THEN RAISE EXCEPTION 'Expected 455/456 action-complete source rows; got %',updated; END IF;
 IF (SELECT count(*) FROM scout_player_season_stats s JOIN scout_players p ON p.id=s.player_id
 WHERE p.active AND s.season='2026-27' AND s.advanced_actions_through_gameweek IS DISTINCT FROM 11
 AND p.id=1605)<>1 THEN
 RAISE EXCEPTION 'Only unverified Hamza Aydar action identity should remain'; END IF;
 IF (SELECT count(*) FROM scout_player_advanced_weekly
 WHERE season='2026-27' AND source ILIKE '%key_passes_UNMEASURED%')<30
 THEN RAISE EXCEPTION 'Goalkeeper known-zero shot repair missing'; END IF;
 IF EXISTS(SELECT 1 FROM scout_player_season_stats s
 JOIN scout_players p ON p.id=s.player_id WHERE p.active
 AND s.advanced_actions_through_gameweek=11
 AND(s.shots<s.shots_on_target OR s.advanced_actions_verified_appearances<>s.advanced_actions_played_appearances))
 THEN RAISE EXCEPTION 'Shots / source appearances mismatch'; END IF;
END $qa$;
COMMIT;