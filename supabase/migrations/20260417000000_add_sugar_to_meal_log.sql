-- Add sugar_g column to meal_log (issue #304).
-- Nullable — existing rows render as "—" in the UI rather than 0.

alter table meal_log
  add column if not exists sugar_g numeric(6,1);
