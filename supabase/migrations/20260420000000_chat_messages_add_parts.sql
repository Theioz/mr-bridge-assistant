-- Add structured `parts` column to chat_messages so AI SDK v6 UIMessage shapes
-- (tool calls, tool results, file attachments) round-trip through chat history
-- instead of being flattened to plain text at the transport boundary.
--
-- Closes issue #342.
--
-- The `content` column stays as a denormalized text snapshot used by the
-- session sidebar preview query. Both columns are populated on insert; reads
-- in the message thread switch to `parts`, reads in the sidebar stay on
-- `content`.

alter table chat_messages add column if not exists parts jsonb;

-- Backfill: every historical row gets a single text part derived from content
-- so the client mapper always finds a renderable parts array.
update chat_messages
set parts = jsonb_build_array(
  jsonb_build_object('type', 'text', 'text', content)
)
where parts is null;

alter table chat_messages
  alter column parts set not null,
  alter column parts set default '[]'::jsonb;
