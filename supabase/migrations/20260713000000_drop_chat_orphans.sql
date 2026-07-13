-- Drop the objects the chat left behind (#611).
--
-- The in-app chat was deleted in #476/#608. Nothing writes these; nothing reads them.
-- Leaving them means the schema keeps implying a feature that does not exist — the next
-- person to find `chat_messages` will reasonably assume there is a chat.
--
-- HISTORY IS NOT LOST. 330 sessions / 1181 messages (2026-04-10 onward) were exported to
-- a verified JSON archive first:
--     /mnt/data/backups/mr-bridge/chat-archive-2026-07-13.json.gz
-- The export was checked row-for-row against the database before this migration was run.
-- This is the one irreversible step in the cleanup; do not re-run it against a database
-- whose history has not been archived.

begin;

-- 1. Realtime publication ---------------------------------------------------------
-- 20260502000000_chat_messages_realtime.sql added chat_messages to supabase_realtime so
-- the chat could sync live across devices. Its only consumer is gone, and the realtime
-- container is not even deployed in the self-hosted stack — so this publication now
-- points at nothing.
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime drop table public.chat_messages;
  end if;
end $$;

-- 2. Token quota -------------------------------------------------------------------
-- tenant_quotas existed to cap CHAT spend against a metered API. There is no metered API
-- any more (#608): macros come from USDA, and conversation runs on the Claude
-- subscription via MCP. There is nothing left to meter. /api/quota is already deleted.
drop function if exists public.check_and_increment_quota(uuid, text);
drop function if exists public.record_quota_tokens(uuid, integer);
drop table if exists public.tenant_quotas;

-- 3. The chat tables ---------------------------------------------------------------
-- chat_messages first: it FKs to chat_sessions.
drop table if exists public.chat_messages;
drop table if exists public.chat_sessions;

commit;

-- NOTE: estimate_user_storage() counts per-domain rows and bytes for the Settings →
-- Usage panel. It references the tables above, so it is recreated without them in the
-- next migration rather than being left to fail at runtime.
