-- Enable RLS (was never set — per-user policy exists but is inert without this)
alter table journal_entries enable row level security;

-- Normalize unique constraint: 20260413000003 created (user_id, date) as journal_entries_user_id_date_unique.
-- Drop and recreate with canonical name and column order (date, user_id) so that
-- the upsert onConflict target "date,user_id" resolves correctly.
alter table journal_entries drop constraint if exists journal_entries_user_id_date_unique;
alter table journal_entries
  add constraint journal_entries_date_user_id_key unique (date, user_id);
