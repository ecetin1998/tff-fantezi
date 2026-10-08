-- First 100 waitlist accounts receive free launch Pro after verified email.
-- Existing applicants retain their chronological position.
create or replace function public.scout_claim_launch_pro()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_rank bigint;
  v_email text;
  v_verified boolean;
  v_existing record;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(20261009, 100);
  insert into public.scout_pro_interest(user_id,source)
    values(v_uid,'pricing')
    on conflict (user_id) do nothing;
  select position into v_rank from (
    select user_id,row_number() over(order by created_at,user_id) as position
    from public.scout_pro_interest
  ) ranked where user_id=v_uid;
  if v_rank > 100 then return jsonb_build_object('status','full'); end if;
  select email into v_email from auth.users where id=v_uid;
  select exists(
    select 1 from public.scout_email_verifications
    where user_id=v_uid and email=v_email and verified_at is not null
  ) into v_verified;
  if not v_verified then return jsonb_build_object('status','verify_email'); end if;
  select plan,status,provider,valid_until into v_existing from public.scout_subscriptions where user_id=v_uid;
  if found and v_existing.plan='pro' and v_existing.status in ('active','trialing')
    and (v_existing.valid_until is null or v_existing.valid_until>now())
  then return jsonb_build_object('status','activated'); end if;
  insert into public.scout_subscriptions(user_id,plan,status,provider,valid_until,updated_at)
  values(v_uid,'pro','active','launch100',null,now())
  on conflict (user_id) do update set
    plan='pro',status='active',provider='launch100',valid_until=null,updated_at=now()
  where public.scout_subscriptions.provider is null
    or public.scout_subscriptions.provider='launch100'
    or public.scout_subscriptions.status not in ('active','trialing');
  return jsonb_build_object('status','activated');
end;
$$;
revoke all on function public.scout_claim_launch_pro() from public,anon;
grant execute on function public.scout_claim_launch_pro() to authenticated;
