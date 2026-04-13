-- Add an explicit position column to chat_messages so messages can be ordered
-- deterministically regardless of created_at timestamp precision.
--
-- Fixes issue #132: two rows inserted in the same batched insert share the same
-- now() value, causing Postgres to return them in undefined order.

alter table chat_messages add column if not exists position bigint;

-- Backfill existing rows: assign position within each session ordered by
-- created_at, then id as a tiebreaker.
update chat_messages m
set position = sub.rn
from (
  select
    id,
    row_number() over (
      partition by session_id
      order by created_at asc, id asc
    ) as rn
  from chat_messages
) sub
where m.id = sub.id;

-- Index for ordered message fetching by session
create index if not exists chat_messages_session_position_idx
  on chat_messages (session_id, position);
