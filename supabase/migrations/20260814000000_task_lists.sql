-- Task Lists — a first-class home for what was the free-text `tasks.category`.
--
-- WHY A TABLE, NOT THE STRING
--
-- `tasks.category` is a nullable free-text column. Both the app UI and the assistant (via the
-- add_task MCP tool) write it, so the same list fragments on typos and casing ("Groceries" vs
-- "groceries" vs "grocery"), can't be renamed in one place, ordered, or given a colour. Promoting
-- it to a real entity — one list per task (the folder model) — fixes all of that and is the
-- backbone the rest of the tasks overhaul (calendar, history, dependencies) hangs off.
--
-- `tasks.list_id` is nullable and `on delete set null`: a task with no list is "uncategorised",
-- and deleting a list never deletes its tasks — they fall back to uncategorised.
--
-- `category` is left in place for now; the backfill below seeds lists from it, and a later change
-- can drop the column once nothing reads it.

create table if not exists task_lists (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  color      text,                              -- reserved for coloured dots; unset for now
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists task_lists_user_id_idx on task_lists (user_id);

alter table task_lists enable row level security;
create policy "users access own data" on task_lists
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table tasks
  add column if not exists list_id uuid references task_lists(id) on delete set null;
create index if not exists tasks_list_id_idx on tasks (list_id);

-- Backfill: promote each distinct non-empty category (per user) to a list, then point its tasks at
-- it. Guarded by "not exists" so a re-run is a no-op.
do $$
declare
  r record;
  target_list_id uuid;
begin
  for r in
    select distinct user_id, category
    from tasks
    where category is not null and btrim(category) <> ''
  loop
    select id into target_list_id
      from task_lists
      where user_id = r.user_id and name = r.category
      limit 1;

    if target_list_id is null then
      insert into task_lists (user_id, name)
        values (r.user_id, r.category)
        returning id into target_list_id;
    end if;

    update tasks
      set list_id = target_list_id
      where user_id = r.user_id and category = r.category and list_id is null;
  end loop;
end $$;
