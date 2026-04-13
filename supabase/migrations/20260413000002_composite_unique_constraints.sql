-- Update unique constraints to include user_id for multi-tenancy
-- Required for correct on_conflict upserts after adding user_id to all tables

-- habit_registry: (name) → (user_id, name)
alter table habit_registry drop constraint if exists habit_registry_name_key;
alter table habit_registry add constraint habit_registry_user_id_name_unique unique (user_id, name);

-- fitness_log: (date, source) → (user_id, date, source)
alter table fitness_log drop constraint if exists fitness_log_date_source_key;
alter table fitness_log add constraint fitness_log_user_id_date_source_unique unique (user_id, date, source);

-- recovery_metrics: (date) → (user_id, date)
alter table recovery_metrics drop constraint if exists recovery_metrics_date_key;
alter table recovery_metrics add constraint recovery_metrics_user_id_date_unique unique (user_id, date);

-- study_log: (date, subject) → (user_id, date, subject)
alter table study_log drop constraint if exists study_log_date_subject_unique;
alter table study_log add constraint study_log_user_id_date_subject_unique unique (user_id, date, subject);
