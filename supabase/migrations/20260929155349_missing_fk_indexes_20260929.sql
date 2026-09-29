begin;
create index if not exists scout_user_squad_snapshots_captain_id_idx
  on public.scout_user_squad_snapshots(captain_id);
create index if not exists scout_user_squad_snapshots_gameweek_idx
  on public.scout_user_squad_snapshots(gameweek);
create index if not exists scout_weekly_lifecycle_candidate_run_id_idx
  on public.scout_weekly_lifecycle(candidate_run_id);
create index if not exists scout_weekly_lifecycle_source_run_id_idx
  on public.scout_weekly_lifecycle(source_run_id);
commit;
