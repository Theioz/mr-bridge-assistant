-- Fix FK constraints that blocked tenant deletion.
-- sports_cache, stocks_cache, and workout_plans were missing ON DELETE CASCADE.
-- admin_audit_log.target_user_id gets SET NULL so audit history is preserved
-- when a tenant is deleted.

alter table sports_cache
  drop constraint if exists sports_cache_user_id_fkey,
  add constraint sports_cache_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade;

alter table stocks_cache
  drop constraint if exists stocks_cache_user_id_fkey,
  add constraint stocks_cache_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade;

alter table workout_plans
  drop constraint if exists workout_plans_user_id_fkey,
  add constraint workout_plans_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade;

alter table admin_audit_log
  drop constraint if exists admin_audit_log_target_user_id_fkey,
  add constraint admin_audit_log_target_user_id_fkey
    foreign key (target_user_id) references auth.users(id) on delete set null;
