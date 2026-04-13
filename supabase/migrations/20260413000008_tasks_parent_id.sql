alter table tasks
  add column if not exists parent_id uuid references tasks(id) on delete cascade;

create index if not exists tasks_parent_id_idx on tasks (parent_id);
