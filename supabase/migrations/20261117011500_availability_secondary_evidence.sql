CREATE TABLE IF NOT EXISTS public.scout_availability_source_observations (
 season text NOT NULL DEFAULT '2026-27',
 gameweek integer NOT NULL CHECK (gameweek>=1 AND gameweek<=38),
 player_id bigint NOT NULL,
 team_id bigint NOT NULL,
 source text NOT NULL CHECK (source IN ('wmrtips')),
 source_player text NOT NULL,
 source_team text NOT NULL,
 availability_type text NOT NULL CHECK(availability_type IN ('injuries','suspensions')),
 reason text,
 source_url text NOT NULL,
 source_start date,
 source_return date,
 verified boolean NOT NULL DEFAULT false,
 decision_reason text NOT NULL,
 evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
 observed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (season,gameweek,player_id,source)
);
CREATE INDEX IF NOT EXISTS scout_availability_source_observations_review_idx
 ON public.scout_availability_source_observations (gameweek,verified,availability_type);
ALTER TABLE public.scout_availability_source_observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scout_availability_source_observations FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.scout_availability_source_observations TO service_role;
COMMENT ON TABLE public.scout_availability_source_observations IS 'Independent source claims and verification decisions; unconfirmed feed items are not injuries or bans in the live projection';
