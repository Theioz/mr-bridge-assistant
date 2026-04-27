-- profile(user_id, key): already covered by the unique constraint added in
-- 20260413000001_profile_composite_unique.sql. No new index needed.

-- chat_messages: replace the ascending (session_id, position) index created in
-- 20260413000005_chat_messages_position.sql with a DESC NULLS LAST index that
-- exactly matches the hot-path query:
--   ORDER BY position DESC NULLS LAST LIMIT 10
-- Postgres can scan an ASC index backwards (giving DESC NULLS FIRST), but the
-- null ordering differs. In practice position is never NULL, but a precise index
-- eliminates the planner having to verify that at runtime.
drop index if exists chat_messages_session_position_idx;

create index if not exists chat_messages_session_position_desc_idx
  on chat_messages (session_id, position desc nulls last);
