-- Non-public, independent-calculation staging. Not official TFF points.
-- An independent score row cannot be turned into a final observed point just
-- by inserting it here. Weekly close still checks signed, final actuals.
create table if not exists public.scout_independent_score_candidates (
  season text not null default '2026-27',
  gameweek integer not null check (gameweek between 1 and 38),
  player_id bigint not null references public.scout_players(id),
  player_name text not null,
  match_id bigint not null,
  position text not null check (position in ('GK','DEF','MID','FWD')),
  minutes integer not null check (minutes between 0 and 90),
  minutes_source text not null,
  goals integer not null default 0,
  assists_candidate integer not null default 0,
  yellow_cards integer not null default 0,
  red_cards integer not null default 0,
  own_goals integer not null default 0,
  saves_candidate integer not null default 0,
  team_conceded integer not null default 0,
  minutes_points integer not null,
  goal_points integer not null,
  assist_points integer not null,
  clean_sheet_points integer not null,
  conceded_points integer not null,
  save_points integer not null,
  card_og_points integer not null,
  base_points integer not null,
  estimated_bonus integer not null check (estimated_bonus between 0 and 3),
  estimated_total integer not null,
  source_kind text not null default 'independent_calculation_provisional',
  status text not null default 'provisional' check (status in ('provisional','reviewed')),
  evidence_note text,
  evidence_url text,
  uncertainty_flags text[] not null default '{}'::text[],
  source_record text not null,
  calculated_at timestamptz not null default now(),
  primary key (season,gameweek,player_id),
  constraint candidate_base_matches_components check (
    base_points = minutes_points + goal_points + assist_points + clean_sheet_points
                  + conceded_points + save_points + card_og_points
  ),
  constraint candidate_points_match_total check (estimated_total = base_points + estimated_bonus),
  constraint candidate_dnp_no_points check (
    minutes > 0 or (base_points = 0 and estimated_bonus = 0 and estimated_total = 0)
  )
);
alter table public.scout_independent_score_candidates enable row level security;
comment on table public.scout_independent_score_candidates is
  'Nonpublic independent candidate scores. Not TFF official, not final actuals, never a training source. Reviewed provenance required before separate final weekly points.';
