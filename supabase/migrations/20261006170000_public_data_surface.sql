-- Public allow-list views. These are definer views owned by postgres so raw model tables can stay revoked from anon/auth.
alter view public.v_current_player_cards set (security_invoker=false);
alter view public.v_current_player_cards_public set (security_invoker=false);
alter view public.v_scout_match_predictions_public set (security_invoker=false);
alter view public.v_scout_replay_players_public set (security_invoker=false);
alter view public.v_scout_replay_weeks_public set (security_invoker=false);

revoke all privileges on public.v_current_player_cards from anon,authenticated;
revoke all privileges on public.scout_match_predictions from anon,authenticated;
revoke all privileges on public.scout_replay_players from anon,authenticated;
revoke all privileges on public.scout_replay_weeks from anon,authenticated;
revoke all privileges on public.scout_role_signals from anon,authenticated;

grant select on public.v_current_player_cards_public to anon,authenticated;
grant select on public.v_scout_match_predictions_public to anon,authenticated;
grant select on public.v_scout_replay_players_public to anon,authenticated;
grant select on public.v_scout_replay_weeks_public to anon,authenticated;
revoke execute on function public.scout_pro_player_cards(uuid) from anon;
grant execute on function public.scout_pro_player_cards(uuid) to authenticated;

-- Player detail history: public point estimates only; percentile bands stay off browser roles.
create or replace view public.v_scout_backtest_players_public with (security_invoker=false) as
select gameweek,player_id,player_name,prediction_mode,run_id,snapshot_at,predicted_xfp,actual_points,predicted_minutes,actual_minutes
from public.scout_backtest_players;
revoke all privileges on public.scout_backtest_players from anon,authenticated;
revoke all privileges on public.v_scout_backtest_players_public from public,anon,authenticated;
grant select on public.v_scout_backtest_players_public to anon,authenticated;
