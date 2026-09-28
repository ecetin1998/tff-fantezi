begin;

create table if not exists public.scout_weekly_lifecycle (
  target_gameweek integer primary key check (target_gameweek between 1 and 38),
  source_gameweek integer not null check (source_gameweek between 1 and 38),
  source_run_id uuid references public.scout_model_runs(id) on delete set null,
  candidate_run_id uuid references public.scout_model_runs(id) on delete set null,
  benchmark_version text,
  execution_key text,
  stage text not null default 'waiting',
  status text not null default 'waiting' check (status in ('waiting','running','blocked','failed','complete')),
  details jsonb not null default '{}'::jsonb,
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.scout_weekly_lifecycle enable row level security;
revoke all on public.scout_weekly_lifecycle from public,anon,authenticated;
grant all on public.scout_weekly_lifecycle to service_role;

create or replace function public.scout_week_closure_status(p_gameweek integer)
returns jsonb
language sql
stable
security invoker
set search_path='public'
as $fn$
with mh as (
  select
    count(*)::int matches,
    count(*) filter(where match_status='Bitti')::int finished,
    count(*) filter(where fantasy_closure='KAPANDI')::int closed,
    count(*) filter(where home_goals is not null and away_goals is not null)::int scored
  from public.scout_match_history
  where season='2026-27' and gameweek=p_gameweek
), wp as (
  select
    count(*)::int rows,
    count(*) filter(where is_final)::int final_rows,
    count(distinct match_id) filter(where is_final)::int final_matches
  from public.scout_player_weekly_points
  where gameweek=p_gameweek
)
select jsonb_build_object(
  'gameweek',p_gameweek,
  'matches',(select matches from mh),
  'finished',(select finished from mh),
  'closed',(select closed from mh),
  'scored',(select scored from mh),
  'weekly_rows',(select rows from wp),
  'weekly_final_rows',(select final_rows from wp),
  'weekly_final_matches',(select final_matches from wp),
  'pass',
    (select matches>0 and finished=matches and closed=matches and scored=matches from mh)
    and (select rows>0 and final_rows=rows and final_matches=(select matches from mh) from wp)
);
$fn$;

create or replace function public.scout_close_live_backtest(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $fn$
declare
  v_gw integer;
  v_model text;
  v_generated timestamptz;
  v_pred_count integer;
  v_actual_count integer;
  v_minute_mae numeric;
  v_fp_mae numeric;
  v_fp_bias numeric;
  v_fp_rmse numeric;
  v_spearman numeric;
  v_top25 numeric;
  v_brier numeric;
  v_band_hit numeric;
  v_band_width numeric;
  v_outside numeric;
begin
  select gameweek,model_version,generated_at
    into v_gw,v_model,v_generated
  from public.scout_model_runs
  where id=p_run_id;

  if v_gw is null then
    raise exception 'RUN_NOT_FOUND';
  end if;

  if coalesce((public.scout_week_closure_status(v_gw)->>'pass')::boolean,false) is not true then
    raise exception 'GAMEWEEK_NOT_CLOSED';
  end if;

  delete from public.scout_backtest_players where gameweek=v_gw;

  with actual as (
    select player_id,sum(points)::numeric actual_points,sum(minutes)::numeric actual_minutes
    from public.scout_player_weekly_points
    where gameweek=v_gw and is_final=true
    group by player_id
  ), base as (
    select
      p.player_id,sp.full_name,
      p.xfp,p.x_minutes,p.p25,p.p75,p.p90,p.six_plus_probability,p.data_confidence,
      coalesce(a.actual_points,0) actual_points,coalesce(a.actual_minutes,0) actual_minutes,
      row_number() over(order by p.xfp desc,p.player_id) predicted_rank,
      row_number() over(order by coalesce(a.actual_points,0) desc,p.player_id) actual_rank
    from public.scout_player_projections p
    join public.scout_players sp on sp.id=p.player_id
    left join actual a on a.player_id=p.player_id
    where p.run_id=p_run_id and sp.active=true
  )
  insert into public.scout_backtest_players(
    gameweek,player_id,player_name,prediction_mode,run_id,snapshot_at,
    predicted_xfp,actual_points,predicted_minutes,actual_minutes,p25,p75,p90,
    six_plus_probability,prediction_error,abs_error,predicted_rank,actual_rank,
    error_component,data_confidence,notes,band_status,outside_band_distance,updated_at
  )
  select
    v_gw,player_id,full_name,'live',p_run_id,v_generated,
    xfp,actual_points,x_minutes,actual_minutes,p25,p75,p90,
    six_plus_probability,xfp-actual_points,abs(xfp-actual_points),predicted_rank,actual_rank,
    case
      when actual_minutes=0 and x_minutes>=45 then 'minutes'
      when abs(xfp-actual_points)>=4 then 'fantasy_points'
      else 'within_tolerance'
    end,
    data_confidence,'Auto-closed from locked live prediction',
    case when actual_points between p25 and p75 then 'inside' else 'outside' end,
    case when actual_points<p25 then p25-actual_points when actual_points>p75 then actual_points-p75 else 0 end,
    now()
  from base;

  with b as (
    select * from public.scout_backtest_players where gameweek=v_gw
  ), pred25 as (
    select player_id from b order by predicted_xfp desc,player_id limit 25
  ), act25 as (
    select player_id from b order by actual_points desc,player_id limit 25
  )
  select
    count(*)::int,
    count(*) filter(where actual_points is not null)::int,
    avg(abs(predicted_minutes-actual_minutes)),
    avg(abs(predicted_xfp-actual_points)),
    avg(predicted_xfp-actual_points),
    sqrt(avg(power(predicted_xfp-actual_points,2))),
    corr(predicted_rank::numeric,actual_rank::numeric),
    (select count(*)::numeric/25 from pred25 p join act25 a using(player_id)),
    avg(power(coalesce(six_plus_probability,0)-case when actual_points>=6 then 1 else 0 end,2)),
    avg(case when actual_points between p25 and p75 then 1 else 0 end),
    avg(p75-p25),
    avg(outside_band_distance)
  into v_pred_count,v_actual_count,v_minute_mae,v_fp_mae,v_fp_bias,v_fp_rmse,v_spearman,v_top25,v_brier,v_band_hit,v_band_width,v_outside
  from b;

  insert into public.scout_backtest_weeks(
    gameweek,prediction_mode,status,training_through_gameweek,model_version,run_id,snapshot_at,
    prediction_count,actual_count,minute_sample,fp_sample,minute_mae,fp_mae,fp_bias,fp_rmse,
    spearman,top25_hit_rate,six_plus_brier,band_hit_rate,band_calibration_gap,
    average_band_width,average_outside_distance,data_confidence,notes,updated_at
  )
  values(
    v_gw,'live','complete',greatest(0,v_gw-1),v_model,p_run_id,v_generated,
    v_pred_count,v_actual_count,v_actual_count,v_actual_count,v_minute_mae,v_fp_mae,v_fp_bias,v_fp_rmse,
    v_spearman,v_top25,v_brier,v_band_hit,abs(coalesce(v_band_hit,0)-0.5),
    v_band_width,v_outside,'live-locked',
    'Auto-generated after all matches and fantasy rows were final',now()
  )
  on conflict(gameweek) do update set
    prediction_mode=excluded.prediction_mode,status=excluded.status,
    training_through_gameweek=excluded.training_through_gameweek,model_version=excluded.model_version,
    run_id=excluded.run_id,snapshot_at=excluded.snapshot_at,prediction_count=excluded.prediction_count,
    actual_count=excluded.actual_count,minute_sample=excluded.minute_sample,fp_sample=excluded.fp_sample,
    minute_mae=excluded.minute_mae,fp_mae=excluded.fp_mae,fp_bias=excluded.fp_bias,fp_rmse=excluded.fp_rmse,
    spearman=excluded.spearman,top25_hit_rate=excluded.top25_hit_rate,six_plus_brier=excluded.six_plus_brier,
    band_hit_rate=excluded.band_hit_rate,band_calibration_gap=excluded.band_calibration_gap,
    average_band_width=excluded.average_band_width,average_outside_distance=excluded.average_outside_distance,
    data_confidence=excluded.data_confidence,notes=excluded.notes,updated_at=now();

  return jsonb_build_object(
    'pass',true,'gameweek',v_gw,'prediction_count',v_pred_count,'actual_count',v_actual_count,
    'fp_mae',v_fp_mae,'minute_mae',v_minute_mae,'top25_hit_rate',v_top25,'band_hit_rate',v_band_hit
  );
end;
$fn$;

revoke all on function public.scout_close_live_backtest(uuid) from public,anon,authenticated;
grant execute on function public.scout_close_live_backtest(uuid) to service_role;

create or replace function public.apply_replay_accum_attack_to_run(
  p_run_id uuid,p_gameweek integer,p_benchmark text
)
returns integer
language plpgsql
security definer
set search_path='public'
as $fn$
declare v_count integer;
begin
  update public.scout_player_projections p
  set expected_goals=a.sum_xgoal/nullif(a.draws,0),
      expected_assists=a.sum_xassist/nullif(a.draws,0)
  from public.scout_replay_sim_accum a
  where a.gameweek=p_gameweek
    and a.benchmark_version=p_benchmark
    and p.run_id=p_run_id
    and p.player_id=a.player_id;
  get diagnostics v_count=row_count;
  return v_count;
end;
$fn$;

revoke all on function public.apply_replay_accum_attack_to_run(uuid,integer,text) from public,anon,authenticated;
grant execute on function public.apply_replay_accum_attack_to_run(uuid,integer,text) to service_role;

create or replace function public.scout_finalize_candidate_projection_fields(p_run_id uuid)
returns integer
language plpgsql
security definer
set search_path='public'
as $fn$
declare v_count integer;
begin
  update public.scout_player_projections p
  set value_score=case when sp.price>0 then p.xfp/sp.price else null end
  from public.scout_players sp
  where p.run_id=p_run_id and sp.id=p.player_id;
  get diagnostics v_count=row_count;

  update public.scout_role_signals r
  set predicted_xi_probability=p.xi_probability,
      x_minutes=p.x_minutes,
      availability_probability=p.availability_probability
  from public.scout_player_projections p
  where p.run_id=p_run_id and r.run_id=p_run_id and r.player_id=p.player_id;

  return v_count;
end;
$fn$;

revoke all on function public.scout_finalize_candidate_projection_fields(uuid) from public,anon,authenticated;
grant execute on function public.scout_finalize_candidate_projection_fields(uuid) to service_role;

commit;
