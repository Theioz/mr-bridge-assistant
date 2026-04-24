create or replace function public.estimate_user_storage(p_user_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'tasks', jsonb_build_object(
      'rows',  (select count(*) from public.tasks t where t.user_id = p_user_id),
      'bytes', coalesce((
        (select count(*) from public.tasks t where t.user_id = p_user_id)::numeric
        / nullif((select count(*) from public.tasks)::numeric, 0)
        * pg_total_relation_size('public.tasks'::regclass)
      )::bigint, 0)
    ),
    'habits', jsonb_build_object(
      'rows',  (select count(*) from public.habits t where t.user_id = p_user_id),
      'bytes', coalesce((
        (select count(*) from public.habits t where t.user_id = p_user_id)::numeric
        / nullif((select count(*) from public.habits)::numeric, 0)
        * pg_total_relation_size('public.habits'::regclass)
      )::bigint, 0)
    ),
    'fitness', jsonb_build_object(
      'rows',
        (select count(*) from public.fitness_log t where t.user_id = p_user_id)
        + (select count(*) from public.workout_sessions t where t.user_id = p_user_id)
        + (select count(*) from public.strength_sessions t where t.user_id = p_user_id)
        + (select count(*) from public.recovery_metrics t where t.user_id = p_user_id),
      'bytes', coalesce((
        (select count(*) from public.fitness_log t where t.user_id = p_user_id)::numeric
        / nullif((select count(*) from public.fitness_log)::numeric, 0)
        * pg_total_relation_size('public.fitness_log'::regclass)
      )::bigint, 0)
      + coalesce((
        (select count(*) from public.workout_sessions t where t.user_id = p_user_id)::numeric
        / nullif((select count(*) from public.workout_sessions)::numeric, 0)
        * pg_total_relation_size('public.workout_sessions'::regclass)
      )::bigint, 0)
      + coalesce((
        (select count(*) from public.strength_sessions t where t.user_id = p_user_id)::numeric
        / nullif((select count(*) from public.strength_sessions)::numeric, 0)
        * pg_total_relation_size('public.strength_sessions'::regclass)
      )::bigint, 0)
      + coalesce((
        (select count(*) from public.recovery_metrics t where t.user_id = p_user_id)::numeric
        / nullif((select count(*) from public.recovery_metrics)::numeric, 0)
        * pg_total_relation_size('public.recovery_metrics'::regclass)
      )::bigint, 0)
    ),
    'meals', jsonb_build_object(
      'rows',  (select count(*) from public.meal_log t where t.user_id = p_user_id),
      'bytes', coalesce((
        (select count(*) from public.meal_log t where t.user_id = p_user_id)::numeric
        / nullif((select count(*) from public.meal_log)::numeric, 0)
        * pg_total_relation_size('public.meal_log'::regclass)
      )::bigint, 0)
    ),
    'journal', jsonb_build_object(
      'rows',  (select count(*) from public.journal_entries t where t.user_id = p_user_id),
      'bytes', coalesce((
        (select count(*) from public.journal_entries t where t.user_id = p_user_id)::numeric
        / nullif((select count(*) from public.journal_entries)::numeric, 0)
        * pg_total_relation_size('public.journal_entries'::regclass)
      )::bigint, 0)
    ),
    'chat', jsonb_build_object(
      'rows', (
        select count(*) from public.chat_messages m
        join public.chat_sessions s on s.id = m.session_id
        where s.user_id = p_user_id
      ),
      'bytes', coalesce((
        (
          select count(*) from public.chat_messages m
          join public.chat_sessions s on s.id = m.session_id
          where s.user_id = p_user_id
        )::numeric
        / nullif((select count(*) from public.chat_messages)::numeric, 0)
        * (
          pg_total_relation_size('public.chat_messages'::regclass)
          + pg_total_relation_size('public.chat_sessions'::regclass)
        )
      )::bigint, 0)
    )
  )
$$;
