-- Task dependencies, single blocker (#470, Phase 4 of the tasks overhaul).
--
-- `tasks.blocked_by` points at the one task that must be finished first. A task is BLOCKED while
-- its blocker is ACTIVE. Completing the blocker releases it, and so does archiving it: archive
-- means "dropped", and a dependent hidden behind a dropped task would stay hidden forever.
-- Restoring a completed blocker (#684) blocks its dependents again.
--
-- One blocker per task (Option A). Upgrade to an M:N table only on demand.
--
-- WHAT THE TRIGGER ENFORCES, and why in the database rather than the app: tasks are written by the
-- /tasks page, the MCP tools and Python scripts. A rule that lives in one of those is a rule the
-- other two skip.
--   - no cycles. With a single blocker per task the graph is a chain, so walking it from the new
--     blocker either ends or comes back to this task. The CHECK below covers the 1-hop case.
--   - the blocker belongs to the same user. The FK alone would accept another user's task id.
--   - neither side is a subtask or a recurring-series occurrence. Subtasks already order work
--     inside their parent. An occurrence blocked by another occurrence has no clear meaning when
--     the spawner generates the next one, which is the trap the #470 triage note called out.
--     Detach an occurrence (detach_task_occurrence) to make it an ordinary task first.
--
-- A deleted blocker (including the 90-day purge of completed tasks, #684) sets blocked_by to null.

begin;

alter table public.tasks
  add column if not exists blocked_by uuid
    constraint tasks_blocked_by_fkey references public.tasks(id) on delete set null;

alter table public.tasks
  add constraint tasks_blocked_by_not_self check (blocked_by is null or blocked_by <> id);

create index if not exists tasks_blocked_by_idx
  on public.tasks (blocked_by) where blocked_by is not null;

create or replace function public.tasks_check_blocked_by()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
declare
  blocker record;
  cur uuid;
  hops int := 0;
begin
  if new.blocked_by is null then
    return new;
  end if;

  if new.parent_id is not null then
    raise exception 'A subtask cannot be blocked. Block its parent task instead.'
      using errcode = 'check_violation';
  end if;
  if new.series_id is not null then
    raise exception 'A repeating task cannot be blocked. Detach this occurrence first.'
      using errcode = 'check_violation';
  end if;

  select id, user_id, parent_id, series_id into blocker
  from public.tasks where id = new.blocked_by;
  if not found or blocker.user_id is distinct from new.user_id then
    raise exception 'The blocking task was not found.' using errcode = 'foreign_key_violation';
  end if;
  if blocker.parent_id is not null then
    raise exception 'A subtask cannot block a task.' using errcode = 'check_violation';
  end if;
  if blocker.series_id is not null then
    raise exception 'A repeating task cannot block a task.' using errcode = 'check_violation';
  end if;

  cur := new.blocked_by;
  while cur is not null loop
    if cur = new.id then
      raise exception 'That would make a dependency loop: this task already blocks that one.'
        using errcode = 'check_violation';
    end if;
    hops := hops + 1;
    if hops > 1000 then
      raise exception 'Dependency chain too long.' using errcode = 'check_violation';
    end if;
    select t.blocked_by into cur from public.tasks t where t.id = cur;
  end loop;

  return new;
end
$function$;

revoke all on function public.tasks_check_blocked_by() from public, anon;

drop trigger if exists trg_tasks_check_blocked_by on public.tasks;
create trigger trg_tasks_check_blocked_by
  before insert or update of blocked_by, parent_id, series_id on public.tasks
  for each row execute function public.tasks_check_blocked_by();

commit;
