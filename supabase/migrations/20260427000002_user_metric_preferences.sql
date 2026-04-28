-- Stores per-user, per-metric preferred data source.
-- The sync layer writes all connected sources; this table controls which one
-- the chat tool and UI read back for each metric category.

create table if not exists user_metric_preferences (
  user_id          uuid not null references auth.users(id) on delete cascade,
  metric           text not null,
  preferred_source text not null,
  updated_at       timestamptz not null default now(),
  primary key (user_id, metric),
  constraint user_metric_preferences_metric_check check (
    metric in ('sleep', 'hrv', 'steps', 'active_calories', 'readiness', 'body_composition')
  )
);

comment on table user_metric_preferences is
  'Per-user preferred data source for each metric category. Rows are optional — missing rows fall back to application defaults.';

alter table user_metric_preferences enable row level security;

create policy "users manage own metric preferences"
  on user_metric_preferences
  for all
  to authenticated
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
