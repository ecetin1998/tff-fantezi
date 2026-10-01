-- Safe public summary for the Model Health screen.
-- Exposes only release flags, timestamps and coverage counts; raw QA JSON stays protected.
create or replace function public.scout_public_model_health(p_run_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'qa_pass', coalesce(q.pass,false),
    'data_integrity_pass', coalesce((q.data_integrity_qa->>'pass')::boolean,false),
    'artifacts_pass', coalesce((q.model_qa->>'artifacts_pass')::boolean,false),
    'optimizer_pass',
      coalesce((q.model_qa->>'invalid_recommendations')::integer,0)=0
      and coalesce((q.model_qa->>'invalid_recommendation_members')::integer,0)=0,
    'checked_at', q.recorded_at,
    'decision_at', coalesce(f.availability_checked_at,r.source_updated_at),
    'projections', (select count(*) from public.scout_player_projections p where p.run_id=r.id),
    'availability', (select count(*) from public.scout_availability a where a.run_id=r.id),
    'roles', (select count(*) from public.scout_role_signals s where s.run_id=r.id),
    'teams', (select count(*) from public.scout_team_tactical_profiles t where t.season='2026-27')
  )
  from public.scout_model_runs r
  left join public.scout_run_qa_results q on q.run_id=r.id
  left join public.v_scout_public_freshness f on f.run_id=r.id
  where r.id=p_run_id
    and r.is_current=true
  limit 1
$$;

revoke all on function public.scout_public_model_health(uuid) from public;
grant execute on function public.scout_public_model_health(uuid) to anon, authenticated;
