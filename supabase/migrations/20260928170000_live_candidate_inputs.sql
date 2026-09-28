begin;

create table if not exists public.scout_model_input_meta (
  run_id uuid primary key references public.scout_model_runs(id) on delete cascade,
  source_run_id uuid references public.scout_model_runs(id),
  source_gameweek integer not null,
  source_benchmark text,
  enrichment_version text not null,
  availability_checked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.scout_model_player_inputs (
  run_id uuid not null references public.scout_model_runs(id) on delete cascade,
  player_id bigint not null references public.scout_players(id) on delete cascade,
  club_id bigint not null references public.scout_teams(id),
  position text not null,
  price numeric not null,
  availability numeric not null,
  role_probability numeric not null,
  bench_weight numeric not null,
  durations jsonb not null,
  duration_weights jsonb not null,
  rates jsonb not null,
  data_confidence text,
  sub_role text,
  role_side text,
  effective_xa_per90 numeric,
  source_note text,
  created_at timestamptz not null default now(),
  primary key(run_id,player_id)
);

create table if not exists public.scout_model_match_inputs (
  run_id uuid not null references public.scout_model_runs(id) on delete cascade,
  match_id integer not null,
  gameweek integer not null,
  home_team_id bigint not null references public.scout_teams(id),
  away_team_id bigint not null references public.scout_teams(id),
  home_lambda numeric not null,
  away_lambda numeric not null,
  kickoff_at timestamptz,
  primary key(run_id,match_id)
);

create index if not exists idx_scout_model_player_inputs_club
  on public.scout_model_player_inputs(run_id,club_id);
create index if not exists idx_scout_model_match_inputs_gw
  on public.scout_model_match_inputs(run_id,gameweek);

alter table public.scout_model_input_meta enable row level security;
alter table public.scout_model_player_inputs enable row level security;
alter table public.scout_model_match_inputs enable row level security;

revoke all on public.scout_model_input_meta from anon,authenticated;
revoke all on public.scout_model_player_inputs from anon,authenticated;
revoke all on public.scout_model_match_inputs from anon,authenticated;

create or replace function public.refresh_top25_live_gb(p_run_id uuid)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_count integer;
  v_gameweek integer;
  v_model text;
begin
  select r.gameweek into v_gameweek
  from public.scout_model_runs r
  where r.id=p_run_id;

  if v_gameweek is null then
    raise exception 'Unknown Scout run %',p_run_id;
  end if;

  select m.model_version into v_model
  from private.top25_gb_models m
  where m.trained_through < v_gameweek
  order by m.trained_through desc,m.created_at desc
  limit 1;

  if v_model is null then
    raise exception 'No Top25 GB model trained before gameweek %',v_gameweek;
  end if;

  with cfg as (
    select * from private.top25_gb_models where model_version=v_model
  ),
  match_side as (
    select home_team_id club_id,home_lambda team_lambda,away_lambda opp_lambda
    from public.scout_model_match_inputs where run_id=p_run_id
    union all
    select away_team_id,away_lambda,home_lambda
    from public.scout_model_match_inputs where run_id=p_run_id
  ),
  base as (
    select p.player_id,
      coalesce(p.xfp,0)::numeric xfp,coalesce(p.x_minutes,0)::numeric pmin,
      coalesce(p.six_plus_probability,0)::numeric p6,coalesce(p.p90,0)::numeric p90,
      coalesce(p.p75,0)::numeric p75,coalesce(i.price,0)::numeric price,
      coalesce(i.role_probability,0)::numeric role,coalesce(i.bench_weight,0)::numeric benchw,
      coalesce((select avg(z.points)::numeric from (
        select w.points from public.scout_player_weekly_points w
        where w.player_id=p.player_id and w.gameweek<v_gameweek and w.minutes>0 and w.is_final=true
        order by w.gameweek desc limit 2) z),0) recent2_pts,
      coalesce((select avg(z.points)::numeric from (
        select w.points from public.scout_player_weekly_points w
        where w.player_id=p.player_id and w.gameweek<v_gameweek and w.minutes>0 and w.is_final=true
        order by w.gameweek desc limit 4) z),0) recent4_pts,
      coalesce((select avg(z.minutes)::numeric from (
        select w.minutes from public.scout_player_weekly_points w
        where w.player_id=p.player_id and w.gameweek<v_gameweek and w.is_final=true
        order by w.gameweek desc limit 2) z),0) recent2_min,
      coalesce((select stddev_pop(z.points)::numeric from (
        select w.points from public.scout_player_weekly_points w
        where w.player_id=p.player_id and w.gameweek<v_gameweek and w.minutes>0 and w.is_final=true
        order by w.gameweek desc limit 4) z),0) recent4_sd,
      coalesce((i.rates->>0)::numeric,0) xg90,
      coalesce((i.rates->>1)::numeric,0) g90,
      coalesce((i.rates->>2)::numeric,0) a90,
      coalesce((i.rates->>3)::numeric,0) xa90,
      coalesce((i.rates->>4)::numeric,0) yc90,
      coalesce((i.rates->>5)::numeric,0) rc90,
      coalesce((i.rates->>6)::numeric,0) saves90,
      coalesce((i.rates->>10)::numeric,0) shots90,
      coalesce((i.rates->>11)::numeric,0) sot90,
      coalesce(ms.team_lambda,1.3)::numeric team_lambda,
      coalesce(ms.opp_lambda,1.3)::numeric opp_lambda,
      exp(-coalesce(ms.opp_lambda,1.3))::numeric cs_prob,
      i.position
    from public.scout_player_projections p
    join public.scout_model_player_inputs i
      on i.run_id=p.run_id and i.player_id=p.player_id
    left join match_side ms on ms.club_id=i.club_id
    where p.run_id=p_run_id
  ),
  fv as (
    select b.*,
      b.xg90*b.pmin/90 xgMin,b.g90*b.pmin/90 gMin,b.a90*b.pmin/90 aMin,
      b.sot90*b.pmin/90 sotMin,b.cs_prob*b.pmin/90 csMin,
      case when b.position='GK' then 1 else 0 end isGK,
      case when b.position='DEF' then 1 else 0 end isDEF,
      case when b.position='MID' then 1 else 0 end isMID,
      case when b.position='FWD' then 1 else 0 end isFWD,
      b.xfp*case when b.position='MID' then 1 else 0 end xfpMID,
      b.xfp*case when b.position='FWD' then 1 else 0 end xfpFWD,
      b.xfp*case when b.position='DEF' then 1 else 0 end xfpDEF,
      b.xfp*case when b.position='GK' then 1 else 0 end xfpGK,
      b.recent2_pts*case when b.position='MID' then 1 else 0 end formMID,
      b.recent2_pts*case when b.position='FWD' then 1 else 0 end formFWD
    from base b
  ),
  stump_eval as (
    select f.player_id,s.seq,
      case s.feature
        when 'xfp' then f.xfp when 'pmin' then f.pmin when 'p6' then f.p6
        when 'p90' then f.p90 when 'p75' then f.p75 when 'price' then f.price
        when 'role' then f.role when 'benchw' then f.benchw
        when 'recent2_pts' then f.recent2_pts when 'recent4_pts' then f.recent4_pts
        when 'recent2_min' then f.recent2_min when 'recent4_sd' then f.recent4_sd
        when 'xg90' then f.xg90 when 'g90' then f.g90 when 'a90' then f.a90
        when 'xa90' then f.xa90 when 'yc90' then f.yc90 when 'rc90' then f.rc90
        when 'saves90' then f.saves90 when 'shots90' then f.shots90 when 'sot90' then f.sot90
        when 'team_lambda' then f.team_lambda when 'opp_lambda' then f.opp_lambda
        when 'cs_prob' then f.cs_prob when 'isGK' then f.isGK when 'isDEF' then f.isDEF
        when 'isMID' then f.isMID when 'isFWD' then f.isFWD
        when 'xgMin' then f.xgMin when 'gMin' then f.gMin when 'aMin' then f.aMin
        when 'sotMin' then f.sotMin when 'csMin' then f.csMin
        when 'xfpMID' then f.xfpMID when 'xfpFWD' then f.xfpFWD
        when 'xfpDEF' then f.xfpDEF when 'xfpGK' then f.xfpGK
        when 'formMID' then f.formMID when 'formFWD' then f.formFWD else 0 end feature_value,
      s.threshold,s.left_value,s.right_value
    from fv f cross join private.top25_gb_stumps s
    where s.model_version=v_model
  ),
  gb as (
    select f.player_id,f.xfp,f.position,
      c.base_value+c.learning_rate*sum(case when e.feature_value<=e.threshold then e.left_value else e.right_value end) gb_raw
    from fv f join stump_eval e on e.player_id=f.player_id cross join cfg c
    group by f.player_id,f.xfp,f.position,c.base_value,c.learning_rate
  ),
  norm as (
    select g.*,
      (g.xfp-avg(g.xfp) over())/nullif(stddev_pop(g.xfp) over(),0) zx,
      (g.gb_raw-avg(g.gb_raw) over())/nullif(stddev_pop(g.gb_raw) over(),0) zgb
    from gb g
  ),
  scored as (
    select n.player_id,
      n.zx+c.ensemble_alpha*n.zgb+
      case n.position when 'FWD' then c.fwd_offset when 'GK' then c.gk_offset
           when 'DEF' then c.def_offset when 'MID' then c.mid_offset else 0 end score
    from norm n cross join cfg c
  ),
  ranked as (
    select player_id,score,row_number() over(order by score desc,player_id) rnk from scored
  )
  update public.scout_player_projections p
  set top25_score=r.score,top25_rank=r.rnk,
      top25_model_version='Top25 GB live • '||v_model
  from ranked r
  where p.run_id=p_run_id and p.player_id=r.player_id;

  get diagnostics v_count=row_count;
  return v_count;
end;
$$;

revoke all on function public.refresh_top25_live_gb(uuid) from public,anon,authenticated;
grant execute on function public.refresh_top25_live_gb(uuid) to service_role;

commit;
