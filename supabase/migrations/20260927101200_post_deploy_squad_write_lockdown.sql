-- POST-DEPLOY ONLY.
-- The audited app writes user squads exclusively through public.save_user_squad(jsonb).
-- Keep SELECT + owner RLS; close direct browser DML so RPC validation cannot be bypassed.
revoke insert,update,delete on public.scout_user_squads from authenticated;
revoke insert,update,delete on public.scout_user_squad_members from authenticated;

revoke all on function public.save_user_squad(jsonb) from public,anon;
grant execute on function public.save_user_squad(jsonb) to authenticated;
