-- MH7 2026-10-11 Gaziantep FK 0-3 Çorum FK: missing provider xG repair.
-- Match id 317838, teams home=18 away=8.
-- Canonical TEAM xG from the same FotMob match-page model used for MH8-MH11.
-- FotMob: https://www.fotmob.com/tr/matches/gaziantep-fk-vs-corum-fk/tzrbrsj
-- Exact match crosscheck: https://web-production-a0606.up.railway.app/match/gaziantep-fk-vs-corum-fk-2026-10-11/stats
-- Alternative provider xgEdge reports DIFFERENT shot-model figures; never mix with FotMob.
-- xG does NOT imply source player xG/xA values: those remain unknown.
-- Shot counts from existing Match Pulse shot zones; SoT/possession from
-- independent Highlightly recorded statistics. Keep per-metric provenance.
CREATE TABLE IF NOT EXISTS public.scout_verified_match_metric_provenance (
 season text NOT NULL,
 gameweek integer NOT NULL,
 match_id bigint NOT NULL,
 team_id bigint NOT NULL,
 metric text NOT NULL,
 value numeric NOT NULL,
 source_name text NOT NULL,
 source_url text NOT NULL,
 corroboration_url text,
 note text,
 verified_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (season,gameweek,match_id,team_id,metric)
);
ALTER TABLE public.scout_verified_match_metric_provenance ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scout_verified_match_metric_provenance FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE ON public.scout_verified_match_metric_provenance TO service_role;

DO $$
DECLARE fixture record;
BEGIN
 SELECT * INTO fixture FROM public.scout_match_history
 WHERE season='2026-27' AND gameweek=7 AND match_id=317838;
 IF NOT FOUND OR fixture.home_team_id<>18 OR fixture.away_team_id<>8
   OR fixture.home_goals<>0 OR fixture.away_goals<>3
   OR fixture.match_status<>'Bitti' THEN
   RAISE EXCEPTION 'MH7 Gaziantep-Corum fixture identity/score not verified';
 END IF;
 IF (SELECT count(*) FROM public.scout_team_match_shot_zones
     WHERE season='2026-27' AND match_id=317838 AND
     ((team_id=18 AND shots=12) OR (team_id=8 AND shots=13))) <> 2 THEN
   RAISE EXCEPTION 'MH7 shot provenance mismatch';
 END IF;
 IF (SELECT count(*) FROM public.scout_highlightly_team_matches
     WHERE season='2026-27' AND match_id=317838 AND
     ((team_id=18 AND shots_on_target=1) OR
      (team_id=8 AND shots_on_target=7))) <> 2 THEN
   RAISE EXCEPTION 'MH7 shots on target provenance mismatch';
 END IF;
 IF EXISTS (SELECT 1 FROM public.scout_verified_team_match_advanced
    WHERE season='2026-27' AND gameweek=7 AND match_id=317838
      AND (source_kind <> 'fotmob_match_page_xg_matchpulse_shots_highlightly_sot_mh7' OR
      (team_id=18 AND (xg<>0.99 OR xga<>2.67)) OR
      (team_id=8 AND (xg<>2.67 OR xga<>0.99)))) THEN
   RAISE EXCEPTION 'Existing verified source must not be overwritten';
 END IF;
END $$;

WITH values_verified(team_id,xg,xga,opp_team_id) AS (
 VALUES (18::bigint,0.99::numeric,2.67::numeric,8::bigint),
        (8::bigint,2.67::numeric,0.99::numeric,18::bigint)
)
INSERT INTO public.scout_verified_team_match_advanced
 (season,gameweek,match_id,team_id,opponent_team_id,xg,xga,
  shots,shots_on_target,opponent_shots_on_target,possession_pct,
  source_kind,source_observed_at)
SELECT '2026-27',7,317838,v.team_id,v.opp_team_id,v.xg,v.xga,
  z.shots,h.shots_on_target,opp.shots_on_target,round(h.possession*100,2),
  'fotmob_match_page_xg_matchpulse_shots_highlightly_sot_mh7',now()
FROM values_verified v
JOIN public.scout_team_match_shot_zones z
 ON z.season='2026-27' AND z.match_id=317838 AND z.team_id=v.team_id
JOIN public.scout_highlightly_team_matches h
 ON h.season='2026-27' AND h.match_id=317838 AND h.team_id=v.team_id
JOIN public.scout_highlightly_team_matches opp
 ON opp.season='2026-27' AND opp.match_id=317838 AND opp.team_id=v.opp_team_id
WHERE z.shots>=h.shots_on_target AND h.possession BETWEEN 0 AND 1
ON CONFLICT (season,gameweek,match_id,team_id) DO NOTHING;

WITH field_sources(team_id,metric,value,source_name,source_url,corroboration_url,note) AS (
 VALUES
 (18::bigint,'xg',0.99::numeric,'FotMob','https://www.fotmob.com/tr/matches/gaziantep-fk-vs-corum-fk/tzrbrsj','https://web-production-a0606.up.railway.app/match/gaziantep-fk-vs-corum-fk-2026-10-11/stats','FotMob full-time xG, crosschecked by Match Pulse and ilk11ler.com'),
 (8,'xg',2.67,'FotMob','https://www.fotmob.com/tr/matches/gaziantep-fk-vs-corum-fk/tzrbrsj','https://web-production-a0606.up.railway.app/match/gaziantep-fk-vs-corum-fk-2026-10-11/stats','FotMob full-time xG, crosschecked by Match Pulse and ilk11ler.com'),
 (18,'xga',2.67,'FotMob','https://www.fotmob.com/tr/matches/gaziantep-fk-vs-corum-fk/tzrbrsj',NULL,'Opponent verified xG'),
 (8,'xga',0.99,'FotMob','https://www.fotmob.com/tr/matches/gaziantep-fk-vs-corum-fk/tzrbrsj',NULL,'Opponent verified xG'),
 (18,'shots',12,'Match Pulse','https://web-production-a0606.up.railway.app/match/gaziantep-fk-vs-corum-fk-2026-10-11/stats',NULL,'Shot zones: inside 7, outside 5'),
 (8,'shots',13,'Match Pulse','https://web-production-a0606.up.railway.app/match/gaziantep-fk-vs-corum-fk-2026-10-11/stats',NULL,'Shot zones: inside 11, outside 2; Highlightly reports 12, retain source distinction'),
 (18,'shots_on_target',1,'Highlightly','https://soccer.highlightly.net/matches/1348346459',NULL,'Provider match statistics'),
 (8,'shots_on_target',7,'Highlightly','https://soccer.highlightly.net/matches/1348346459',NULL,'Provider match statistics'),
 (18,'opponent_shots_on_target',7,'Highlightly','https://soccer.highlightly.net/matches/1348346459',NULL,'Opponent provider match statistics'),
 (8,'opponent_shots_on_target',1,'Highlightly','https://soccer.highlightly.net/matches/1348346459',NULL,'Opponent provider match statistics')
)
INSERT INTO public.scout_verified_match_metric_provenance
(season,gameweek,match_id,team_id,metric,value,source_name,source_url,corroboration_url,note)
SELECT '2026-27',7,317838,team_id,metric,value,source_name,source_url,corroboration_url,note
FROM field_sources
ON CONFLICT (season,gameweek,match_id,team_id,metric) DO NOTHING;

DO $$
BEGIN
 IF (SELECT count(*) FROM public.scout_verified_team_match_advanced
     WHERE season='2026-27' AND match_id=317838 AND gameweek=7
       AND source_kind='fotmob_match_page_xg_matchpulse_shots_highlightly_sot_mh7')<>2
 THEN RAISE EXCEPTION 'MH7 verified team-advanced backfill incomplete'; END IF;
 IF (SELECT count(*) FROM public.scout_verified_match_metric_provenance
     WHERE season='2026-27' AND match_id=317838 AND gameweek=7)<>10
 THEN RAISE EXCEPTION 'MH7 field-provenance audit incomplete'; END IF;
END $$;
