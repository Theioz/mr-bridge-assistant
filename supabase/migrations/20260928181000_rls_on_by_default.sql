-- Every new table in public gets row level security AUTOMATICALLY, so a forgotten policy
-- fails closed (nobody can read it) instead of open.
--
-- WHY. 20260928180000 stopped new objects granting anything to `anon`, but default
-- privileges still grant `authenticated` ALL on every new table, and this is a
-- multi-tenant database (see /admin/tenants). A table created without RLS would be readable
-- and writable by EVERY signed-in user, including other tenants' rows. public.exercises
-- showed how that happens: created by hand-run DDL, RLS never switched on, found only by an
-- audit two months later.
--
-- WHAT IT DOES. An event trigger on CREATE TABLE / CREATE TABLE AS / SELECT INTO enables RLS
-- on any new table in public and raises a NOTICE saying so. With RLS on and no policy, the
-- API returns zero rows to anon and authenticated; the service role and the table owner are
-- unaffected. So the failure mode of forgetting a policy is "the feature shows nothing", which
-- is noticed at once in development, not "every tenant sees every row", which is not.
--
-- Not SECURITY DEFINER: the function runs as whoever ran the DDL, who owns the new table and
-- can therefore enable RLS on it. Event triggers must be created by a superuser, so apply as
-- supabase_admin (same as 20260928180000).

begin;

create or replace function public.rls_on_new_public_tables()
 returns event_trigger
 language plpgsql
 set search_path to ''
as $function$
declare
  obj record;
begin
  for obj in
    select * from pg_event_trigger_ddl_commands()
    where object_type = 'table' and schema_name = 'public'
  loop
    execute format('alter table %s enable row level security', obj.object_identity);
    raise notice 'row level security enabled on % (on by default for public tables; add policies)',
      obj.object_identity;
  end loop;
end
$function$;

-- Not an RPC: an event_trigger function cannot be called directly, but grant nothing anyway.
revoke all on function public.rls_on_new_public_tables() from public, anon, authenticated, service_role;

drop event trigger if exists rls_on_new_public_tables;
create event trigger rls_on_new_public_tables
  on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function public.rls_on_new_public_tables();

-- Prove it inside this transaction: a fresh table must come out with RLS on.
create table public.zz_rls_default_probe (id int);
do $assert$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.zz_rls_default_probe'::regclass) then
    raise exception 'event trigger did not enable RLS on a new public table';
  end if;
end
$assert$;
drop table public.zz_rls_default_probe;

commit;
