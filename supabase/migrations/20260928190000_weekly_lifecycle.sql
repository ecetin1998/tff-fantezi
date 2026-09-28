begin;

create table if not exists public.scout_weekly_cycles(
  current_gameweek integer primary key check(current_gameweek between 1 and 38),
  target_gameweek integer not null check(target_gameweek between 1 and 38),
  current_run_id uuid not null references public.scout_model_runs(id) on delete cascade,
  candidate_run_id uuid references public.scout_model_runs(id) on delete set null,
  benchmark_version text,
  status text not null default 'waiting' check(status in ('waiting','running','blocked','completed')),
  last_stage text,
  last_error text,
  started_at timestamptz,
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.scout_weekly_cycles enable row level security;
revoke all on public.scout_weekly_cycles from anon,authenticated;
grant all on public.scout_weekly_cycles to service_role;

create or replace function private.scout_week_is_closed(p_gameweek integer)
returns boolean
language sql
stable
set search_path=''
as $$
  with m as (
    select count(*) n,
           count(*) filter(
             where lower(trim(coalesce(match_status,''))) in ('bitti','finished','ft')
               and lower(trim(coalesce(fantasy_closure,''))) in ('kapandi','kapandı','closed')
           ) closed_n
    from public.scout_match_history
    where season='2026-27' and gameweek=p_gameweek
  ), w as (
    select count(distinct match_id) final_matches
    from public.scout_player_weekly_points
    where gameweek=p_gameweek and is_final=true
  )
  select coalesce(m.n=9 and m.closed_n=9 and w.final_matches=9,false)
  from m cross join w;
$$;

create or replace function private.scout_poisson_match_summary(p_home numeric,p_away numeric)
returns table(
  home_win numeric,draw numeric,away_win numeric,
  home_cs numeric,away_cs numeric,
  top_score text,top_prob numeric,second_score text,second_prob numeric,third_score text,third_prob numeric,
  btts numeric,over15 numeric,over25 numeric,over35 numeric,three_goal_margin numeric
)
language sql
stable
set search_path=''
as $$
  with params as (
    select greatest(.05,least(4.5,p_home))::numeric h,
           greatest(.05,least(4.5,p_away))::numeric a
  ), scores as (
    select hg,ag,
      (exp(-p.h)*power(p.h,hg)/factorial(hg))*
      (exp(-p.a)*power(p.a,ag)/factorial(ag)) prob
    from params p cross join generate_series(0,9) hg cross join generate_series(0,9) ag
  ), norm as (
    select *,prob/nullif(sum(prob) over(),0) p from scores
  ), ranked as (
    select *,row_number() over(order by p desc,hg+ag asc,hg asc,ag asc) rn from norm
  ), agg as (
    select
      sum(p) filter(where hg>ag) hw,
      sum(p) filter(where hg=ag) dr,
      sum(p) filter(where hg<ag) aw,
      sum(p) filter(where abs(hg-ag)>=3) margin
    from norm
  ), tops as (
    select
      max(hg||'-'||ag) filter(where rn=1) s1,max(p) filter(where rn=1) p1,
      max(hg||'-'||ag) filter(where rn=2) s2,max(p) filter(where rn=2) p2,
      max(hg||'-'||ag) filter(where rn=3) s3,max(p) filter(where rn=3) p3
    from ranked
  )
  select
    agg.hw,agg.dr,agg.aw,
    exp(-p.a),exp(-p.h),
    tops.s1,tops.p1,tops.s2,tops.p2,tops.s3,tops.p3,
    1-exp(-p.h)-exp(-p.a)+exp(-(p.h+p.a)),
    1-exp(-(p.h+p.a))*(1+(p.h+p.a)),
    1-exp(-(p.h+p.a))*(1+(p.h+p.a)+power(p.h+p.a,2)/2),
    1-exp(-(p.h+p.a))*(1+(p.h+p.a)+power(p.h+p.a,2)/2+power(p.h+p.a,3)/6),
    agg.margin
  from params p cross join agg cross join tops;
$$;

create or replace function public.scout_finalize_live_backtest(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_gw integer;
  v_model text;
  v_generated timestamptz;
  v_rows integer;
begin
  select gameweek,model_version,generated_at into v_gw,v_model,v_generated
  from public.scout_model_runs where id=p_run_id;
  if not found then raise exception 'run not found'; end if;
  if not private.scout_week_is_closed(v_gw) then
    return jsonb_build_object('ok',false,'waiting',true,'reason','gameweek_not_closed','gameweek',v_gw);
  end if;

  with actual as (
    select player_id,sum(points)::numeric actual_points,sum(minutes)::numeric actual_minutes
    from public.scout_player_weekly_points
    where gameweek=v_gw and is_final=true
    group by player_id
  ), base as (
    select p.player_id,sp.full_name,p.xfp,p.x_minutes,p.p25,p.p75,p.p90,p.six_plus_probability,
           coalesce(a.actual_points,0) actual_points,coalesce(a.actual_minutes,0) actual_minutes,
           p.data_confidence
    from public.scout_player_projections p
    join public.scout_players sp on sp.id=p.player_id
    left join actual a on a.player_id=p.player_id
    where p.run_id=p_run_id
  ), ranked as (
    select *,
      row_number() over(order by xfp desc,player_id) predicted_rank,
      row_number() over(order by actual_points desc,player_id) actual_rank
    from base
  )
  insert into public.scout_backtest_players(
    gameweek,player_id,player_name,prediction_mode,run_id,snapshot_at,
    predicted_xfp,actual_points,predicted_minutes,actual_minutes,p25,p75,p90,
    six_plus_probability,prediction_error,abs_error,predicted_rank,actual_rank,
    error_component,data_confidence,notes,updated_at,band_status,outside_band_distance
  )
  select v_gw,r.player_id,r.full_name,'live_locked',p_run_id,v_generated,
         r.xfp,r.actual_points,r.x_minutes,r.actual_minutes,r.p25,r.p75,r.p90,
         r.six_plus_probability,r.xfp-r.actual_points,abs(r.xfp-r.actual_points),
         r.predicted_rank,r.actual_rank,
         case when abs(r.x_minutes-r.actual_minutes)>=30 then 'minutes' else 'scoring' end,
         r.data_confidence,'automatic weekly closure',now(),
         case when r.actual_points<r.p25 then 'below'
              when r.actual_points>r.p75 then 'above' else 'inside' end,
         case when r.actual_points<r.p25 then r.p25-r.actual_points
              when r.actual_points>r.p75 then r.actual_points-r.p75 else 0 end
  from ranked r
  on conflict(gameweek,player_id) do update set
    prediction_mode=excluded.prediction_mode,run_id=excluded.run_id,snapshot_at=excluded.snapshot_at,
    predicted_xfp=excluded.predicted_xfp,actual_points=excluded.actual_points,
    predicted_minutes=excluded.predicted_minutes,actual_minutes=excluded.actual_minutes,
    p25=excluded.p25,p75=excluded.p75,p90=excluded.p90,six_plus_probability=excluded.six_plus_probability,
    prediction_error=excluded.prediction_error,abs_error=excluded.abs_error,
    predicted_rank=excluded.predicted_rank,actual_rank=excluded.actual_rank,
    error_component=excluded.error_component,data_confidence=excluded.data_confidence,
    notes=excluded.notes,updated_at=excluded.updated_at,band_status=excluded.band_status,
    outside_band_distance=excluded.outside_band_distance;

  get diagnostics v_rows=row_count;

  with bp as (
    select * from public.scout_backtest_players where gameweek=v_gw
  ), rec as (
    select
      sum(bp.actual_points) filter(where sm.squad_slot='XI') rec_xi,
      max(bp.actual_points) filter(where sm.is_captain) captain_pts
    from public.scout_squad_recommendations sr
    join public.scout_squad_members sm on sm.recommendation_id=sr.id
    join bp on bp.player_id=sm.player_id
    where sr.run_id=p_run_id and sr.variant='recommended'
  ), metric as (
    select
      count(*)::int n,
      avg(abs(predicted_xfp-actual_points)) fp_mae,
      avg(predicted_xfp-actual_points) fp_bias,
      sqrt(avg(power(predicted_xfp-actual_points,2))) fp_rmse,
      avg(abs(predicted_minutes-actual_minutes)) minute_mae,
      corr(predicted_rank::numeric,actual_rank::numeric) spearman,
      count(*) filter(where predicted_rank<=25 and actual_rank<=25)::numeric/25 top25_hit,
      avg(power(six_plus_probability-(case when actual_points>=6 then 1 else 0 end),2)) six_brier,
      abs(avg(six_plus_probability)-avg(case when actual_points>=6 then 1 else 0 end)) six_cal,
      avg(case when actual_points between p25 and p75 then 1 else 0 end) band_hit,
      avg(p75-p25) band_width,
      avg(outside_band_distance) outside_dist
    from bp
  )
  insert into public.scout_backtest_weeks(
    gameweek,prediction_mode,status,training_through_gameweek,model_version,run_id,snapshot_at,
    prediction_count,actual_count,minute_sample,fp_sample,minute_mae,fp_mae,fp_bias,fp_rmse,
    spearman,top25_hit_rate,six_plus_brier,six_plus_calibration_error,
    recommended_xi_points,captain_points,data_confidence,notes,updated_at,
    band_hit_rate,band_calibration_gap,average_band_width,average_outside_distance
  )
  select v_gw,'live_locked','closed',greatest(0,v_gw-1),v_model,p_run_id,v_generated,
         m.n,m.n,m.n,m.n,m.minute_mae,m.fp_mae,m.fp_bias,m.fp_rmse,m.spearman,m.top25_hit,
         m.six_brier,m.six_cal,r.rec_xi,r.captain_pts,'high',
         'automatic weekly closure; parameters are not auto-retuned',now(),
         m.band_hit,abs(m.band_hit-.50),m.band_width,m.outside_dist
  from metric m cross join rec r
  on conflict(gameweek) do update set
    prediction_mode=excluded.prediction_mode,status=excluded.status,
    training_through_gameweek=excluded.training_through_gameweek,model_version=excluded.model_version,
    run_id=excluded.run_id,snapshot_at=excluded.snapshot_at,prediction_count=excluded.prediction_count,
    actual_count=excluded.actual_count,minute_sample=excluded.minute_sample,fp_sample=excluded.fp_sample,
    minute_mae=excluded.minute_mae,fp_mae=excluded.fp_mae,fp_bias=excluded.fp_bias,fp_rmse=excluded.fp_rmse,
    spearman=excluded.spearman,top25_hit_rate=excluded.top25_hit_rate,
    six_plus_brier=excluded.six_plus_brier,six_plus_calibration_error=excluded.six_plus_calibration_error,
    recommended_xi_points=excluded.recommended_xi_points,captain_points=excluded.captain_points,
    data_confidence=excluded.data_confidence,notes=excluded.notes,updated_at=excluded.updated_at,
    band_hit_rate=excluded.band_hit_rate,band_calibration_gap=excluded.band_calibration_gap,
    average_band_width=excluded.average_band_width,average_outside_distance=excluded.average_outside_distance;

  return jsonb_build_object('ok',true,'gameweek',v_gw,'player_rows',v_rows);
end;
$$;

create or replace function public.scout_prepare_next_week(p_current_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_cur public.scout_model_runs%rowtype;
  v_target integer;
  v_candidate uuid;
  v_benchmark text;
  v_parent_benchmark text;
  v_target_matches integer;
  v_active integer;
  v_home_scale numeric:=1.05;
  v_away_scale numeric:=.95;
  v_parent_gate public.scout_run_release_gates%rowtype;
begin
  select * into v_cur from public.scout_model_runs
  where id=p_current_run_id and is_current=true and status='ready'
  for update;
  if not found then raise exception 'current ready run not found'; end if;
  if not private.scout_week_is_closed(v_cur.gameweek) then
    return jsonb_build_object('ok',false,'waiting',true,'reason','gameweek_not_closed','gameweek',v_cur.gameweek);
  end if;
  if v_cur.gameweek>=38 then
    return jsonb_build_object('ok',true,'season_complete',true,'gameweek',v_cur.gameweek);
  end if;

  v_target:=v_cur.gameweek+1;
  select count(*) into v_target_matches
  from public.scout_match_history
  where season='2026-27' and gameweek=v_target;
  if v_target_matches<>9 then
    return jsonb_build_object('ok',false,'waiting',true,'reason','next_fixtures_missing','target_gameweek',v_target,'match_count',v_target_matches);
  end if;

  perform public.scout_refresh_enrichment_profiles('2026-27',v_cur.gameweek);
  perform public.refresh_scout_team_tactical_profiles('2026-27',v_cur.gameweek);

  select benchmark_version into v_parent_benchmark
  from public.scout_replay_input_meta
  where gameweek=v_cur.gameweek
  order by created_at desc limit 1;
  if v_parent_benchmark is null then raise exception 'parent simulation inputs missing'; end if;

  with oldtp as (
    select distinct on(team_id) team_id,attack_xg_per_match,defense_xga_per_match
    from public.scout_team_tactical_profiles
    where season='2026-27' and through_gameweek<=greatest(0,v_cur.gameweek-1)
    order by team_id,through_gameweek desc
  ), ratios as (
    select
      mp.home_xg/nullif(sqrt(greatest(.05,h.attack_xg_per_match)*greatest(.05,a.defense_xga_per_match)),0) hr,
      mp.away_xg/nullif(sqrt(greatest(.05,a.attack_xg_per_match)*greatest(.05,h.defense_xga_per_match)),0) ar
    from public.scout_match_predictions mp
    join oldtp h on h.team_id=mp.home_team_id
    join oldtp a on a.team_id=mp.away_team_id
    where mp.run_id=v_cur.id
  )
  select coalesce(percentile_cont(.5) within group(order by hr),1.05),
         coalesce(percentile_cont(.5) within group(order by ar),.95)
  into v_home_scale,v_away_scale
  from ratios
  where hr between .5 and 1.8 and ar between .5 and 1.8;

  v_benchmark:='weekly-auto-mh'||v_target||'-v1';

  delete from public.scout_replay_sim_accum where gameweek=v_target and benchmark_version=v_benchmark;
  delete from public.scout_replay_player_inputs where gameweek=v_target and benchmark_version=v_benchmark;
  delete from public.scout_replay_match_inputs where gameweek=v_target and benchmark_version=v_benchmark;
  delete from public.scout_replay_input_meta where gameweek=v_target and benchmark_version=v_benchmark;

  select id into v_candidate
  from public.scout_model_runs
  where gameweek=v_target and is_current=false and coalesce(notes,'') like 'weekly-auto:%'
  order by generated_at desc limit 1;
  if v_candidate is not null then
    delete from public.scout_model_runs where id=v_candidate;
  end if;

  insert into public.scout_model_runs(gameweek,model_version,generated_at,source_updated_at,simulation_count,status,is_current,notes)
  values(
    v_target,
    regexp_replace(v_cur.model_version,'(GW|MH)[0-9]+','GW'||v_target,'g'),
    now(),now(),0,'building',false,
    'weekly-auto: parent='||v_cur.id||'; source_week='||v_cur.gameweek||'; target_week='||v_target
  )
  returning id into v_candidate;

  insert into public.scout_availability(
    run_id,player_id,availability_type,availability_probability,reason,checked_at,source_url,
    suspension_end,source_reason,injury_date,expected_return,suspension_fixture,
    detail_source_label,detail_source_url,detail_source_updated_at,canonical_reason,expected_return_date
  )
  select v_candidate,player_id,availability_type,availability_probability,reason,checked_at,source_url,
         suspension_end,source_reason,injury_date,expected_return,suspension_fixture,
         detail_source_label,detail_source_url,detail_source_updated_at,canonical_reason,expected_return_date
  from public.scout_availability where run_id=v_cur.id;

  insert into public.scout_replay_input_meta(
    gameweek,benchmark_version,temperature,assist_fraction,own_goal_fraction,simulation_seed,
    source_note,created_at,formations,team_formations,lineup_factors
  )
  select v_target,v_benchmark,temperature,assist_fraction,own_goal_fraction,
         (2026000000+v_target*1000)::bigint,
         'weekly lifecycle from MH'||v_cur.gameweek||' closed actuals',now(),
         formations,team_formations,lineup_factors
  from public.scout_replay_input_meta
  where gameweek=v_cur.gameweek and benchmark_version=v_parent_benchmark;

  with tp as (
    select distinct on(team_id) team_id,attack_xg_per_match,defense_xga_per_match
    from public.scout_team_tactical_profiles
    where season='2026-27' and through_gameweek<=v_cur.gameweek
    order by team_id,through_gameweek desc
  ), fixtures as (
    select mh.match_id,mh.home_team_id,mh.away_team_id,mh.kickoff_at,
      greatest(.25,least(3.75,
        sqrt(greatest(.05,h.attack_xg_per_match)*greatest(.05,a.defense_xga_per_match))*v_home_scale
      )) home_lambda,
      greatest(.25,least(3.75,
        sqrt(greatest(.05,a.attack_xg_per_match)*greatest(.05,h.defense_xga_per_match))*v_away_scale
      )) away_lambda
    from public.scout_match_history mh
    join tp h on h.team_id=mh.home_team_id
    join tp a on a.team_id=mh.away_team_id
    where mh.season='2026-27' and mh.gameweek=v_target
  )
  insert into public.scout_replay_match_inputs(
    gameweek,benchmark_version,match_id,home_team_id,away_team_id,home_lambda,away_lambda,source_note,created_at
  )
  select v_target,v_benchmark,match_id,home_team_id,away_team_id,home_lambda,away_lambda,
         'weekly-auto calibrated from prior live run',now()
  from fixtures;

  insert into public.scout_match_predictions(
    run_id,match_id,gameweek,kickoff_at,home_team_id,away_team_id,home_xg,away_xg,
    home_win_probability,draw_probability,away_win_probability,home_cs_probability,away_cs_probability,
    top_score,top_score_probability,second_score,second_score_probability,third_score,third_score_probability,
    btts_probability,over15_probability,over25_probability,over35_probability,three_goal_margin_probability,
    method,model_note
  )
  select v_candidate,i.match_id::int,v_target,mh.kickoff_at,i.home_team_id::int,i.away_team_id::int,
         i.home_lambda,i.away_lambda,s.home_win,s.draw,s.away_win,s.home_cs,s.away_cs,
         s.top_score,s.top_prob,s.second_score,s.second_prob,s.third_score,s.third_prob,
         s.btts,s.over15,s.over25,s.over35,s.three_goal_margin,
         'weekly-auto-poisson-calibrated',
         'Lambdas blend current team xG/xGA with venue calibration inherited from the prior live run.'
  from public.scout_replay_match_inputs i
  join public.scout_match_history mh on mh.match_id=i.match_id
  cross join lateral private.scout_poisson_match_summary(i.home_lambda,i.away_lambda) s
  where i.gameweek=v_target and i.benchmark_version=v_benchmark;

  with prev_i as (
    select * from public.scout_replay_player_inputs
    where gameweek=v_cur.gameweek and benchmark_version=v_parent_benchmark
  ), curp as (
    select p.*,rs.predicted_xi_probability rs_xi,rs.x_minutes rs_minutes
    from public.scout_player_projections p
    left join public.scout_role_signals rs on rs.run_id=p.run_id and rs.player_id=p.player_id
    where p.run_id=v_cur.id
  ), st as (
    select distinct on(player_id) *
    from public.scout_player_season_stats
    where season='2026-27' and through_gameweek<=v_cur.gameweek
    order by player_id,through_gameweek desc
  ), week_now as (
    select player_id,avg(minutes) filter(where minutes>0) mins
    from public.scout_player_weekly_points
    where gameweek=v_cur.gameweek and is_final=true
    group by player_id
  ), minute_windows as (
    select p.id player_id,
      coalesce((select avg(z.minutes) from (
        select w.minutes from public.scout_player_weekly_points w
        where w.player_id=p.id and w.gameweek<=v_cur.gameweek and w.is_final=true
        order by w.gameweek desc limit 2
      ) z),0) last2,
      coalesce((select avg(z.minutes) from (
        select w.minutes from public.scout_player_weekly_points w
        where w.player_id=p.id and w.gameweek<=v_cur.gameweek-2 and w.is_final=true
        order by w.gameweek desc limit 2
      ) z),0) prev2
    from public.scout_players p where p.active=true
  ), raw as (
    select
      p.id player_id,p.full_name,p.team_id,p.position,p.price,
      coalesce(curp.availability_probability,prev_i.availability,1)::numeric availability,
      greatest(.01,least(.99,
        coalesce(curp.rs_xi,curp.xi_probability,prev_i.role_probability,.5)
        + .18*greatest(-1::numeric,least(1::numeric,(mw.last2-mw.prev2)/90))
      )) role_probability,
      coalesce(prev_i.bench_weight,greatest(.05,1-coalesce(curp.xi_probability,.5))) bench_weight,
      case when wn.mins is not null then
        jsonb_build_array(
          least(90,greatest(1,round(wn.mins)))::int,
          coalesce((prev_i.durations->>0)::int,least(90,greatest(1,round(coalesce(curp.x_minutes,75)))))::int,
          coalesce((prev_i.durations->>1)::int,least(90,greatest(1,round(coalesce(curp.x_minutes,75)))))::int,
          coalesce((prev_i.durations->>2)::int,least(90,greatest(1,round(coalesce(curp.x_minutes,75)))))::int,
          coalesce((prev_i.durations->>3)::int,least(90,greatest(1,round(coalesce(curp.x_minutes,75)))))::int
        )
      else coalesce(prev_i.durations,jsonb_build_array(
        least(90,greatest(1,round(coalesce(curp.x_minutes,75))))::int,
        least(90,greatest(1,round(coalesce(curp.x_minutes,75))))::int,
        least(90,greatest(1,round(coalesce(curp.x_minutes,75))))::int,
        least(90,greatest(1,round(coalesce(curp.x_minutes,75))))::int,
        least(90,greatest(1,round(coalesce(curp.x_minutes,75))))::int
      )) end durations,
      '[0.35,0.25,0.18,0.13,0.09]'::jsonb duration_weights,
      jsonb_build_array(
        coalesce(case when st.minutes>0 then 90*st.xg_total/st.minutes end,(prev_i.rates->>0)::numeric,0),
        coalesce(case when st.minutes>0 then 90*st.goals/st.minutes end,(prev_i.rates->>1)::numeric,0),
        coalesce(case when st.minutes>0 then 90*st.assists/st.minutes end,(prev_i.rates->>2)::numeric,0),
        coalesce(st.xa_model_per90,st.xa_per90,(prev_i.rates->>3)::numeric,0),
        coalesce(case when st.minutes>0 then 90*st.yellow_cards/st.minutes end,(prev_i.rates->>4)::numeric,0),
        coalesce(case when st.minutes>0 then 90*st.red_cards/st.minutes end,(prev_i.rates->>5)::numeric,0),
        coalesce(case when st.minutes>0 then 90*st.saves/st.minutes end,(prev_i.rates->>6)::numeric,0),
        coalesce((prev_i.rates->>7)::numeric,0),
        coalesce((prev_i.rates->>8)::numeric,0),
        coalesce((prev_i.rates->>9)::numeric,0),
        coalesce(case when st.minutes>0 then 90*st.shots/st.minutes end,(prev_i.rates->>10)::numeric,0),
        coalesce(case when st.minutes>0 then 90*st.shots_on_target/st.minutes end,(prev_i.rates->>11)::numeric,0)
      ) rates,
      coalesce(curp.data_confidence,prev_i.data_confidence,'medium') data_confidence,
      coalesce(p.primary_role,prev_i.sub_role) sub_role,p.role_side,
      coalesce(st.xa_model_per90,st.xa_per90,prev_i.effective_xa_per90,0) effective_xa_per90,
      mw.last2,mw.prev2
    from public.scout_players p
    join curp on curp.player_id=p.id
    left join prev_i on prev_i.player_id=p.id
    left join st on st.player_id=p.id
    left join week_now wn on wn.player_id=p.id
    left join minute_windows mw on mw.player_id=p.id
    where p.active=true
  )
  insert into public.scout_replay_player_inputs(
    gameweek,benchmark_version,player_id,player_name,club_id,position,price,
    availability,role_probability,bench_weight,durations,duration_weights,rates,
    data_confidence,has_individual_prior,source_note,created_at,sub_role,role_side,effective_xa_per90
  )
  select v_target,v_benchmark,player_id,full_name,team_id,position,price,
         availability,role_probability,bench_weight,durations,duration_weights,rates,
         data_confidence,true,'weekly-auto from closed MH'||v_cur.gameweek,now(),sub_role,role_side,effective_xa_per90
  from raw;

  with inp as (
    select i.*,
      greatest(.000001,
        (.75*coalesce((i.rates->>0)::numeric,0)+.25*coalesce((i.rates->>1)::numeric,0))
        *i.role_probability*i.availability
      ) gw,
      greatest(.000001,
        (.70*coalesce((i.rates->>3)::numeric,0)+.30*coalesce((i.rates->>2)::numeric,0))
        *i.role_probability*i.availability
      ) aw
    from public.scout_replay_player_inputs i
    where i.gameweek=v_target and i.benchmark_version=v_benchmark
  ), win as (
    select p.id player_id,
      coalesce((select avg(case when z.minutes>=60 then 1 else 0 end)::numeric from (
        select w.minutes from public.scout_player_weekly_points w
        where w.player_id=p.id and w.gameweek<=v_cur.gameweek and w.is_final=true
        order by w.gameweek desc limit 2) z),0) l2xi,
      coalesce((select avg(case when z.minutes>=60 then 1 else 0 end)::numeric from (
        select w.minutes from public.scout_player_weekly_points w
        where w.player_id=p.id and w.gameweek<=v_cur.gameweek-2 and w.is_final=true
        order by w.gameweek desc limit 2) z),0) p2xi,
      coalesce((select avg(z.minutes)::numeric from (
        select w.minutes from public.scout_player_weekly_points w
        where w.player_id=p.id and w.gameweek<=v_cur.gameweek and w.is_final=true
        order by w.gameweek desc limit 2) z),0) l2m,
      coalesce((select avg(z.minutes)::numeric from (
        select w.minutes from public.scout_player_weekly_points w
        where w.player_id=p.id and w.gameweek<=v_cur.gameweek-2 and w.is_final=true
        order by w.gameweek desc limit 2) z),0) p2m
    from public.scout_players p where p.active=true
  ), norm as (
    select i.*,
      i.gw/nullif(sum(i.gw) over(partition by i.club_id),0) goal_share,
      i.aw/nullif(sum(i.aw) over(partition by i.club_id),0) assist_share,
      w.l2xi,w.p2xi,w.l2m,w.p2m
    from inp i join win w on w.player_id=i.player_id
  )
  insert into public.scout_role_signals(
    run_id,player_id,last2_xi_probability,previous2_xi_probability,last2_minutes,previous2_minutes,
    signal,predicted_xi_probability,x_minutes,team_goal_share,team_assist_share,availability_probability
  )
  select v_candidate,player_id,l2xi,p2xi,l2m,p2m,
         case when l2m-p2m>=10 then 'rising' when l2m-p2m<=-10 then 'falling' else 'stable' end,
         role_probability,
         least(90,role_probability*(
           .35*(durations->>0)::numeric+.25*(durations->>1)::numeric+.18*(durations->>2)::numeric+
           .13*(durations->>3)::numeric+.09*(durations->>4)::numeric
         )),
         goal_share,assist_share,availability
  from norm;

  with sides as (
    select home_team_id team_id,away_team_id opponent_id,'HOME'::text venue,home_lambda team_lambda,away_lambda opp_lambda
    from public.scout_replay_match_inputs
    where gameweek=v_target and benchmark_version=v_benchmark
    union all
    select away_team_id,home_team_id,'AWAY',away_lambda,home_lambda
    from public.scout_replay_match_inputs
    where gameweek=v_target and benchmark_version=v_benchmark
  )
  insert into public.scout_player_projections(
    run_id,player_id,opponent_name,venue,xi_probability,appearance_probability,over60_probability,x_minutes,
    core_xfp,x_bonus,xfp,p25,p75,p90,six_plus_probability,value_score,data_confidence,role_note,
    expected_goals,expected_assists,mc_standard_error,availability_source,availability_probability,
    top25_score,top25_rank,top25_model_version,confidence
  )
  select v_candidate,p.id,opp.name,s.venue,
         rs.predicted_xi_probability,
         least(1,rs.predicted_xi_probability+.12*(1-rs.predicted_xi_probability)),
         greatest(0,least(1,rs.predicted_xi_probability*.90)),rs.x_minutes,
         0,0,0,0,0,0,0,0,
         coalesce(cp.data_confidence,'medium'),
         'weekly-auto • '||coalesce(p.primary_role,p.position),
         s.team_lambda*rs.team_goal_share*rs.x_minutes/90,
         s.team_lambda*.67*rs.team_assist_share*rs.x_minutes/90,
         null,'weekly-lifecycle',rs.availability_probability,
         null,null,null,coalesce(cp.confidence,'medium')
  from public.scout_players p
  join public.scout_role_signals rs on rs.run_id=v_candidate and rs.player_id=p.id
  join sides s on s.team_id=p.team_id
  join public.scout_teams opp on opp.id=s.opponent_id
  left join public.scout_player_projections cp on cp.run_id=v_cur.id and cp.player_id=p.id
  where p.active=true;

  select count(*) into v_active from public.scout_players where active=true;
  if (select count(*) from public.scout_player_projections where run_id=v_candidate)<>v_active then
    raise exception 'candidate projection coverage failed';
  end if;
  if (select count(*) from public.scout_replay_match_inputs where gameweek=v_target and benchmark_version=v_benchmark)<>9 then
    raise exception 'candidate fixture inputs failed';
  end if;

  select * into v_parent_gate from public.scout_run_release_gates where run_id=v_cur.id;
  insert into public.scout_run_release_gates(
    run_id,qa_pass,data_integrity_pass,backtest_pass,availability_freshness,checked_at,checked_by,details
  ) values(
    v_candidate,false,false,false,false,now(),'github-actions/weekly-lifecycle',
    jsonb_build_object('parent_run_id',v_cur.id,'parent_backtest_pass',coalesce(v_parent_gate.backtest_pass,false))
  )
  on conflict(run_id) do update set
    qa_pass=false,data_integrity_pass=false,backtest_pass=false,availability_freshness=false,
    checked_at=now(),checked_by='github-actions/weekly-lifecycle',
    details=excluded.details;

  insert into public.scout_weekly_cycles(
    current_gameweek,target_gameweek,current_run_id,candidate_run_id,benchmark_version,status,last_stage,started_at,updated_at
  ) values(
    v_cur.gameweek,v_target,v_cur.id,v_candidate,v_benchmark,'running','prepared',now(),now()
  )
  on conflict(current_gameweek) do update set
    target_gameweek=excluded.target_gameweek,current_run_id=excluded.current_run_id,
    candidate_run_id=excluded.candidate_run_id,benchmark_version=excluded.benchmark_version,
    status='running',last_stage='prepared',last_error=null,
    started_at=coalesce(public.scout_weekly_cycles.started_at,now()),updated_at=now(),completed_at=null;

  return jsonb_build_object(
    'ok',true,'current_gameweek',v_cur.gameweek,'target_gameweek',v_target,
    'candidate_run_id',v_candidate,'benchmark_version',v_benchmark,
    'active_players',v_active,'home_scale',v_home_scale,'away_scale',v_away_scale
  );
end;
$$;

create or replace function public.scout_apply_live_accum(p_run_id uuid,p_gameweek integer,p_benchmark text)
returns integer
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_count integer;
  v_min_draws integer;
begin
  select min(draws) into v_min_draws
  from public.scout_replay_sim_accum
  where gameweek=p_gameweek and benchmark_version=p_benchmark;
  if coalesce(v_min_draws,0)<50000 then
    raise exception 'simulation accumulator incomplete: %',coalesce(v_min_draws,0);
  end if;

  with s as (
    select f.*,a.sum_xgoal/nullif(a.draws,0) expected_goals,a.sum_xassist/nullif(a.draws,0) expected_assists
    from public.replay_accum_full_stats(p_gameweek,p_benchmark) f
    join public.scout_replay_sim_accum a
      on a.gameweek=p_gameweek and a.benchmark_version=p_benchmark and a.player_id=f.player_id
  )
  update public.scout_player_projections p
  set xi_probability=s.xi_probability,
      appearance_probability=s.appearance_probability,
      over60_probability=s.over60_probability,
      x_minutes=s.x_minutes,
      core_xfp=s.core_xfp,
      x_bonus=s.x_bonus,
      xfp=s.xfp,
      p25=s.p25,
      p75=s.p75,
      p90=s.p90,
      six_plus_probability=s.six_plus_probability,
      mc_standard_error=s.mc_standard_error,
      expected_goals=s.expected_goals,
      expected_assists=s.expected_assists,
      value_score=case when sp.price>0 then s.xfp/sp.price else null end
  from s join public.scout_players sp on sp.id=s.player_id
  where p.run_id=p_run_id and p.player_id=s.player_id;
  get diagnostics v_count=row_count;

  update public.scout_role_signals rs
  set predicted_xi_probability=p.xi_probability,
      x_minutes=p.x_minutes,
      availability_probability=p.availability_probability
  from public.scout_player_projections p
  where p.run_id=p_run_id and rs.run_id=p_run_id and rs.player_id=p.player_id;

  update public.scout_model_runs
  set simulation_count=v_min_draws,source_updated_at=now()
  where id=p_run_id and gameweek=p_gameweek and is_current=false;

  update public.scout_weekly_cycles
  set last_stage='simulated',updated_at=now()
  where candidate_run_id=p_run_id;

  return v_count;
end;
$$;

create or replace function public.scout_mark_candidate_ready(p_run_id uuid,p_gameweek integer,p_benchmark text)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_active integer;
  v_proj integer;
  v_roles integer;
  v_top integer;
  v_recs integer;
  v_min_draws integer;
begin
  select count(*) into v_active from public.scout_players where active=true;
  select count(*) into v_proj from public.scout_player_projections where run_id=p_run_id;
  select count(*) into v_roles from public.scout_role_signals where run_id=p_run_id;
  select count(*) into v_top from public.scout_player_projections
    where run_id=p_run_id and top25_rank is not null and top25_score is not null;
  select count(*) into v_recs from public.scout_squad_recommendations where run_id=p_run_id;
  select min(draws) into v_min_draws from public.scout_replay_sim_accum
    where gameweek=p_gameweek and benchmark_version=p_benchmark;

  if v_proj<>v_active or v_roles<>v_active or v_top<>v_active or v_recs<>2 or coalesce(v_min_draws,0)<50000 then
    raise exception 'candidate incomplete active=% proj=% roles=% top=% recs=% draws=%',
      v_active,v_proj,v_roles,v_top,v_recs,coalesce(v_min_draws,0);
  end if;

  update public.scout_model_runs set status='ready' where id=p_run_id and is_current=false;
  update public.scout_weekly_cycles set last_stage='ready',updated_at=now() where candidate_run_id=p_run_id;
  return jsonb_build_object('ok',true,'run_id',p_run_id,'gameweek',p_gameweek,'simulation_count',v_min_draws);
end;
$$;

commit;
