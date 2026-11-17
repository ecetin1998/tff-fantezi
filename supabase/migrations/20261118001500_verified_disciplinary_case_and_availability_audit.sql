-- A disciplinary verdict is fixture-specific, unlike a scraped exception label.
-- The ban applies to the expressly audited affected matchweeks; it expires
-- after the last served fixture. Future cup/postponement changes require review.
CREATE TABLE IF NOT EXISTS public.scout_verified_disciplinary_cases (
 season text NOT NULL,
 player_id integer NOT NULL REFERENCES public.scout_players(id),
 team_id bigint NOT NULL,
 offense_gameweek integer NOT NULL,
 match_ban_count integer NOT NULL CHECK(match_ban_count>0 AND match_ban_count<=20),
 affected_gameweeks integer[] NOT NULL,
 reason text NOT NULL,
 source_name text NOT NULL,
 source_url text NOT NULL,
 appeal_url text,
 confirmed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (season,player_id,offense_gameweek),
 CONSTRAINT suspension_weeks_are_exact CHECK (
   cardinality(affected_gameweeks)=match_ban_count
   AND affected_gameweeks[1]>offense_gameweek
 )
);
ALTER TABLE public.scout_verified_disciplinary_cases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scout_verified_disciplinary_cases FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.scout_verified_disciplinary_cases TO service_role;

DO $$
BEGIN
 IF (SELECT count(*) FROM public.scout_players WHERE active
   AND ((id=533 AND team_id=17 AND full_name='Abdülkerim Bardakcı')
    OR (id=182 AND team_id=6 AND full_name='Archibald Norman Brown')
    OR (id=600 AND team_id=5 AND full_name='Samuel Leo Beat Ballet')))<>3
 THEN RAISE EXCEPTION 'Verified disciplinary case identity/team guard failed'; END IF;
 IF (SELECT count(*) FROM public.scout_match_history WHERE season='2026-27'
   AND match_status='Bitti' AND gameweek IN(10,11)
   AND (home_team_id=17 OR away_team_id=17))<>2
 THEN RAISE EXCEPTION 'Abdulkerim missed-match fixture count mismatch'; END IF;
 IF (SELECT count(*) FROM public.scout_match_history WHERE season='2026-27'
   AND match_status='Bitti' AND gameweek IN(10,11)
   AND (home_team_id=6 OR away_team_id=6))<>2
 THEN RAISE EXCEPTION 'Archie served-match fixture count mismatch'; END IF;
 IF (SELECT count(*) FROM public.scout_match_history WHERE season='2026-27'
   AND match_status='Bitti' AND gameweek=11
   AND (home_team_id=5 OR away_team_id=5))<>1
 THEN RAISE EXCEPTION 'Ballet served-match fixture count mismatch'; END IF;
END $$;

INSERT INTO public.scout_verified_disciplinary_cases
 (season,player_id,team_id,offense_gameweek,match_ban_count,affected_gameweeks,
  reason,source_name,source_url,appeal_url)
VALUES
 ('2026-27',533,17,9,2,ARRAY[10,11],
  'TFF PFDK 29.10.2026: 2 resmi müsabakadan men; MH10 ve MH11 oynandı',
  'TFF PFDK 29.10.2026',
  'https://www.tff.org/default.aspx?ftxtID=51771&pageID=246',
  'https://beinsports.com.tr/haber/tahkim-kurulu-abdulkerim-bardakcinin-cezasini-onadi'),
 ('2026-27',182,6,9,3,ARRAY[10,11,12],
  'TFF PFDK 29.10.2026: 3 resmi müsabakadan men; MH12 son maç',
  'TFF PFDK 29.10.2026',
  'https://www.tff.org/default.aspx?ftxtID=51771&pageID=246',
  'https://www.tff.org/Default.aspx?ftxtId=51850&pageId=200'),
 ('2026-27',600,5,10,3,ARRAY[11,12,13],
  'TFF PFDK 05.11.2026: 3 resmi müsabakadan men; MH11 ilk cezalı maç',
  'TFF PFDK 05.11.2026',
  'https://www.tff.org/default.aspx?ftxtID=51836&pageID=246',
  'https://www.tff.org/default.aspx?ftxtID=51950&pageID=247')
ON CONFLICT (season,player_id,offense_gameweek) DO UPDATE
 SET match_ban_count=EXCLUDED.match_ban_count,
     affected_gameweeks=EXCLUDED.affected_gameweeks,
     reason=EXCLUDED.reason,
     source_name=EXCLUDED.source_name,
     source_url=EXCLUDED.source_url,
     appeal_url=EXCLUDED.appeal_url,
     confirmed_at=now()
 WHERE public.scout_verified_disciplinary_cases.source_name
       = EXCLUDED.source_name;

CREATE OR REPLACE VIEW public.scout_availability_full_audit
WITH (security_invoker=true) AS
WITH current_run AS (
  SELECT id,gameweek FROM public.scout_model_runs
  WHERE is_current=true AND status='ready'
),
current_availability AS (
 SELECT a.* FROM public.scout_availability a
 JOIN current_run r ON r.id=a.run_id
),
secondary AS (
 SELECT o.* FROM public.scout_availability_source_observations o
 JOIN current_run r ON r.gameweek=o.gameweek AND o.season='2026-27'
),
ledger AS (
 SELECT c.player_id,
        bool_or(r.gameweek=ANY(c.affected_gameweeks)) is_current_ban,
        string_agg(c.source_name,'; ') source_names,
        string_agg(c.source_url,'; ') source_urls
 FROM public.scout_verified_disciplinary_cases c CROSS JOIN current_run r
 WHERE c.season='2026-27' AND c.offense_gameweek<r.gameweek
 GROUP BY c.player_id
),
fixtures AS (
 SELECT h.home_team_id AS team_id,h.kickoff_at FROM public.scout_match_history h
 JOIN current_run r ON h.gameweek=r.gameweek AND h.season='2026-27'
 UNION ALL
 SELECT h.away_team_id,h.kickoff_at FROM public.scout_match_history h
 JOIN current_run r ON h.gameweek=r.gameweek AND h.season='2026-27'
)
SELECT p.id player_id,p.full_name,p.team_id,r.gameweek,
 a.availability_type,a.availability_probability,a.reason,
 s.availability_type secondary_type,s.verified secondary_verified,
 s.decision_reason secondary_decision,s.source_return,
 COALESCE(l.is_current_ban,false) official_current_ban,
 l.source_names,l.source_urls,
 CASE
 WHEN l.player_id IS NOT NULL AND l.is_current_ban
   AND (a.availability_type<>'suspensions' OR a.availability_probability<>0)
 THEN 'missing_official_suspension'
 WHEN l.player_id IS NOT NULL AND NOT l.is_current_ban
   AND a.availability_type='suspensions'
 THEN 'expired_official_suspension'
 WHEN s.availability_type='injuries' AND a.availability_type='baseline'
 THEN 'secondary_only_injury_needs_review'
 WHEN s.availability_type='injuries' AND a.availability_type='injuries'
   AND s.verified AND s.source_return IS NOT NULL
   AND s.source_return>(f.kickoff_at AT TIME ZONE 'Europe/Istanbul')::date+interval '60 days'
   AND a.availability_probability>0 AND
   (lower(a.reason) LIKE '%bağ%' OR lower(a.reason) LIKE '%aşil%'
     OR lower(a.reason) LIKE '%kırık%' OR lower(a.reason) LIKE '%tendon%')
 THEN 'long_term_injury_probability_too_high'
 WHEN a.availability_type='suspensions' AND COALESCE(s.verified,false)=false
   AND l.player_id IS NULL
 THEN 'unverified_primary_suspension'
 ELSE 'ok'
 END audit_issue
FROM public.scout_players p CROSS JOIN current_run r
JOIN current_availability a ON a.player_id=p.id
LEFT JOIN secondary s ON s.player_id=p.id
LEFT JOIN ledger l ON l.player_id=p.id
LEFT JOIN fixtures f ON f.team_id=p.team_id
WHERE p.active=true;
REVOKE ALL ON public.scout_availability_full_audit FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.scout_availability_full_audit TO service_role;