begin;

revoke all on table public.players from anon, authenticated;
revoke all on table public.teams from anon, authenticated;
revoke all on table public.fixtures from anon, authenticated;
revoke all on table public.gameweek_player_stats from anon, authenticated;

revoke all on table public.scout_goal_distribution_config from anon, authenticated;
revoke all on table public.scout_replay_input_meta from anon, authenticated;
revoke all on table public.scout_replay_manual_accum from anon, authenticated;
revoke all on table public.scout_replay_match_inputs from anon, authenticated;
revoke all on table public.scout_replay_mc_parts from anon, authenticated;
revoke all on table public.scout_replay_player_inputs from anon, authenticated;
revoke all on table public.scout_replay_sim_accum from anon, authenticated;
revoke all on table public.scout_match_attack_events from anon, authenticated;
revoke all on table public.scout_run_release_gates from anon, authenticated;
revoke all on table public.scout_weekly_lifecycle from anon, authenticated;

revoke insert, update, delete, truncate, references, trigger
  on table public.scout_team_tactical_profiles from anon, authenticated;

revoke insert, update, delete, truncate, references, trigger
  on table public.v_scout_player_model_features from anon, authenticated;
grant select on table public.v_scout_player_model_features to anon, authenticated;

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure::text as signature
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'apply_top25_scores','guard_scout_current_run','hist_int_quantile','jsonb_int_add',
        'jsonb_int_array_add','live_accum_full_stats','nb2_logpmf','nb2_pmf','poisson_logpmf',
        'populate_match_predictions_nb','refresh_top25_v23','replay_accum_full_stats',
        'replay_accum_quantiles','scout_enrichment_qa','scout_player_enrichment_qa',
        'scout_team_profile_qa','scout_week_closure_status'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.signature);
    execute format('grant execute on function %s to service_role', r.signature);
  end loop;
end $$;

alter function public.scout_my_squad_page(integer) security invoker;
revoke all on function public.scout_my_squad_page(integer) from public, anon;
grant execute on function public.scout_my_squad_page(integer) to authenticated, service_role;

revoke all on function public.save_user_squad(jsonb) from public, anon;
grant execute on function public.save_user_squad(jsonb) to authenticated, service_role;

commit;
