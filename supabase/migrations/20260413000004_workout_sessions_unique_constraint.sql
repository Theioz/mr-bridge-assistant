-- Prevent duplicate workout_sessions rows for the same workout event per user.
-- The combination of user_id + date + start_time + source is unique; a single
-- source cannot produce two workouts starting at the exact same moment for the same user.

alter table workout_sessions
  add constraint workout_sessions_user_id_date_start_source_key
  unique (user_id, date, start_time, source);
