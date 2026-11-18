-- Canonical identity, independently checked against official TFF player
-- YİĞİT HAMZA AYDAR (kisiID=2020894), club Gençlerbirliği,
-- and the current primary roster entry "Hamza Aydar", id 1605.
-- https://www.tff.org/Default.aspx?kisiID=2020894&pageID=30
-- Original provider uses shorter "Yigit Aydar"; no player transfer.
BEGIN;
DO $qa$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM scout_players
 WHERE id=1605 AND active=true AND team_id=11 AND full_name='Hamza Aydar')
 THEN RAISE EXCEPTION 'Canonical TFF Hamza Aydar ID/team mismatch'; END IF;
 IF (SELECT count(*) FROM scout_highlightly_player_matches h
 JOIN scout_player_weekly_points w ON w.player_id=1605
 AND w.gameweek=h.gameweek AND w.match_id=h.match_id AND w.is_final AND w.minutes>0
 WHERE h.season='2026-27' AND h.team_id=11
 AND h.provider_player_id=88691995 AND h.player_name='Yigit Aydar'
 AND h.player_id IS NULL AND abs(w.minutes-h.minutes)<=8
 AND h.gameweek IN(7,10,11))<>3
 THEN RAISE EXCEPTION 'TFF player source evidence mismatch in MH7,10,11'; END IF;
 IF EXISTS(SELECT 1 FROM scout_highlightly_player_matches x
 WHERE x.player_id=1605 AND x.match_id IN(317842,317869,317882)
 AND x.provider_player_id<>88691995)
 THEN RAISE EXCEPTION 'Duplicate Hamza Aydar match identity'; END IF;
END $qa$;

INSERT INTO scout_highlightly_player_aliases(
 season,provider_player_id,team_id,player_id,provider_name,
 canonical_name,verification_method,evidence)
VALUES('2026-27',88691995,11,1605,'Yigit Aydar','Hamza Aydar',
 'team_full_name_review',
 jsonb_build_object('tff_official_name','Yiğit Hamza Aydar',
 'tff_player_id',2020894,
 'source_url','https://www.tff.org/Default.aspx?kisiID=2020894&pageID=30',
 'official_matches',jsonb_build_array(317842,317869,317882),
 'source_minutes_diff_tolerance',8))
ON CONFLICT(season,provider_player_id,team_id) DO NOTHING;

UPDATE scout_highlightly_player_matches SET player_id=1605
WHERE season='2026-27' AND team_id=11 AND provider_player_id=88691995
AND player_name='Yigit Aydar' AND player_id IS NULL
AND match_id IN(317842,317869,317882);

INSERT INTO scout_player_advanced_weekly(
 season,gameweek,player_id,shots,shots_on_target,key_passes,
 crosses,successful_crosses,takeons,successful_takeons,source,source_updated_at)
SELECT '2026-27',h.gameweek,h.player_id,h.shots,h.shots_on_target,h.key_passes,
 0,0,h.dribbles,h.successful_dribbles,
 'Highlightly_MH7_TFF_2020894_verified_alias • crosses_unknown',now()
FROM scout_highlightly_player_matches h
JOIN scout_player_weekly_points w ON w.player_id=h.player_id
AND w.match_id=h.match_id AND w.gameweek=h.gameweek
AND w.is_final AND w.minutes>0 AND abs(w.minutes-h.minutes)<=8
WHERE h.season='2026-27' AND h.player_id=1605 AND h.gameweek=7
AND h.shots>=h.shots_on_target AND h.key_passes>=0
ON CONFLICT(season,gameweek,player_id) DO NOTHING;

WITH s AS (
 SELECT b.player_id,b.shots+sum(w.shots) shots,
 b.shots_on_target+sum(w.shots_on_target) sot,
 b.key_passes+sum(w.key_passes) key_passes,
 count(*) n
 FROM scout_player_advanced_baseline b
 JOIN scout_player_advanced_weekly w ON w.season=b.season AND w.player_id=b.player_id
 AND w.gameweek BETWEEN 6 AND 11
 WHERE b.season='2026-27' AND b.player_id=1605 AND b.through_gameweek=5
 GROUP BY b.player_id,b.shots,b.shots_on_target,b.key_passes
)
UPDATE scout_player_season_stats p SET
 shots=s.shots,shots_on_target=s.sot,key_passes=s.key_passes,
 advanced_actions_through_gameweek=11,
 advanced_actions_verified_appearances=s.n,
 advanced_actions_played_appearances=s.n,
 advanced_actions_source='GW1-5 reviewed baseline + MH6-11 source, Yiğit Hamza Aydar TFF identity verified',
 updated_at=now()
FROM s WHERE p.season='2026-27' AND p.player_id=1605 AND s.n=3 AND s.shots>=s.sot;

DO $qa$
BEGIN
 IF (SELECT count(*) FROM scout_player_season_stats s
 JOIN scout_players p ON p.id=s.player_id AND p.active
 WHERE s.season='2026-27' AND s.advanced_actions_through_gameweek=11
 AND s.advanced_actions_verified_appearances=s.advanced_actions_played_appearances)
 <>456 THEN RAISE EXCEPTION 'Expected ALL 456 active player action profiles fully reconciled'; END IF;
 IF (SELECT count(*) FROM scout_highlightly_player_matches
 WHERE season='2026-27' AND player_id=1605 AND provider_player_id=88691995
 AND gameweek IN(7,10,11))<>3
 THEN RAISE EXCEPTION 'Provider alias not linked to 3 historical games'; END IF;
END $qa$;
COMMIT;