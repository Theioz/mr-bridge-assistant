-- Extend recovery_metrics with additional Oura Ring v2 fields.
-- New dedicated columns for frequently-surfaced metrics.
-- Richer per-session data goes into the existing metadata jsonb column.

alter table recovery_metrics
  add column if not exists light_hrs        numeric(4,2),   -- light sleep hours
  add column if not exists steps            int,            -- daily step count (daily_activity)
  add column if not exists activity_score   int,            -- Oura daily activity score
  add column if not exists spo2_avg         numeric(4,1),   -- average SpO2 % (daily_spo2)
  add column if not exists body_temp_delta  numeric(4,2);   -- body temperature deviation °C (daily_readiness contributors)

comment on column recovery_metrics.light_hrs       is 'Light sleep duration in hours (Oura sleep endpoint)';
comment on column recovery_metrics.steps           is 'Total daily steps (Oura daily_activity endpoint)';
comment on column recovery_metrics.activity_score  is 'Oura daily activity score (daily_activity endpoint)';
comment on column recovery_metrics.spo2_avg        is 'Average SpO2 percentage (Oura daily_spo2 endpoint)';
comment on column recovery_metrics.body_temp_delta is 'Body temperature deviation from baseline in °C (Oura readiness contributors)';

-- metadata jsonb stores: awake_hrs, sleep_efficiency, latency_mins, avg_breath,
-- avg_hr_sleep, restless_periods, bedtime_end, total_calories, stress_high_mins,
-- stress_recovery_mins, resilience_level, vo2_max
