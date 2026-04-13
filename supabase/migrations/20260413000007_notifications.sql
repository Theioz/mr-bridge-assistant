create table notifications (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users(id) on delete cascade,
  type      text not null,   -- 'hrv_alert' | 'weather' | 'task_due' | 'journal_reminder' | 'birthday'
  title     text not null,
  body      text,
  sent_at   timestamptz not null default now(),
  read_at   timestamptz         -- null = unread
);

alter table notifications enable row level security;
create policy "users access own data" on notifications
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index notifications_user_sent_idx on notifications (user_id, sent_at desc);
create index notifications_unread_idx    on notifications (user_id, read_at) where read_at is null;
