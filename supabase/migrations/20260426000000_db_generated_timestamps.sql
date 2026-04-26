-- Move timestamp authority to the DB layer (#521)
-- Removes the need for application code to pass new Date().toISOString()
-- for updated_at and completed_at fields. Triggers ensure these columns
-- are always set by the DB clock (UTC) regardless of the write path.

-- Shared trigger function: stamp updated_at = now() on every UPDATE
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_journal_entries_updated_at
  before update on journal_entries
  for each row execute function set_updated_at();

create trigger trg_tenant_quotas_updated_at
  before update on tenant_quotas
  for each row execute function set_updated_at();

create trigger trg_feature_flags_updated_at
  before update on feature_flags
  for each row execute function set_updated_at();

-- tasks: set completed_at on first transition to 'completed'
create or replace function set_completed_at()
returns trigger language plpgsql as $$
begin
  if new.status = 'completed' and (old.status is distinct from 'completed') then
    new.completed_at = now();
  end if;
  return new;
end;
$$;

create trigger trg_tasks_completed_at
  before update on tasks
  for each row execute function set_completed_at();
