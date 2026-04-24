-- Raise default daily chat token cap from 100k to 500k.
-- Existing rows keep their current value; only new rows (and any without an override) get 500k.
alter table tenant_quotas
  alter column daily_chat_tokens set default 500000;

-- Backfill existing rows that are still at the old default.
update tenant_quotas
  set daily_chat_tokens = 500000
  where daily_chat_tokens = 100000;
