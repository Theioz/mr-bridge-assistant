-- Promote three Oura metadata JSONB fields to real columns and add source to
-- the unique constraint so Fitbit and Oura can coexist for the same date.
-- Safe against existing data: all updates are idempotent and backfill-only.

alter table recovery_metrics
  add column if not exists sleep_efficiency numeric(4,1),
  add column if not exists awake_hrs        numeric(4,2),
  add column if not exists vo2_max          numeric(4,1);

comment on column recovery_metrics.sleep_efficiency is 'Sleep efficiency % (Oura sleep endpoint / Fitbit sleep endpoint)';
comment on column recovery_metrics.awake_hrs        is 'Hours awake during sleep window (Oura sleep endpoint / Fitbit sleep stages)';
comment on column recovery_metrics.vo2_max          is 'VO2 max estimate (Oura vo2_max endpoint)';

-- Backfill new columns from existing Oura JSONB metadata (idempotent).
update recovery_metrics
  set sleep_efficiency = (metadata->>'sleep_efficiency')::numeric
  where metadata ? 'sleep_efficiency' and sleep_efficiency is null;

update recovery_metrics
  set awake_hrs = (metadata->>'awake_hrs')::numeric
  where metadata ? 'awake_hrs' and awake_hrs is null;

update recovery_metrics
  set vo2_max = (metadata->>'vo2_max')::numeric
  where metadata ? 'vo2_max' and vo2_max is null;

-- Ensure every row has a source value before making the column not-null.
-- The column defaulted to 'oura' at creation time so this only catches
-- any rows inserted before the default was added.
update recovery_metrics set source = 'oura' where source is null;
alter table recovery_metrics alter column source set not null;

-- Swap unique constraint: (user_id, date) → (user_id, date, source).
-- This allows Oura and Fitbit rows to coexist on the same date.
alter table recovery_metrics
  drop constraint if exists recovery_metrics_user_id_date_unique;

alter table recovery_metrics
  add constraint recovery_metrics_user_id_date_source_unique
  unique (user_id, date, source);

-- Covering index for the most common read pattern: filtered by source, ordered by date.
create index if not exists recovery_metrics_user_source_date_idx
  on recovery_metrics (user_id, source, date desc);
