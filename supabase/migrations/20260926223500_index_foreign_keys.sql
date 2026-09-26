create index if not exists fixtures_away_team_id_idx
  on public.fixtures(away_team_id);
create index if not exists fixtures_home_team_id_idx
  on public.fixtures(home_team_id);
create index if not exists gameweek_player_stats_player_id_idx
  on public.gameweek_player_stats(player_id);
create index if not exists players_team_id_idx
  on public.players(team_id);
create index if not exists scout_preseason_player_priors_player_id_idx
  on public.scout_preseason_player_priors(player_id);
create index if not exists scout_preseason_team_priors_team_id_idx
  on public.scout_preseason_team_priors(team_id);
