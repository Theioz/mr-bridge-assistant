-- Add nutrition columns to meal_log for photo-based macro/micro estimation (issue #84)
-- All columns are nullable — existing rows are unaffected.

alter table meal_log
  add column if not exists calories   integer,
  add column if not exists protein_g  numeric(6,1),
  add column if not exists carbs_g    numeric(6,1),
  add column if not exists fat_g      numeric(6,1),
  add column if not exists fiber_g    numeric(6,1),
  add column if not exists sodium_mg  integer,
  add column if not exists source     text; -- 'vision' | 'chat' | 'manual'
