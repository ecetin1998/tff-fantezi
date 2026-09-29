begin;
alter table public.scout_goal_distribution_config
  add column if not exists gate_passed boolean not null default false,
  add column if not exists gate_benchmark text;
update public.scout_goal_distribution_config
set gate_passed=true,
    gate_benchmark='MH4-MH6 • 50K deterministic overdispersion gate'
where version='goal-dist-v1'
  and distribution='NB2'
  and trained_through=6
  and active=true;
commit;
