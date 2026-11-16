-- New private supplementary Highlightly evidence; NO official score/model overwrite.
CREATE TABLE IF NOT EXISTS public.scout_highlightly_sync_control (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id=1),
  auth_sha256 text NOT NULL,
  quota_day date NOT NULL DEFAULT ((now() AT TIME ZONE 'UTC')::date),
  requests_used int NOT NULL DEFAULT 0 CHECK (requests_used>=0),
  daily_budget int NOT NULL DEFAULT 72 CHECK (daily_budget BETWEEN 1 AND 95),
  provider_remaining int,
  lease_owner uuid,
  lease_until timestamptz,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.scout_highlightly_matches (
  season text NOT NULL DEFAULT '2026-27',
  gameweek int NOT NULL,
  match_id bigint NOT NULL,
  provider_match_id bigint NOT NULL,
  home_team_id bigint NOT NULL,
  away_team_id bigint NOT NULL,
  provider_home_name text NOT NULL,
  provider_away_name text NOT NULL,
  kickoff_at timestamptz,
  provider_status text NOT NULL,
  box_done boolean NOT NULL DEFAULT false,
  stats_done boolean NOT NULL DEFAULT false,
  lineups_done boolean NOT NULL DEFAULT false,
  box_updated_at timestamptz,
  stats_updated_at timestamptz,
  lineups_updated_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (season,match_id),
  UNIQUE (season,provider_match_id),
  FOREIGN KEY (season,match_id) REFERENCES public.scout_match_history(season,match_id)
);
CREATE INDEX IF NOT EXISTS scout_highlightly_matches_pending_idx
 ON public.scout_highlightly_matches (gameweek,box_done,stats_done,lineups_done);
CREATE TABLE IF NOT EXISTS public.scout_highlightly_player_matches (
  season text NOT NULL DEFAULT '2026-27',
  gameweek int NOT NULL,
  match_id bigint NOT NULL,
  provider_player_id bigint NOT NULL,
  provider_team_id bigint,
  team_id bigint NOT NULL,
  player_id bigint,
  player_name text NOT NULL,
  shirt_number int,
  registered_position text,
  is_substitute boolean,
  minutes int,
  goals int,
  assists int,
  saves int,
  yellow_cards int,
  red_cards int,
  shots int,
  shots_on_target int,
  key_passes int,
  dribbles int,
  successful_dribbles int,
  xg numeric,
  xa numeric,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(season,match_id,provider_player_id),
  FOREIGN KEY(season,match_id) REFERENCES public.scout_highlightly_matches(season,match_id)
);
CREATE INDEX IF NOT EXISTS scout_highlightly_player_internal_idx
 ON public.scout_highlightly_player_matches(player_id,gameweek);
CREATE INDEX IF NOT EXISTS scout_highlightly_player_unmatched_idx
 ON public.scout_highlightly_player_matches(gameweek) WHERE player_id IS NULL;
CREATE TABLE IF NOT EXISTS public.scout_highlightly_team_matches (
  season text NOT NULL DEFAULT '2026-27',
  gameweek int NOT NULL,
  match_id bigint NOT NULL,
  team_id bigint NOT NULL,
  provider_team_id bigint,
  xg numeric,
  xa numeric,
  shots int,
  shots_on_target int,
  big_chances int,
  key_passes int,
  possession numeric,
  crosses int,
  successful_crosses int,
  dribbles int,
  successful_dribbles int,
  statistics jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(season,match_id,team_id),
  FOREIGN KEY(season,match_id) REFERENCES public.scout_highlightly_matches(season,match_id)
);
CREATE TABLE IF NOT EXISTS public.scout_highlightly_lineups (
  season text NOT NULL DEFAULT '2026-27',
  gameweek int NOT NULL,
  match_id bigint NOT NULL,
  team_id bigint NOT NULL,
  provider_team_id bigint,
  formation text,
  starter_count int,
  lineup jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(season,match_id,team_id),
  FOREIGN KEY(season,match_id) REFERENCES public.scout_highlightly_matches(season,match_id)
);
COMMENT ON TABLE public.scout_highlightly_player_matches IS 'Supplementary provider-observed metrics; never overwrite official fantasy actuals from provider minutes';
COMMENT ON TABLE public.scout_highlightly_team_matches IS 'Source-specific per-match advanced stats; xG scale differs from FotMob';
COMMENT ON TABLE public.scout_highlightly_lineups IS 'Not automatically verified tactical sub_role';
ALTER TABLE public.scout_highlightly_sync_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scout_highlightly_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scout_highlightly_player_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scout_highlightly_team_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scout_highlightly_lineups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scout_highlightly_sync_control FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.scout_highlightly_matches FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.scout_highlightly_player_matches FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.scout_highlightly_team_matches FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.scout_highlightly_lineups FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.scout_highlightly_sync_control TO service_role;
GRANT ALL ON public.scout_highlightly_matches TO service_role;
GRANT ALL ON public.scout_highlightly_player_matches TO service_role;
GRANT ALL ON public.scout_highlightly_team_matches TO service_role;
GRANT ALL ON public.scout_highlightly_lineups TO service_role;

-- The existing canonical external ID table originally allowed only TFF.
ALTER TABLE public.scout_match_external_ids DROP CONSTRAINT scout_match_external_ids_source_check;
ALTER TABLE public.scout_match_external_ids ADD CONSTRAINT scout_match_external_ids_source_check
  CHECK (source IN ('tff','highlightly'));
