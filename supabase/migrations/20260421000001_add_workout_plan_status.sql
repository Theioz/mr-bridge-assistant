alter table workout_plans
  add column status text not null default 'planned'
    check (status in ('planned', 'completed', 'cancelled', 'skipped')),
  add column cancel_reason text,
  add column cancelled_at timestamptz;

-- backfill: plans with logged strength sessions are completed
update workout_plans
set status = 'completed'
where id in (
  select distinct workout_plan_id
  from strength_sessions
  where workout_plan_id is not null
);

create index workout_plans_user_status_date_idx
  on workout_plans (user_id, status, date);
