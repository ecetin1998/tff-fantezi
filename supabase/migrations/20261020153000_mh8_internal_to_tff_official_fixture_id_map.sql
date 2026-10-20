-- 2026-27 MH8 identity correction. The internal model/backtest match IDs
-- are NOT the same as the official TFF macID values for their actual games.
-- Preserve all internal fixture IDs; join this mapping only at source ingest.
-- Every external ID verified via the TFF official "Detaylar" page.
BEGIN;
CREATE TABLE IF NOT EXISTS public.scout_match_external_ids (
  season text NOT NULL,
  gameweek integer NOT NULL CHECK (gameweek BETWEEN 1 AND 38),
  internal_match_id bigint NOT NULL,
  source text NOT NULL CHECK (source = 'tff'),
  external_match_id bigint NOT NULL,
  source_url text NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (season, internal_match_id, source),
  UNIQUE (season, external_match_id, source),
  CONSTRAINT match_external_history_fk FOREIGN KEY
    (internal_match_id,season)
    REFERENCES public.scout_match_history (match_id,season)
);
ALTER TABLE public.scout_match_external_ids ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scout_match_external_ids FROM anon,authenticated;
DO $validate$
DECLARE matched int; conflicted int;
BEGIN
  WITH v(internal_match_id,official_match_id,home_id,away_id,hg,ag) AS (VALUES
  (317847,317852,8,12,2,1),
  (317848,317855,2,16,2,0),
  (317849,317850,5,7,1,0),
  (317850,317851,11,17,0,1),
  (317851,317853,6,14,3,0),
  (317852,317848,3,15,4,1),
  (317853,317854,4,10,1,2),
  (317854,317849,13,18,2,1),
  (317855,317847,1,9,2,0)
  )
  SELECT count(*) INTO matched FROM public.scout_match_history h JOIN v
    ON h.match_id=v.internal_match_id AND h.season='2026-27' AND h.gameweek=8
    AND h.home_team_id=v.home_id AND h.away_team_id=v.away_id
    AND h.home_goals=v.hg AND h.away_goals=v.ag;
  IF matched<>9 THEN RAISE EXCEPTION 'MH8 external TFF identity input mismatch: % of 9',matched; END IF;
  WITH v(internal_match_id,official_match_id,home_id,away_id,hg,ag) AS (VALUES
  (317847,317852,8,12,2,1),
  (317848,317855,2,16,2,0),
  (317849,317850,5,7,1,0),
  (317850,317851,11,17,0,1),
  (317851,317853,6,14,3,0),
  (317852,317848,3,15,4,1),
  (317853,317854,4,10,1,2),
  (317854,317849,13,18,2,1),
  (317855,317847,1,9,2,0)
  )
  SELECT count(*) INTO conflicted
  FROM public.scout_match_external_ids m JOIN v
    ON m.season='2026-27' AND m.source='tff'
    AND (m.internal_match_id=v.internal_match_id OR m.external_match_id=v.official_match_id)
  WHERE NOT (m.internal_match_id=v.internal_match_id AND m.external_match_id=v.official_match_id);
  IF conflicted>0 THEN RAISE EXCEPTION 'Conflicting TFF ID mapping; requires manual reconciliation'; END IF;
END
$validate$;
WITH v(internal_match_id,official_match_id,home_id,away_id,hg,ag) AS (VALUES
  (317847,317852,8,12,2,1),
  (317848,317855,2,16,2,0),
  (317849,317850,5,7,1,0),
  (317850,317851,11,17,0,1),
  (317851,317853,6,14,3,0),
  (317852,317848,3,15,4,1),
  (317853,317854,4,10,1,2),
  (317854,317849,13,18,2,1),
  (317855,317847,1,9,2,0)
)
INSERT INTO public.scout_match_external_ids
 (season,gameweek,internal_match_id,source,external_match_id,source_url)
SELECT '2026-27',8,v.internal_match_id,'tff',v.official_match_id,
       'https://www.tff.org/Default.aspx?macID='||v.official_match_id||'&pageID=29'
FROM v
ON CONFLICT (season,internal_match_id,source) DO NOTHING;
DO $verify$
DECLARE n int; distinct_official int;
BEGIN
  SELECT count(*),count(DISTINCT external_match_id)
    INTO n,distinct_official FROM public.scout_match_external_ids
   WHERE gameweek=8 AND season='2026-27' AND source='tff';
  IF n<>9 OR distinct_official<>9 THEN RAISE EXCEPTION 'Expected nine distinct verified TFF source links'; END IF;
END
$verify$;
COMMIT;
