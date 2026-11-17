-- Current MH12: a fully served, officially verified TFF ban must not keep
-- a "1 maç cezalı" card reason from an older third-party website.
-- Source-only correctness: never alter immutable backtests or 50K model.
-- Preserve existing schema, triggers and all other normalization behavior.
CREATE OR REPLACE FUNCTION private.normalize_scout_availability_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  IF new.availability_type='baseline'
     AND new.detail_source_label='tff_official_suspension_served' THEN
    new.reason:=NULL;
    new.source_reason:=NULL;
    IF new.detail_source_url IS NOT NULL THEN
      new.source_url:=new.detail_source_url;
    END IF;
  END IF;
  new.canonical_reason:=private.canonical_availability_reason(
    new.reason,new.source_reason,new.source_url,
    new.detail_source_label,new.detail_source_url
  );
  new.expected_return_date:=private.parse_expected_return_date(new.expected_return);
  RETURN new;
END;
$function$;

-- Maintain an explicit before/after record for current active source display.
INSERT INTO public.scout_availability_bulk_audit_log
(run_id,player_id,correction_tag,before_record,source_reason)
SELECT a.run_id,a.player_id,'mh12-served-ban-public-reason-20261118',
       to_jsonb(a),'remove stale third-party canonical suspension reason after TFF ban is served'
FROM public.scout_availability a
JOIN public.scout_model_runs r ON r.id=a.run_id AND r.is_current
WHERE r.gameweek=12 AND a.availability_type='baseline'
 AND a.detail_source_label='tff_official_suspension_served'
 AND (a.canonical_reason IS NOT NULL OR a.source_reason IS NOT NULL)
ON CONFLICT DO NOTHING;

UPDATE public.scout_availability a
SET reason=NULL,source_reason=NULL,
    source_url=detail_source_url,
    canonical_reason=NULL
FROM public.scout_model_runs r
WHERE r.id=a.run_id AND r.is_current AND r.gameweek=12
 AND a.availability_type='baseline'
 AND a.detail_source_label='tff_official_suspension_served'
 AND a.detail_source_url LIKE 'https://www.tff.org/%';

UPDATE public.scout_availability_bulk_audit_log l
SET after_record=to_jsonb(a)
FROM public.scout_availability a
WHERE l.run_id=a.run_id AND l.player_id=a.player_id
 AND l.correction_tag='mh12-served-ban-public-reason-20261118';

DO $verify$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.scout_availability a
 JOIN public.scout_model_runs r ON r.id=a.run_id AND r.is_current
 WHERE r.gameweek=12 AND a.player_id=533
 AND a.availability_type='baseline' AND a.availability_probability=1
 AND a.reason IS NULL AND a.canonical_reason IS NULL AND a.source_reason IS NULL
 AND a.source_url LIKE 'https://www.tff.org/%') THEN
   RAISE EXCEPTION 'Abdulkerim served suspension still carries obsolete public reason';
 END IF;
 IF EXISTS(SELECT 1 FROM public.scout_availability a
 JOIN public.scout_model_runs r ON r.id=a.run_id AND r.is_current
 WHERE a.availability_type='baseline'
 AND a.detail_source_label='tff_official_suspension_served'
 AND (a.canonical_reason IS NOT NULL OR a.source_reason IS NOT NULL)) THEN
   RAISE EXCEPTION 'Served TFF suspension contains stale reason';
 END IF;
 IF (SELECT count(*) FROM public.scout_availability_bulk_audit_log
 WHERE correction_tag='mh12-served-ban-public-reason-20261118'
 AND after_record IS NOT NULL)<>1 THEN
   RAISE EXCEPTION 'Served TFF ban card reason repair not audited exactly once';
 END IF;
END $verify$;