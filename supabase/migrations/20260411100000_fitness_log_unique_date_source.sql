-- Add unique constraint on (date, source) for fitness_log
-- Enables idempotent upserts per data source (google_fit, fitbit_body, renpho, etc.)
alter table fitness_log add constraint fitness_log_date_source_key unique (date, source);
