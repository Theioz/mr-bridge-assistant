create or replace function public.estimate_user_storage(p_user_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'tasks', jsonb_build_object(
      'rows',
        (select count(*) from public.tasks t where t.user_id = p_user_id)
        + (select count(*) from public.study_log t where t.user_id = p_user_id),
      'bytes',
        coalesce((
          (select count(*) from public.tasks t where t.user_id = p_user_id)::numeric
          / nullif((select count(*) from public.tasks)::numeric, 0)
          * pg_total_relation_size('public.tasks'::regclass)
        )::bigint, 0)
        + coalesce((
          (select count(*) from public.study_log t where t.user_id = p_user_id)::numeric
          / nullif((select count(*) from public.study_log)::numeric, 0)
          * pg_total_relation_size('public.study_log'::regclass)
        )::bigint, 0)
    ),
    'habits', jsonb_build_object(
      'rows',
        (select count(*) from public.habits t where t.user_id = p_user_id)
        + (select count(*) from public.habit_registry t where t.user_id = p_user_id),
      'bytes',
        coalesce((
          (select count(*) from public.habits t where t.user_id = p_user_id)::numeric
          / nullif((select count(*) from public.habits)::numeric, 0)
          * pg_total_relation_size('public.habits'::regclass)
        )::bigint, 0)
        + coalesce((
          (select count(*) from public.habit_registry t where t.user_id = p_user_id)::numeric
          / nullif((select count(*) from public.habit_registry)::numeric, 0)
          * pg_total_relation_size('public.habit_registry'::regclass)
        )::bigint, 0)
    ),
    'fitness', jsonb_build_object(
      'rows',
        (select count(*) from public.fitness_log t where t.user_id = p_user_id)
        + (select count(*) from public.workout_sessions t where t.user_id = p_user_id)
        + (select count(*) from public.workout_plans t where t.user_id = p_user_id)
        + (select count(*) from public.strength_sessions t where t.user_id = p_user_id)
        + (select count(*) from public.strength_session_sets ss
            join public.strength_sessions s on s.id = ss.session_id
            where s.user_id = p_user_id)
        + (select count(*) from public.recovery_metrics t where t.user_id = p_user_id)
        + (select count(*) from public.exercise_prs t where t.user_id = p_user_id)
        + (select count(*) from public.user_equipment t where t.user_id = p_user_id),
      'bytes',
        coalesce((
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
          (select count(*) from public.workout_plans t where t.user_id = p_user_id)::numeric
          / nullif((select count(*) from public.workout_plans)::numeric, 0)
          * pg_total_relation_size('public.workout_plans'::regclass)
        )::bigint, 0)
        + coalesce((
          (select count(*) from public.strength_sessions t where t.user_id = p_user_id)::numeric
          / nullif((select count(*) from public.strength_sessions)::numeric, 0)
          * pg_total_relation_size('public.strength_sessions'::regclass)
        )::bigint, 0)
        + coalesce((
          (select count(*) from public.strength_session_sets ss
            join public.strength_sessions s on s.id = ss.session_id
            where s.user_id = p_user_id)::numeric
          / nullif((select count(*) from public.strength_session_sets)::numeric, 0)
          * pg_total_relation_size('public.strength_session_sets'::regclass)
        )::bigint, 0)
        + coalesce((
          (select count(*) from public.recovery_metrics t where t.user_id = p_user_id)::numeric
          / nullif((select count(*) from public.recovery_metrics)::numeric, 0)
          * pg_total_relation_size('public.recovery_metrics'::regclass)
        )::bigint, 0)
        + coalesce((
          (select count(*) from public.exercise_prs t where t.user_id = p_user_id)::numeric
          / nullif((select count(*) from public.exercise_prs)::numeric, 0)
          * pg_total_relation_size('public.exercise_prs'::regclass)
        )::bigint, 0)
        + coalesce((
          (select count(*) from public.user_equipment t where t.user_id = p_user_id)::numeric
          / nullif((select count(*) from public.user_equipment)::numeric, 0)
          * pg_total_relation_size('public.user_equipment'::regclass)
        )::bigint, 0)
    ),
    'meals', jsonb_build_object(
      'rows',
        (select count(*) from public.meal_log t where t.user_id = p_user_id)
        + (select count(*) from public.recipes t where t.user_id = p_user_id),
      'bytes',
        coalesce((
          (select count(*) from public.meal_log t where t.user_id = p_user_id)::numeric
          / nullif((select count(*) from public.meal_log)::numeric, 0)
          * pg_total_relation_size('public.meal_log'::regclass)
        )::bigint, 0)
        + coalesce((
          (select count(*) from public.recipes t where t.user_id = p_user_id)::numeric
          / nullif((select count(*) from public.recipes)::numeric, 0)
          * pg_total_relation_size('public.recipes'::regclass)
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
    ),
    'watchlists', jsonb_build_object(
      'rows',
        (select count(*) from public.stocks_cache t where t.user_id = p_user_id)
        + (select count(*) from public.sports_cache t where t.user_id = p_user_id),
      'bytes',
        coalesce((
          (select count(*) from public.stocks_cache t where t.user_id = p_user_id)::numeric
          / nullif((select count(*) from public.stocks_cache)::numeric, 0)
          * pg_total_relation_size('public.stocks_cache'::regclass)
        )::bigint, 0)
        + coalesce((
          (select count(*) from public.sports_cache t where t.user_id = p_user_id)::numeric
          / nullif((select count(*) from public.sports_cache)::numeric, 0)
          * pg_total_relation_size('public.sports_cache'::regclass)
        )::bigint, 0)
    ),
    'total_all_bytes', (
      select coalesce(sum(pg_total_relation_size(oid)), 0)::bigint
      from pg_catalog.pg_class
      where relnamespace = 'public'::regnamespace
        and relkind = 'r'
    )
  )
$$;
