-- Plex watch sync (#691): a pending "rate this" prompt on a library item.
--
-- Set by the Plex sync when it finishes an unrated movie, or a show that is fully
-- watched and no longer in production. Cleared when a rating is saved or the prompt is
-- dismissed. A column rather than a metadata key: the library edit form PATCHes the
-- whole metadata object, so a key there could be resurrected or dropped by a stale copy.

alter table backlog_items add column if not exists rate_prompt_at timestamptz;

create index if not exists backlog_items_rate_prompt_idx
  on backlog_items (user_id, rate_prompt_at desc) where rate_prompt_at is not null;

-- Any path that writes a rating answers the prompt: the library page, the
-- update_backlog_item MCP tool, or a script. Done in the database so none of them can
-- forget, and so a rated item never lingers in the banner.
create or replace function clear_rate_prompt_on_rating() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.rating is not null then
    new.rate_prompt_at := null;
  end if;
  return new;
end;
$$;

create trigger trg_backlog_items_clear_rate_prompt
  before insert or update of rating, rate_prompt_at on backlog_items
  for each row execute function clear_rate_prompt_on_rating();
