do $$
declare
  t text;
begin
  foreach t in array array[
    'fixtures',
    'gameweek_player_stats',
    'players',
    'scout_goal_distribution_config',
    'scout_replay_input_meta',
    'scout_replay_manual_accum',
    'scout_replay_match_inputs',
    'scout_replay_mc_parts',
    'scout_replay_player_inputs',
    'scout_run_release_gates',
    'teams'
  ]
  loop
    execute format('drop policy if exists "browser deny all" on public.%I',t);
    execute format(
      'create policy "browser deny all" on public.%I for all to anon,authenticated using (false) with check (false)',
      t
    );
  end loop;
end
$$;
