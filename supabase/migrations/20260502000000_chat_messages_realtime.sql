-- Add chat_messages to the Realtime publication if not already included.
-- Safe to run on projects where supabase_realtime is FOR ALL TABLES.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table chat_messages;
  end if;
end $$;
