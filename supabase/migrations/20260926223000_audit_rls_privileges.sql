-- Read-only audit; this file changes nothing.
select n.nspname schema_name,c.relname table_name,c.relrowsecurity rls_enabled,c.relforcerowsecurity force_rls
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' and c.relname like 'scout_%'
order by c.relname;

select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
from pg_policies
where schemaname='public' and tablename like 'scout_%'
order by tablename,policyname;

select grantee,table_name,privilege_type
from information_schema.role_table_grants
where table_schema='public' and table_name like 'scout_%'
and grantee in ('anon','authenticated')
order by table_name,grantee,privilege_type;

select grantee,table_name,column_name,privilege_type
from information_schema.column_privileges
where table_schema='public'
and table_name in ('scout_availability','scout_model_runs','scout_learning_log')
and grantee in ('anon','authenticated')
order by table_name,grantee,column_name;

select p.oid::regprocedure::text signature,p.prosecdef security_definer,p.provolatile volatility,
coalesce(array_to_string(p.proacl,','),'') acl
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
and (p.proname in ('scout_run_qa','scout_data_integrity_qa','scout_promote_run') or p.proname ilike '%replay%')
order by p.proname;
