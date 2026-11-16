-- Source-verified Highlightly aliases. NEVER use shirt number alone for identities.
-- Tested against actual MH10-11 provider and canonical active roster rows, 2026-11-17.
CREATE TABLE IF NOT EXISTS public.scout_highlightly_player_aliases (
  season text NOT NULL DEFAULT '2026-27',
  provider_player_id bigint NOT NULL,
  team_id bigint NOT NULL,
  player_id integer NOT NULL REFERENCES public.scout_players(id),
  provider_name text NOT NULL,
  canonical_name text NOT NULL,
  verification_method text NOT NULL CHECK (verification_method IN ('team_full_name_review')),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  verified_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (season, provider_player_id, team_id)
);
ALTER TABLE public.scout_highlightly_player_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scout_highlightly_player_aliases FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.scout_highlightly_player_aliases TO service_role;

-- Source spelling may differ from roster (middle names, transliteration, word order).
-- Conflicting jersey numbers are not accepted as proof: team and player name are primary.
WITH candidates(provider_player_id, team_id, player_id, provider_name, canonical_name, note) AS (
 VALUES
 (429702::bigint,7,1372,'Mostafa Mohamed Ahmed Abdallah','Mostafa Mohamed Ahmed Abdalla','single trailing h difference'),
 (68476191,15,1042,'Oskar Øhlenschlæger','Oskar Skovbjerg Øhlenschlæger','omitted middle name'),
 (18286695,15,453,'Tanguy Coulibaly','Tanguy Bemin Coulibaly','omitted middle name; shirt mismatch'),
 (100019633,11,1606,'Prince Martor','Prince Martor Jr.','suffix omission'),
 (76817118,11,1504,'Victor Orakpo','Victor Ikechukwu Jonathan Orakpo','omitted middle names'),
 (55107717,8,247,'Andrei Sebastian Borza','Sebastian Andrei Borza','given-name order swapped'),
 (26069113,8,1406,'Youssoufa Moukoko','Youssoufa Mohamadu Moukoko','omitted middle name'),
 (29083838,12,351,'Ibrahim Olawoyin','Ibrahim Olawoyin Olasunkanmi','omitted final name; shirt mismatch'),
 (98920325,16,501,'Christ Sadia','Christ Otiniel Sadia','omitted middle name; shirt mismatch'),
 (100661218,3,93,'Mecit Deniz','Mecit Sercan Deniz','omitted middle name'),
 (88688614,11,341,'Ayaz Özcan','Furkan Ayaz Özcan','omitted first name; shirt mismatch')
)
INSERT INTO public.scout_highlightly_player_aliases (
  season,provider_player_id,team_id,player_id,provider_name,canonical_name,
  verification_method,evidence
)
SELECT '2026-27',c.provider_player_id,c.team_id,c.player_id,c.provider_name,c.canonical_name,
 'team_full_name_review',jsonb_build_object('reason',c.note,'checked_weeks','MH10-MH11')
FROM candidates c
JOIN public.scout_players p ON p.id=c.player_id AND p.team_id=c.team_id
 AND p.full_name=c.canonical_name AND p.active=true
WHERE EXISTS (
 SELECT 1 FROM public.scout_highlightly_player_matches h WHERE h.provider_player_id=c.provider_player_id
 AND h.team_id=c.team_id AND h.player_name=c.provider_name)
ON CONFLICT (season,provider_player_id,team_id) DO UPDATE
SET verified_at=EXCLUDED.verified_at, evidence=EXCLUDED.evidence
WHERE scout_highlightly_player_aliases.player_id=EXCLUDED.player_id
  AND scout_highlightly_player_aliases.provider_name=EXCLUDED.provider_name;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.scout_highlightly_player_aliases WHERE season='2026-27'
      AND provider_player_id IN (429702,68476191,18286695,100019633,76817118,55107717,
      26069113,29083838,98920325,100661218,88688614)) <> 11 THEN
    RAISE EXCEPTION 'Highlightly aliases not all validated; no backfill allowed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.scout_highlightly_player_matches h
    JOIN public.scout_highlightly_player_aliases a ON a.provider_player_id=h.provider_player_id
       AND a.team_id=h.team_id AND a.season=h.season
    WHERE h.player_id IS NOT NULL AND h.player_id<>a.player_id
  ) THEN
    RAISE EXCEPTION 'Existing provider identity conflict';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.scout_highlightly_player_matches h
    JOIN public.scout_highlightly_player_aliases a ON a.provider_player_id=h.provider_player_id
       AND a.team_id=h.team_id AND a.season=h.season
    JOIN public.scout_highlightly_player_matches other
         ON other.match_id=h.match_id AND other.season=h.season
         AND other.provider_player_id<>h.provider_player_id AND other.player_id=a.player_id
  ) THEN
    RAISE EXCEPTION 'Duplicate player identity within one match';
  END IF;
END $$;

UPDATE public.scout_highlightly_player_matches h
SET player_id=a.player_id
FROM public.scout_highlightly_player_aliases a
WHERE a.season=h.season AND a.provider_player_id=h.provider_player_id
  AND a.team_id=h.team_id AND h.player_name=a.provider_name AND h.player_id IS NULL;
