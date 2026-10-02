begin;

-- Pro-only analytical surfaces are never directly readable with browser roles.
revoke all on table public.v_scout_player_model_features from anon, authenticated;
revoke all on table public.scout_role_signals from anon, authenticated;
revoke all on table public.scout_team_tactical_profiles from anon, authenticated;
revoke all on table public.scout_replay_players from anon, authenticated;
revoke all on table public.scout_backtest_players from anon, authenticated;

-- Free pages need the point estimate and availability, not distribution/tail internals.
revoke select on table public.scout_player_projections from anon, authenticated;
grant select(
  run_id,player_id,opponent_name,venue,xi_probability,appearance_probability,
  over60_probability,x_minutes,core_xfp,x_bonus,xfp,value_score,confidence,
  availability_probability
) on table public.scout_player_projections to anon, authenticated;
revoke insert,update,delete,truncate,references,trigger
  on table public.scout_player_projections from anon,authenticated;

commit;
