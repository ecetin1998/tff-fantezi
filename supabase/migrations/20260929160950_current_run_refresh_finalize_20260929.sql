begin;

create or replace function public.scout_finalize_current_simulation_run(
  p_run_id uuid,
  p_gameweek integer,
  p_benchmark text
)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $fn$
declare
  v_count integer;
  v_draws integer;
  v_top25 integer;
  v_kickoff timestamptz;
begin
  select min(kickoff_at) into v_kickoff
  from public.scout_match_predictions
  where run_id=p_run_id and gameweek=p_gameweek;

  if v_kickoff is null or now() >= v_kickoff then
    raise exception 'CURRENT_REFRESH_LOCKED_AFTER_KICKOFF'
      using errcode='check_violation';
  end if;

  if not exists (
    select 1 from public.scout_model_runs
    where id=p_run_id and gameweek=p_gameweek and is_current=true and status='ready'
  ) then
    raise exception 'CURRENT_RUN_NOT_REFRESHABLE' using errcode='check_violation';
  end if;

  perform public.apply_replay_accum_to_run(p_run_id,p_gameweek,p_benchmark);

  update public.scout_player_projections p
  set expected_goals=case when a.draws>0 then a.sum_xgoal/a.draws else 0 end,
      expected_assists=case when a.draws>0 then a.sum_xassist/a.draws else 0 end,
      value_score=case when sp.price>0 then p.xfp/sp.price else null end
  from public.scout_replay_sim_accum a
  join public.scout_players sp on sp.id=a.player_id
  where p.run_id=p_run_id
    and a.gameweek=p_gameweek
    and a.benchmark_version=p_benchmark
    and p.player_id=a.player_id;

  update public.scout_role_signals s
  set predicted_xi_probability=p.xi_probability,
      x_minutes=p.x_minutes,
      availability_probability=p.availability_probability
  from public.scout_player_projections p
  where p.run_id=p_run_id and s.run_id=p_run_id and s.player_id=p.player_id;

  select min(draws)::int into v_draws
  from public.scout_replay_sim_accum
  where gameweek=p_gameweek and benchmark_version=p_benchmark;

  if coalesce(v_draws,0)<50000 then
    raise exception 'simulation accumulator incomplete: % draws',coalesce(v_draws,0)
      using errcode='check_violation';
  end if;

  begin
    select public.refresh_top25_gb_v1(p_run_id,p_gameweek,p_benchmark) into v_top25;
  exception when others then
    select public.refresh_top25_v23(p_run_id,p_gameweek,p_benchmark) into v_top25;
  end;

  update public.scout_model_runs
  set simulation_count=v_draws,status='ready',generated_at=now(),source_updated_at=now()
  where id=p_run_id and gameweek=p_gameweek and is_current=true and status='ready';
  get diagnostics v_count=row_count;
  if v_count<>1 then
    raise exception 'current run changed during refresh' using errcode='check_violation';
  end if;

  return jsonb_build_object(
    'ok',true,'run_id',p_run_id,'gameweek',p_gameweek,'draws',v_draws,
    'top25_updated',v_top25,'kickoff_at',v_kickoff
  );
end;
$fn$;

revoke all on function public.scout_finalize_current_simulation_run(uuid,integer,text)
  from public,anon,authenticated;
grant execute on function public.scout_finalize_current_simulation_run(uuid,integer,text)
  to service_role;

commit;
