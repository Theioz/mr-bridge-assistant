create or replace function public.estimate_user_storage(p_user_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'tasks',   (select jsonb_build_object(
                  'rows',  count(*),
                  'bytes', coalesce(sum(pg_column_size(t.*)), 0))
                from public.tasks t where t.user_id = p_user_id),
    'habits',  (select jsonb_build_object(
                  'rows',  count(*),
                  'bytes', coalesce(sum(pg_column_size(t.*)), 0))
                from public.habits t where t.user_id = p_user_id),
    'fitness', (select jsonb_build_object(
                  'rows',
                    (select count(*) from public.fitness_log t where t.user_id = p_user_id)
                  + (select count(*) from public.workout_sessions t where t.user_id = p_user_id)
                  + (select count(*) from public.strength_sessions t where t.user_id = p_user_id)
                  + (select count(*) from public.recovery_metrics t where t.user_id = p_user_id),
                  'bytes',
                    coalesce((select sum(pg_column_size(t.*)) from public.fitness_log t where t.user_id = p_user_id), 0)
                  + coalesce((select sum(pg_column_size(t.*)) from public.workout_sessions t where t.user_id = p_user_id), 0)
                  + coalesce((select sum(pg_column_size(t.*)) from public.strength_sessions t where t.user_id = p_user_id), 0)
                  + coalesce((select sum(pg_column_size(t.*)) from public.recovery_metrics t where t.user_id = p_user_id), 0)
                )),
    'meals',   (select jsonb_build_object(
                  'rows',  count(*),
                  'bytes', coalesce(sum(pg_column_size(t.*)), 0))
                from public.meal_log t where t.user_id = p_user_id),
    'journal', (select jsonb_build_object(
                  'rows',  count(*),
                  'bytes', coalesce(sum(pg_column_size(t.*)), 0))
                from public.journal_entries t where t.user_id = p_user_id),
    'chat',    (select jsonb_build_object(
                  'rows',  count(*),
                  'bytes', coalesce(sum(pg_column_size(m.*)), 0))
                from public.chat_messages m
                join public.chat_sessions s on s.id = m.session_id
                where s.user_id = p_user_id)
  )
$$;

grant execute on function public.estimate_user_storage(uuid) to authenticated;
