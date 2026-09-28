-- Lock down the `anon` role: RLS stops being the only thing between a keyless request and
-- the data.
--
-- WHY. The self-hosted gateway (Caddy) routes /rest/v1/* straight to PostgREST, with no Kong
-- apikey gate in front. A request without a key therefore runs as `anon`, and on 2026-09-28
-- an audit found what `anon` could reach:
--   * public.exercises: RLS OFF, and anon held SELECT/INSERT/UPDATE/DELETE. Confirmed
--     keyless: `HEAD /rest/v1/exercises` -> 206, */40. Anyone on the LAN/tailnet could have
--     edited or wiped the workout library.
--   * estimate_user_storage(p_user_id): SECURITY DEFINER, EXECUTE granted to anon, and no
--     check on the caller, so it returned any user's per-table row counts to anyone who knew
--     their uuid.
--   * decrypt_/encrypt_integration_token: SECURITY DEFINER, EXECUTE granted to anon. Not
--     exploitable (the caller must supply the key), but anon has no reason to call them.
-- Every personal-data table WAS safe: RLS on, and the only policies reaching anon require
-- auth.uid() = user_id, which is null for anon. `HEAD /rest/v1/profile` -> */0.
--
-- ROOT CAUSE, and the part that scales. The default privileges for BOTH object-creating
-- roles (postgres: 33 tables, supabase_admin: 2) grant anon ALL on every new table,
-- sequence and function in public. Each new table was anon-writable until someone
-- remembered RLS; exercises is the one where nobody did. Part 3 removes that default, so
-- forgetting RLS on a future table is no longer a hole.
--
-- NO BEHAVIOUR CHANGE FOR THE APP (traced 2026-09-28): nothing queries data as anon. Share
-- pages and admin pages use the service-role client, and the auth callback queries only
-- after exchanging the code for a session. Every other path is signed in (`authenticated`)
-- or the service role. `authenticated` keeps its own direct grants. The Google Calendar
-- routes call decrypt_integration_token with the USER client, so authenticated must keep
-- EXECUTE there, and does.
--
-- APPLY AS supabase_admin. Two objects are owned by it (inventory_draws,
-- cooks_restore_inventory), and a REVOKE by postgres cannot remove grants that
-- supabase_admin made. Only the grantor or a superuser can, and postgres is not a superuser here:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < <this file>
-- then NOTIFY pgrst, 'reload schema' (included at the end).
-- Part 5 asserts the end state and raises, rolling the whole transaction back, if any of it
-- did not take.

begin;

-- 1. exercises -------------------------------------------------------------------------------
-- Created by hand-run DDL on 2026-07-20 and never captured in a migration, so a rebuild from
-- this directory would have lost the table. Captured here; a no-op where it exists.
create table if not exists public.exercises (
  id uuid default gen_random_uuid() not null primary key,
  name text not null unique,
  pattern text,
  equipment text,
  primary_muscles text,
  description text,
  cues text[],
  source_note text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- A shared reference catalog (movements, cues). Signed-in users may read it. Writes stay with
-- the service role and hand-run SQL, which bypass RLS; no app code writes it.
alter table public.exercises enable row level security;
revoke all on public.exercises from anon;
revoke insert, update, delete, truncate, references, trigger on public.exercises from authenticated;
grant select on public.exercises to authenticated;
drop policy if exists exercises_read_authenticated on public.exercises;
create policy exercises_read_authenticated on public.exercises
  for select to authenticated using (true);

-- 2. anon holds nothing in public ------------------------------------------------------------
-- A no-op for every RLS-protected table (anon already saw zero rows); it removes the
-- dependency on RLS being the ONLY lock.
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon, public;
-- Revoking PUBLIC must not strip the roles that legitimately call these. They hold direct
-- grants today; re-assert them so this migration can never be the thing that removes them.
-- (Trigger functions need no EXECUTE to fire; this is for the RPC-callable ones.)
grant execute on all functions in schema public to authenticated, service_role;

-- 3. ...and gets nothing on objects created from now on ------------------------------------
alter default privileges for role postgres       in schema public revoke all on tables    from anon;
alter default privileges for role postgres       in schema public revoke all on sequences from anon;
alter default privileges for role postgres       in schema public revoke all on functions from anon;
alter default privileges for role supabase_admin in schema public revoke all on tables    from anon;
alter default privileges for role supabase_admin in schema public revoke all on sequences from anon;
alter default privileges for role supabase_admin in schema public revoke all on functions from anon;
-- Functions are also EXECUTE-able by PUBLIC via Postgres' GLOBAL default, which the
-- per-schema entries above cannot touch. authenticated and service_role keep EXECUTE through
-- the per-schema defaults, which still grant it to them explicitly.
alter default privileges for role postgres       revoke execute on functions from public;
alter default privileges for role supabase_admin revoke execute on functions from public;

-- 4. estimate_user_storage: only for yourself -----------------------------------------------
-- Same calculation, byte for byte (copied from the live definition); now plpgsql so it can
-- refuse a caller asking about someone else. The only caller, /api/usage/storage, passes the
-- signed-in user's own id. The service role is allowed, for admin use.
create or replace function public.estimate_user_storage(p_user_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if p_user_id is distinct from auth.uid()
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'estimate_user_storage: may only be called for your own user'
      using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'tasks', jsonb_build_object(
        'rows',
          (select count(*) from public.tasks t where t.user_id = p_user_id)
          + (select count(*) from public.study_log t where t.user_id = p_user_id),
        'bytes',
          coalesce((
            (select count(*) from public.tasks t where t.user_id = p_user_id)::numeric
            / nullif((select count(*) from public.tasks)::numeric, 0)
            * pg_total_relation_size('public.tasks'::regclass)
          )::bigint, 0)
          + coalesce((
            (select count(*) from public.study_log t where t.user_id = p_user_id)::numeric
            / nullif((select count(*) from public.study_log)::numeric, 0)
            * pg_total_relation_size('public.study_log'::regclass)
          )::bigint, 0)
      ),
      'habits', jsonb_build_object(
        'rows',
          (select count(*) from public.habits t where t.user_id = p_user_id)
          + (select count(*) from public.habit_registry t where t.user_id = p_user_id),
        'bytes',
          coalesce((
            (select count(*) from public.habits t where t.user_id = p_user_id)::numeric
            / nullif((select count(*) from public.habits)::numeric, 0)
            * pg_total_relation_size('public.habits'::regclass)
          )::bigint, 0)
          + coalesce((
            (select count(*) from public.habit_registry t where t.user_id = p_user_id)::numeric
            / nullif((select count(*) from public.habit_registry)::numeric, 0)
            * pg_total_relation_size('public.habit_registry'::regclass)
          )::bigint, 0)
      ),
      'fitness', jsonb_build_object(
        'rows',
          (select count(*) from public.fitness_log t where t.user_id = p_user_id)
          + (select count(*) from public.workout_sessions t where t.user_id = p_user_id)
          + (select count(*) from public.workout_plans t where t.user_id = p_user_id)
          + (select count(*) from public.strength_sessions t where t.user_id = p_user_id)
          + (select count(*) from public.strength_session_sets ss
              join public.strength_sessions s on s.id = ss.session_id
              where s.user_id = p_user_id)
          + (select count(*) from public.recovery_metrics t where t.user_id = p_user_id)
          + (select count(*) from public.exercise_prs t where t.user_id = p_user_id)
          + (select count(*) from public.user_equipment t where t.user_id = p_user_id),
        'bytes',
          coalesce((
            (select count(*) from public.fitness_log t where t.user_id = p_user_id)::numeric
            / nullif((select count(*) from public.fitness_log)::numeric, 0)
            * pg_total_relation_size('public.fitness_log'::regclass)
          )::bigint, 0)
          + coalesce((
            (select count(*) from public.workout_sessions t where t.user_id = p_user_id)::numeric
            / nullif((select count(*) from public.workout_sessions)::numeric, 0)
            * pg_total_relation_size('public.workout_sessions'::regclass)
          )::bigint, 0)
          + coalesce((
            (select count(*) from public.workout_plans t where t.user_id = p_user_id)::numeric
            / nullif((select count(*) from public.workout_plans)::numeric, 0)
            * pg_total_relation_size('public.workout_plans'::regclass)
          )::bigint, 0)
          + coalesce((
            (select count(*) from public.strength_sessions t where t.user_id = p_user_id)::numeric
            / nullif((select count(*) from public.strength_sessions)::numeric, 0)
            * pg_total_relation_size('public.strength_sessions'::regclass)
          )::bigint, 0)
          + coalesce((
            (select count(*) from public.strength_session_sets ss
              join public.strength_sessions s on s.id = ss.session_id
              where s.user_id = p_user_id)::numeric
            / nullif((select count(*) from public.strength_session_sets)::numeric, 0)
            * pg_total_relation_size('public.strength_session_sets'::regclass)
          )::bigint, 0)
          + coalesce((
            (select count(*) from public.recovery_metrics t where t.user_id = p_user_id)::numeric
            / nullif((select count(*) from public.recovery_metrics)::numeric, 0)
            * pg_total_relation_size('public.recovery_metrics'::regclass)
          )::bigint, 0)
          + coalesce((
            (select count(*) from public.exercise_prs t where t.user_id = p_user_id)::numeric
            / nullif((select count(*) from public.exercise_prs)::numeric, 0)
            * pg_total_relation_size('public.exercise_prs'::regclass)
          )::bigint, 0)
          + coalesce((
            (select count(*) from public.user_equipment t where t.user_id = p_user_id)::numeric
            / nullif((select count(*) from public.user_equipment)::numeric, 0)
            * pg_total_relation_size('public.user_equipment'::regclass)
          )::bigint, 0)
      ),
      'meals', jsonb_build_object(
        'rows',
          (select count(*) from public.meal_log t where t.user_id = p_user_id)
          + (select count(*) from public.recipes t where t.user_id = p_user_id),
        'bytes',
          coalesce((
            (select count(*) from public.meal_log t where t.user_id = p_user_id)::numeric
            / nullif((select count(*) from public.meal_log)::numeric, 0)
            * pg_total_relation_size('public.meal_log'::regclass)
          )::bigint, 0)
          + coalesce((
            (select count(*) from public.recipes t where t.user_id = p_user_id)::numeric
            / nullif((select count(*) from public.recipes)::numeric, 0)
            * pg_total_relation_size('public.recipes'::regclass)
          )::bigint, 0)
      ),
      'journal', jsonb_build_object(
        'rows',  (select count(*) from public.journal_entries t where t.user_id = p_user_id),
        'bytes', coalesce((
          (select count(*) from public.journal_entries t where t.user_id = p_user_id)::numeric
          / nullif((select count(*) from public.journal_entries)::numeric, 0)
          * pg_total_relation_size('public.journal_entries'::regclass)
        )::bigint, 0)
      ),
      'watchlists', jsonb_build_object(
        'rows',
          (select count(*) from public.stocks_cache t where t.user_id = p_user_id)
          + (select count(*) from public.sports_cache t where t.user_id = p_user_id),
        'bytes',
          coalesce((
            (select count(*) from public.stocks_cache t where t.user_id = p_user_id)::numeric
            / nullif((select count(*) from public.stocks_cache)::numeric, 0)
            * pg_total_relation_size('public.stocks_cache'::regclass)
          )::bigint, 0)
          + coalesce((
            (select count(*) from public.sports_cache t where t.user_id = p_user_id)::numeric
            / nullif((select count(*) from public.sports_cache)::numeric, 0)
            * pg_total_relation_size('public.sports_cache'::regclass)
          )::bigint, 0)
      ),
      'total_all_bytes', (
        select coalesce(sum(pg_total_relation_size(oid)), 0)::bigint
        from pg_catalog.pg_class
        where relnamespace = 'public'::regnamespace
          and relkind = 'r'
      )
    )
  );
end
$function$;
revoke execute on function public.estimate_user_storage(uuid) from anon, public;
grant  execute on function public.estimate_user_storage(uuid) to authenticated, service_role;

-- 5. Assert the end state. Any failure raises and rolls ALL of the above back. ------------
do $assert$
declare
  bad text;
begin
  select string_agg(c.relname, ', ') into bad
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity;
  if bad is not null then
    raise exception 'public tables without RLS: %', bad;
  end if;

  select string_agg(c.relname, ', ') into bad
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'S')
    and (has_table_privilege('anon', c.oid, 'SELECT') or has_table_privilege('anon', c.oid, 'INSERT')
      or has_table_privilege('anon', c.oid, 'UPDATE') or has_table_privilege('anon', c.oid, 'DELETE'));
  if bad is not null then
    raise exception 'anon still holds privileges on: %', bad;
  end if;

  select string_agg(p.proname, ', ') into bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE');
  if bad is not null then
    raise exception 'anon can still execute: %', bad;
  end if;

  if not has_function_privilege('authenticated', 'public.decrypt_integration_token(bytea,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.estimate_user_storage(uuid)', 'EXECUTE')
     or not has_table_privilege('authenticated', 'public.exercises', 'SELECT') then
    raise exception 'authenticated lost a privilege the app depends on';
  end if;
end
$assert$;

commit;

notify pgrst, 'reload schema';
