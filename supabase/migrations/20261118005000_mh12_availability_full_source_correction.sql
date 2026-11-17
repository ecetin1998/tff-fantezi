-- One-time source-supported correction on the CURRENT MH12 availability
-- layer only. Full 50K must be rebuilt separately; projections are untouched.
CREATE TABLE IF NOT EXISTS public.scout_availability_bulk_audit_log (
 run_id uuid NOT NULL,
 player_id integer NOT NULL,
 correction_tag text NOT NULL,
 before_record jsonb NOT NULL,
 after_record jsonb,
 source_reason text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(run_id,player_id,correction_tag)
);
ALTER TABLE public.scout_availability_bulk_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scout_availability_bulk_audit_log FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.scout_availability_bulk_audit_log TO service_role;

DO $guard$
BEGIN
 IF (SELECT count(*) FROM public.scout_model_runs
     WHERE is_current AND gameweek=12 AND status='ready')<>1
 THEN RAISE EXCEPTION 'Must have one current ready MH12 run'; END IF;
 IF (SELECT count(*) FROM public.scout_availability_full_audit)<>456
 THEN RAISE EXCEPTION 'Full active roster must be audited first'; END IF;
 IF (SELECT count(*) FROM public.scout_availability_full_audit
 WHERE audit_issue IN('expired_official_suspension','missing_official_suspension'))<>2
 THEN RAISE EXCEPTION 'Expected two TFF discrepancy cases'; END IF;
 IF (SELECT count(*) FROM public.scout_availability_full_audit
 WHERE audit_issue='long_term_injury_probability_too_high')<>3
 THEN RAISE EXCEPTION 'Expected three independently confirmed severe injuries'; END IF;
 IF (SELECT count(*) FROM public.scout_availability_full_audit
 WHERE audit_issue='secondary_only_injury_needs_review')<>15
 THEN RAISE EXCEPTION 'Expected 15 source-only injuries for caution review'; END IF;
END $guard$;

WITH r AS(SELECT id FROM public.scout_model_runs WHERE is_current AND gameweek=12),
flag AS(
 SELECT player_id,audit_issue FROM public.scout_availability_full_audit
 WHERE audit_issue<>'ok' OR player_id=182
)
INSERT INTO public.scout_availability_bulk_audit_log
(run_id,player_id,correction_tag,before_record,source_reason)
SELECT a.run_id,a.player_id,'mh12-full-source-review-20261118',to_jsonb(a),
flag.audit_issue
FROM public.scout_availability a JOIN r ON r.id=a.run_id
JOIN flag ON flag.player_id=a.player_id
ON CONFLICT DO NOTHING;

-- 1. Include 15 matched second-source injury reports as uncertain *risk*
-- rather than confident healthy or false official injury.
WITH r AS(SELECT id,gameweek FROM scout_model_runs WHERE is_current AND gameweek=12)
UPDATE public.scout_availability a SET
 availability_type='risk', availability_probability=0.65,
 reason='Sakatlık şüphesi (tek kaynak): '||coalesce(s.reason,'durumu teyitsiz'),
 canonical_reason='Sakatlık şüphesi (tek kaynak): '||coalesce(s.reason,'durumu teyitsiz'),
 source_url=s.source_url,source_reason=s.reason,
 checked_at=now(),detail_source_label='availability_secondary_unconfirmed',
 detail_source_url=s.source_url,detail_source_updated_at=now()
FROM r JOIN public.scout_availability_source_observations s
 ON s.season='2026-27' AND s.gameweek=r.gameweek
WHERE a.run_id=r.id AND a.player_id=s.player_id
 AND s.availability_type='injuries' AND NOT s.verified
 AND a.availability_type='baseline';

-- 2. A two-source confirmed long-duration cruciate/Achilles injury is not
-- 50% fit when return is many months after the fixture.
WITH r AS(SELECT id,gameweek FROM scout_model_runs WHERE is_current AND gameweek=12)
UPDATE public.scout_availability a SET
 availability_probability=0,
 expected_return_date=s.source_return,expected_return=NULL,
 checked_at=now(),detail_source_label='availability_two_source_longterm_verified',
 detail_source_url=s.source_url,detail_source_updated_at=now()
FROM r JOIN public.scout_availability_source_observations s
 ON s.season='2026-27' AND s.gameweek=r.gameweek
WHERE a.run_id=r.id AND a.player_id=s.player_id AND s.verified
 AND a.availability_type='injuries' AND s.source_return>DATE '2027-02-01'
 AND a.player_id IN(95,222,339)
 AND a.availability_probability>0;

-- 3. Official TFF sanctions take precedence over lagging third-party reports.
WITH r AS(SELECT id,gameweek FROM scout_model_runs WHERE is_current AND gameweek=12),
v AS(SELECT c.* FROM scout_verified_disciplinary_cases c CROSS JOIN r
 WHERE c.season='2026-27' AND c.offense_gameweek<r.gameweek
 AND c.player_id IN(182,533,600))
UPDATE public.scout_availability a SET
 availability_type=CASE WHEN r.gameweek=ANY(v.affected_gameweeks)
                    THEN 'suspensions' ELSE 'baseline' END,
 availability_probability=CASE WHEN r.gameweek=ANY(v.affected_gameweeks)
                    THEN 0 ELSE 1 END,
 reason=CASE WHEN r.gameweek=ANY(v.affected_gameweeks)
                    THEN v.reason ELSE NULL END,
 canonical_reason=CASE WHEN r.gameweek=ANY(v.affected_gameweeks)
                    THEN v.reason ELSE NULL END,
 source_reason=CASE WHEN r.gameweek=ANY(v.affected_gameweeks)
                    THEN v.reason ELSE NULL END,
 suspension_end=NULL,injury_date=NULL,expected_return=NULL,
 expected_return_date=NULL,
 suspension_fixture=CASE WHEN r.gameweek=ANY(v.affected_gameweeks)
   THEN to_char(f.kickoff_at AT TIME ZONE 'Europe/Istanbul','DD.MM.YYYY')
     ||' • '||f.home_team_name||' - '||f.away_team_name
   ELSE NULL END,
 checked_at=now(),source_url=v.source_url,
 detail_source_label=CASE WHEN r.gameweek=ANY(v.affected_gameweeks)
    THEN 'tff_official_disciplinary_verdict' ELSE 'tff_official_suspension_served' END,
 detail_source_url=v.source_url,detail_source_updated_at=now()
FROM r JOIN v ON true
JOIN public.scout_match_history f ON f.season='2026-27'
 AND f.gameweek=r.gameweek AND
 (f.home_team_id=v.team_id OR f.away_team_id=v.team_id)
WHERE a.run_id=r.id AND a.player_id=v.player_id;

-- 4. Cross-confirmed club, training, and injury reports override an
-- unverified one-source risk; a return to training is NEVER 100% fit.
WITH r AS(SELECT id,gameweek FROM scout_model_runs WHERE is_current AND gameweek=12)
UPDATE public.scout_availability a SET
 availability_type=h.availability_type,
 availability_probability=h.availability_probability,
 reason=h.reason,canonical_reason=h.reason,
 source_url=h.source_url,source_reason=h.reason,
 checked_at=now(),detail_source_label='independently_verified_health_update',
 detail_source_url=h.source_url,detail_source_updated_at=now(),
 expected_return=NULL,expected_return_date=NULL
FROM r JOIN scout_verified_health_observations h
 ON h.season='2026-27' AND r.gameweek BETWEEN h.first_gameweek AND h.last_gameweek
WHERE a.run_id=r.id AND a.player_id=h.player_id;

UPDATE public.scout_availability_bulk_audit_log l
SET after_record=to_jsonb(a)
FROM public.scout_availability a
WHERE l.run_id=a.run_id AND l.player_id=a.player_id
 AND l.correction_tag='mh12-full-source-review-20261118';

DO $validate$
DECLARE r uuid;
BEGIN
 SELECT id INTO r FROM public.scout_model_runs WHERE is_current AND gameweek=12;
 IF (SELECT count(*) FROM scout_availability WHERE run_id=r)<>456
 THEN RAISE EXCEPTION 'Current MH12 availability row count changed'; END IF;
 IF (SELECT count(*) FROM public.scout_availability a WHERE a.run_id=r
 AND ((player_id=533 AND (availability_type<>'baseline' OR availability_probability<>1))
    OR (player_id=182 AND (availability_type<>'suspensions' OR availability_probability<>0))
    OR (player_id=600 AND (availability_type<>'suspensions' OR availability_probability<>0))
    OR (player_id IN(95,222,339,1538) AND (availability_type<>'injuries' OR availability_probability<>0))
    OR (player_id=467 AND (availability_type<>'risk' OR availability_probability<>0.75))
    OR (player_id IN(301,28) AND (availability_type<>'injuries' OR availability_probability<>0.5))))>0
 THEN RAISE EXCEPTION 'One or more independently verified source corrections failed'; END IF;
 IF EXISTS(SELECT 1 FROM scout_availability_full_audit WHERE audit_issue<>'ok')
 THEN RAISE EXCEPTION 'Unresolved auto-audit discrepancies remain'; END IF;
 IF (SELECT count(*) FROM scout_availability_bulk_audit_log
 WHERE run_id=r AND correction_tag='mh12-full-source-review-20261118'
 AND after_record IS NOT NULL)<>21
 THEN RAISE EXCEPTION 'Missing before/after audit of 21 reviewed candidates'; END IF;
END $validate$;
