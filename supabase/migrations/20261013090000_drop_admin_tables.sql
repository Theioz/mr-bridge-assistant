-- Drop the multi-tenant admin tables (#761).
--
-- feature_flags (20260424000005) and admin_audit_log (20260424000004) backed the /admin
-- tenant console: per-tenant feature toggles and an audit trail of admin mutations.
-- Mr. Bridge is a single-user, self-hosted app — multi-tenancy was abandoned in favour of
-- self-hosting (#201) — and the /admin route was deleted in the same change as this file.
--
-- Nothing in web/, web/mcp/ or scripts/ reads or writes either table any more. Their only
-- readers/writers were web/src/app/admin/**. Keeping them implies a feature that does not
-- exist.
--
-- Dropping feature_flags also drops trg_feature_flags_updated_at
-- (20260426000000_db_generated_timestamps.sql) and its RLS policies with it. The shared
-- set_updated_at() trigger function is used by other tables and is left alone.
--
-- Not applied automatically. Apply by hand as postgres:
--   docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < this-file

begin;

drop table if exists public.admin_audit_log;
drop table if exists public.feature_flags;

commit;
