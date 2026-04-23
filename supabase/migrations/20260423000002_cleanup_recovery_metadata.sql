-- Remove the three metadata JSONB keys that were promoted to real columns.
-- These were backfilled in 20260423000001; the metadata copies are now stale.
update recovery_metrics
  set metadata = metadata - 'sleep_efficiency' - 'awake_hrs' - 'vo2_max'
  where metadata ?| array['sleep_efficiency', 'awake_hrs', 'vo2_max'];
