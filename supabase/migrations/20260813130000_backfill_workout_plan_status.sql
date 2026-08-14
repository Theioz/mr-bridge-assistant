-- #666: nothing in the app ever set workout_plans.status to 'completed'. A plan created as
-- 'planned' stayed 'planned' even after its session was logged, so coach_check.py read done days
-- as misses. The app now flips status on set-log / recap (POST + PATCH /api/strength-sessions);
-- this backfills the historical rows so past adherence reads true.
--
-- Idempotent: prod was hand-corrected 2026-08-10, so this is a no-op there. It makes any other
-- environment (dev, seeded demo) consistent, and re-running is safe.
--
-- A session links to its plan two ways: the workout_plan_id FK, or same user + same date
-- (sessions are frequently logged without the FK, matched only by performed_on = date). Only
-- 'planned' rows are touched, so an explicit 'cancelled'/'skipped' is never clobbered.

update workout_plans p
set status = 'completed',
    updated_at = now()
where p.status = 'planned'
  and exists (
    select 1
    from strength_sessions s
    where s.user_id = p.user_id
      and (s.workout_plan_id = p.id or s.performed_on = p.date)
  );
