-- Keep sourced game-level attack observations separate from season snapshots
-- and official Fantasy scoring. NULL means unavailable; never impute zero.
CREATE TABLE IF NOT EXISTS public.scout_verified_weekly_attack (
  season text NOT NULL CHECK (season = '2026-27'),
  gameweek integer NOT NULL CHECK (gameweek BETWEEN 1 AND 34),
  player_id bigint NOT NULL REFERENCES public.scout_players(id),
  match_id bigint NOT NULL,
  team_id bigint NOT NULL,
  provider_player_id bigint NOT NULL,
  xg numeric NULL CHECK (xg BETWEEN 0 AND 8),
  xa numeric NULL CHECK (xa BETWEEN 0 AND 8),
  shots integer NULL CHECK (shots BETWEEN 0 AND 35),
  shots_on_target integer NULL CHECK (shots_on_target BETWEEN 0 AND 35),
  key_passes integer NULL CHECK (key_passes BETWEEN 0 AND 35),
  source text NOT NULL CHECK (length(source) BETWEEN 8 AND 180),
  observed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scout_verified_weekly_attack_pkey PRIMARY KEY (season,gameweek,player_id),
  CONSTRAINT scout_verified_weekly_attack_sot_le_shots
    CHECK (shots_on_target IS NULL OR shots IS NULL OR shots_on_target <= shots)
);
CREATE INDEX IF NOT EXISTS scout_verified_weekly_attack_lookup
  ON public.scout_verified_weekly_attack (season, gameweek, match_id);
ALTER TABLE public.scout_verified_weekly_attack ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scout_verified_weekly_attack FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.scout_verified_weekly_attack TO service_role;
COMMENT ON TABLE public.scout_verified_weekly_attack IS
  'Verified, sparse, source-observed per-match advanced attack actions. No Fantasy points; NULL is unknown. Private service-role dataset.';
