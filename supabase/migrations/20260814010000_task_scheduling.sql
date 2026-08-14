-- Task scheduling — put a task on the Google Calendar as an explicit time block.
--
-- Mirrors the workout_plans pattern: the link between an app row and its Google event is a single
-- `calendar_event_id` text column, cleared to null when the event is removed. `scheduled_start` /
-- `scheduled_end` record the block so the app can show it (and re-patch the event on edit) without
-- a round-trip to Google. All nullable — a task with no block is simply unscheduled.

alter table tasks
  add column if not exists calendar_event_id text,
  add column if not exists scheduled_start   timestamptz,
  add column if not exists scheduled_end     timestamptz;

create index if not exists tasks_scheduled_start_idx on tasks (scheduled_start);
