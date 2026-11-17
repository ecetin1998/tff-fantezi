-- FIFA / Opta verified player nickname: "Sontje Hansen" is
-- Misjonne Juniffer Naigelino Hansen, Gaziantep player 844.
-- https://theanalyst.com/players/6683/sontje-hansen
-- https://www.fussballnationalmannschaft.net/wp-content/uploads/2026/06/fussball-wm-2026-kaderliste-fifa-english.pdf
DO $$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM public.scout_players
  WHERE id=844 AND team_id=18 AND active=true
   AND full_name='Misjonne Juniffer Naigelino Hansen'
 ) THEN RAISE EXCEPTION 'Sontje Hansen canonical identity mismatch'; END IF;
 IF (SELECT count(*) FROM public.scout_highlightly_player_matches
 WHERE season='2026-27' AND team_id=18 AND provider_player_id=26063478
   AND player_name='Sontje Hansen')<>3 THEN
   RAISE EXCEPTION 'Expected three source rows for Hansen alias';
 END IF;
 IF EXISTS (
   SELECT 1 FROM public.scout_highlightly_player_matches h
   JOIN public.scout_highlightly_player_matches other
     ON h.season=other.season AND h.match_id=other.match_id
    AND other.player_id=844 AND other.provider_player_id<>h.provider_player_id
   WHERE h.provider_player_id=26063478 AND h.team_id=18
 ) THEN RAISE EXCEPTION 'Hansen duplicate canonical identity within match'; END IF;
END $$;
INSERT INTO public.scout_highlightly_player_aliases
(season,provider_player_id,team_id,player_id,provider_name,canonical_name,
 verification_method,evidence)
VALUES ('2026-27',26063478,18,844,'Sontje Hansen',
 'Misjonne Juniffer Naigelino Hansen','team_full_name_review',
 jsonb_build_object('verified_by','FIFA official 2026 squad list and Opta Analyst',
 'reason','Sontje nickname is identical player; legal birth name omitted',
 'source_url','https://theanalyst.com/players/6683/sontje-hansen',
 'match_ids',jsonb_build_array(317820,317836,317838)))
ON CONFLICT (season,provider_player_id,team_id) DO UPDATE
 SET verified_at=EXCLUDED.verified_at,evidence=EXCLUDED.evidence
 WHERE scout_highlightly_player_aliases.player_id=EXCLUDED.player_id
 AND scout_highlightly_player_aliases.provider_name=EXCLUDED.provider_name;
UPDATE public.scout_highlightly_player_matches h
SET player_id=844
WHERE h.season='2026-27' AND h.provider_player_id=26063478
  AND h.team_id=18 AND h.player_name='Sontje Hansen' AND h.player_id IS NULL;
DO $$
BEGIN
 IF (SELECT count(*) FROM public.scout_highlightly_player_matches
 WHERE season='2026-27' AND team_id=18 AND provider_player_id=26063478
   AND player_id=844)<>3 THEN
   RAISE EXCEPTION 'Hansen historical repair incomplete'; END IF;
END $$;
