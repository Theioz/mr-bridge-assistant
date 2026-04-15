alter table chat_sessions add column if not exists deleted_at timestamptz;
create index if not exists chat_sessions_deleted_at_idx on chat_sessions (deleted_at);
