revoke execute on function public.apply_live_accum_to_run(uuid, integer, text) from public;
revoke execute on function public.apply_live_accum_to_run(uuid, integer, text) from anon;
revoke execute on function public.apply_live_accum_to_run(uuid, integer, text) from authenticated;
grant execute on function public.apply_live_accum_to_run(uuid, integer, text) to service_role;
