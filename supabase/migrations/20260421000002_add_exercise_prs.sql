create table exercise_prs (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users on delete cascade,
  exercise_name            text not null,
  weight_pr_kg             numeric,
  rep_pr_reps              int,
  rep_pr_weight_kg         numeric,
  volume_pr_kg             numeric,
  weight_pr_set_id         uuid references strength_session_sets,
  volume_pr_session_id     uuid references strength_sessions,
  weight_pr_achieved_at    timestamptz,
  volume_pr_achieved_at    timestamptz,
  rep_pr_achieved_at       timestamptz,
  updated_at               timestamptz default now(),
  unique(user_id, exercise_name)
);

alter table exercise_prs enable row level security;

create policy "users own their prs" on exercise_prs
  for all using (auth.uid() = user_id);
