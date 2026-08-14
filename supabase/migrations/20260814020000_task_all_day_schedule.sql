-- All-day task scheduling. A calendar block can now be all-day (a date, no time) as well as a
-- timed range. Google models the two differently ({date} vs {dateTime}), so the task needs to
-- remember which it is. For an all-day block, scheduled_start holds noon-UTC of the date (so the
-- local calendar date never shifts across time zones) and scheduled_end is null.

alter table tasks
  add column if not exists scheduled_all_day boolean not null default false;
