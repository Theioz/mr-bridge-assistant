-- journal_entries: replace unique(date) with unique(user_id, date) for multi-tenancy
alter table journal_entries drop constraint if exists journal_entries_date_key;
alter table journal_entries add constraint journal_entries_user_id_date_unique unique (user_id, date);
