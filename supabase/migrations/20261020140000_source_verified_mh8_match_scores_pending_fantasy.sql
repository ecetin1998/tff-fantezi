-- 2026-10-20 TFF-certified final SCORES ONLY for 2026-27 MH8.
-- Official source: https://www.tff.org/default.aspx?ftxtID=2966&pageID=600
-- Preserves official Fantasy point closure as PENDING; no player points created.
-- The fixture planner is synchronized separately from frozen 50K snapshots.
BEGIN;
DO $verify$
DECLARE
  matching int; fixture_matching int;
BEGIN
  WITH v(match_id,home_team_id,away_team_id,hg,ag) AS (VALUES
    (317847,8,12,2,1),(317848,2,16,2,0),(317849,5,7,1,0),
    (317850,11,17,0,1),(317851,6,14,3,0),(317852,3,15,4,1),
    (317853,4,10,1,2),(317854,13,18,2,1),(317855,1,9,2,0)
  )
  SELECT count(*) INTO matching FROM public.scout_match_history h JOIN v
  ON h.match_id=v.match_id AND h.home_team_id=v.home_team_id
     AND h.away_team_id=v.away_team_id
  WHERE h.gameweek=8 AND h.season='2026-27'
    AND (h.home_goals IS NULL OR h.home_goals=v.hg)
    AND (h.away_goals IS NULL OR h.away_goals=v.ag)
    AND coalesce(h.fantasy_closure,'')<>'KAPANDI';
  IF matching<>9 THEN RAISE EXCEPTION 'MH8 canonical match IDs/team pairs/scores or closure changed: matched % instead of 9',matching; END IF;

  WITH v(match_id,home_team_id,away_team_id,hg,ag) AS (VALUES
    (317847,8,12,2,1),(317848,2,16,2,0),(317849,5,7,1,0),
    (317850,11,17,0,1),(317851,6,14,3,0),(317852,3,15,4,1),
    (317853,4,10,1,2),(317854,13,18,2,1),(317855,1,9,2,0)
  )
  SELECT count(*) INTO fixture_matching FROM public.fixtures f JOIN v
  ON f.gameweek=8 AND f.home_team_id=v.home_team_id AND f.away_team_id=v.away_team_id;
  IF fixture_matching<>9 THEN RAISE EXCEPTION 'MH8 fixture plan mismatch: % / 9',fixture_matching; END IF;
END
$verify$;
WITH v(match_id,home_team_id,away_team_id,hg,ag) AS (VALUES
    (317847,8,12,2,1),(317848,2,16,2,0),(317849,5,7,1,0),
    (317850,11,17,0,1),(317851,6,14,3,0),(317852,3,15,4,1),
    (317853,4,10,1,2),(317854,13,18,2,1),(317855,1,9,2,0)
)
UPDATE public.scout_match_history h
SET home_goals=v.hg,away_goals=v.ag,match_status='Bitti',
    fantasy_closure='PUAN KONTROLÜ BEKLENİYOR',source_updated_at=now()
FROM v
WHERE h.match_id=v.match_id AND h.gameweek=8 AND h.season='2026-27'
 AND h.home_team_id=v.home_team_id AND h.away_team_id=v.away_team_id
 AND (h.home_goals IS DISTINCT FROM v.hg OR h.away_goals IS DISTINCT FROM v.ag
      OR h.match_status IS DISTINCT FROM 'Bitti'
      OR h.fantasy_closure IS DISTINCT FROM 'PUAN KONTROLÜ BEKLENİYOR');
WITH v(home_team_id,away_team_id) AS (VALUES
  (8,12),(2,16),(5,7),(11,17),(6,14),(3,15),(4,10),(13,18),(1,9)
)
UPDATE public.fixtures f
SET is_finished=true FROM v
WHERE f.gameweek=8 AND f.home_team_id=v.home_team_id AND f.away_team_id=v.away_team_id
  AND f.is_finished IS DISTINCT FROM true;
COMMIT;
