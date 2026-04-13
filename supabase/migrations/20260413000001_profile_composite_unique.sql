-- Fix profile table: replace single-column unique(key) with composite unique(user_id, key)
-- Required for multi-tenancy upsert on_conflict="user_id,key"

alter table profile drop constraint if exists profile_key_key;
alter table profile add constraint profile_user_id_key_unique unique (user_id, key);
