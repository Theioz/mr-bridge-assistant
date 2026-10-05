-- Take TRUNCATE, TRIGGER, MAINTAIN and REFERENCES away from `authenticated` (#756).
--
-- The default privileges of BOTH table-creating roles granted `authenticated` every table
-- privilege on new tables in public:
--     postgres:       authenticated=arwdDxtm/postgres
--     supabase_admin: authenticated=arwdDxtm/supabase_admin
-- a/r/w/d (INSERT, SELECT, UPDATE, DELETE) are what the app uses, and row-level security fences
-- them to the user's own rows. D (TRUNCATE), t (TRIGGER) and m (MAINTAIN, PG17) are NOT governed by
-- RLS: TRUNCATE empties a table whatever the policies say. x (REFERENCES) only matters for
-- creating foreign keys. On 2026-10-05, 33 public tables carried all four for `authenticated`.
--
-- NOT REACHABLE TODAY, which is why this is P3. PostgREST exposes no TRUNCATE/TRIGGER/MAINTAIN, and
-- no function `authenticated` can EXECUTE runs dynamic SQL. But each new SECURITY INVOKER RPC
-- would have inherited them, so the fence stops depending on that staying true.
--
-- NOTHING IN THE APP USES THEM (checked 2026-10-05): no TRUNCATE, trigger creation or maintenance
-- in web/ or scripts/. The 4 RPC/trigger functions that do real work are SECURITY DEFINER and run
-- as their owner. The 5 invoker trigger functions only validate or stamp columns.
-- rls_on_new_public_tables (#745) fires on DDL by migration roles, never by `authenticated`.
-- Scripts use the service role, which is untouched.
--
-- APPLY AS supabase_admin. It owns two tables and its own default privileges, and only it is a
-- superuser here, so `postgres` can neither revoke its grants nor alter its defaults:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < <this file>
-- The assertions at the end raise, rolling the whole transaction back, if any of it did not take.

begin;

-- 1. Existing tables, views and materialized views.
revoke truncate, trigger, maintain, references on all tables in schema public from authenticated;

-- 2. Future tables, for both roles that create them.
alter default privileges for role postgres in schema public
  revoke truncate, trigger, maintain, references on tables from authenticated;
alter default privileges for role supabase_admin in schema public
  revoke truncate, trigger, maintain, references on tables from authenticated;

-- 3. Assert the end state.
do $assert$
declare
  leftover int;
  bad_default text;
begin
  select count(*) into leftover
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p', 'f')
    and (has_table_privilege('authenticated', c.oid, 'TRUNCATE')
      or has_table_privilege('authenticated', c.oid, 'TRIGGER')
      or has_table_privilege('authenticated', c.oid, 'MAINTAIN')
      or has_table_privilege('authenticated', c.oid, 'REFERENCES'));
  if leftover > 0 then
    raise exception '#756: % public relation(s) still grant TRUNCATE/TRIGGER/MAINTAIN/REFERENCES to authenticated', leftover;
  end if;

  select string_agg(pg_get_userbyid(d.defaclrole) || ': ' || a::text, '; ') into bad_default
  from pg_default_acl d
  join pg_namespace n on n.oid = d.defaclnamespace
  cross join lateral unnest(d.defaclacl) as a
  where n.nspname = 'public' and d.defaclobjtype = 'r'
    and a::text like 'authenticated=%'
    and split_part(split_part(a::text, '=', 2), '/', 1) ~ '[Dtmx]';
  if bad_default is not null then
    raise exception '#756: default privileges still grant authenticated D/t/m/x: %', bad_default;
  end if;

  -- What the app does use must survive.
  if not has_table_privilege('authenticated', 'public.tasks', 'SELECT, INSERT, UPDATE, DELETE') then
    raise exception '#756: authenticated lost SELECT/INSERT/UPDATE/DELETE on tasks';
  end if;
end
$assert$;

commit;
