-- Private match-by-match tactical role evidence. This never changes the
-- registered Fantasy scoring position, which must remain in scout_players.
CREATE TABLE IF NOT EXISTS public.scout_player_tactical_role_observations (
 season text NOT NULL DEFAULT '2026-27' CHECK (season='2026-27'),
 gameweek integer NOT NULL CHECK (gameweek BETWEEN 1 AND 34),
 match_id bigint NOT NULL,
 player_id bigint NOT NULL REFERENCES public.scout_players(id),
 team_id bigint NOT NULL,
 role text NOT NULL CHECK (role IN ('GK','CB','FB','WB','DM','CM','AM','WM','W','SS','ST')),
 side text NULL CHECK (side IN ('L','R','C','BOTH')),
 started boolean NOT NULL,
 minutes numeric NOT NULL CHECK (minutes>=0 AND minutes<=130),
 verified boolean NOT NULL DEFAULT false,
 source_position_label text NOT NULL,
 source_match_url text NOT NULL,
 provider_player_id bigint NOT NULL,
 observed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (season,gameweek,match_id,player_id)
);
CREATE INDEX IF NOT EXISTS scout_tactical_role_player_week
 ON public.scout_player_tactical_role_observations(player_id,gameweek DESC);
ALTER TABLE public.scout_player_tactical_role_observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scout_player_tactical_role_observations FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.scout_player_tactical_role_observations TO service_role;
COMMENT ON TABLE public.scout_player_tactical_role_observations IS
 'Source-verified explicit match lineup tactical positions. No inference from numeric positionId. Requires at least two verified starts to alter model sub_role. Registered Fantasy position never changes.';
