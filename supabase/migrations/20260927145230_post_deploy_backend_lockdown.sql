-- POST-DEPLOY ONLY: the new app reads persisted QA results instead of calling QA RPCs.
revoke all on function public.scout_run_qa(uuid) from public,anon,authenticated;
revoke all on function public.scout_data_integrity_qa(uuid) from public,anon,authenticated;
grant execute on function public.scout_run_qa(uuid) to service_role;
grant execute on function public.scout_data_integrity_qa(uuid) to service_role;
