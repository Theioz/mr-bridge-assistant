-- Jobs: the job-application tracker AND everything the daily Job Scout saw (one row per role),
-- plus Job Scout's daily reports. Shown on the /jobs page.
--
-- Why here and not in Notion: Notion's free plan caps database queries, and reading back ~1,200
-- filtered roles to dedupe killed the 2026-10-27 Job Scout run. Notion keeps only long-form prep
-- (Story Bank, narratives, company prep). The tracker rows were imported from Notion
-- (source = 'notion_import', notion_page_url = the old row).
--
-- One table, two lifecycles on the same row:
--   stage   the scout pipeline: prefilter / pending / title_triage / scored / pay / recommended.
--           Null for roles that never came through Job Scout (manual adds, Notion imports).
--   status  the application: watching / to_apply / applied / ... Null = not in the tracker (a role
--           Job Scout filtered out and Jason never promoted). A role is "in the tracker" iff status
--           is not null.
--
-- Writers: scripts/job_scout.py on the homelab (collect inserts new scout roles and bumps
-- last_seen; ingest applies the ranking agent's decisions and stores its report), the /jobs page
-- (feedback, status and application fields, manual adds), and scripts/import_notion_tracker.py
-- (one-time). The ranking agent runs in the cloud and never touches this database: it reaches the
-- homelab only through files on a git branch.

create table if not exists public.jobs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  url              text,
  company          text not null,
  title            text not null,
  location         text,
  pay              text,
  source           text not null default 'manual'
                   check (source in ('job_scout', 'manual', 'notion_import')),
  -- scout pipeline
  stage            text check (stage in ('prefilter', 'pending', 'title_triage', 'scored', 'pay', 'recommended')),
  reason           text,
  score            integer check (score between 0 and 10),
  first_seen       date,
  last_seen        date,
  decided_at       timestamptz,
  feedback         text check (feedback in ('want', 'not_for_me', 'wrong_reason')),
  feedback_note    text,
  feedback_at      timestamptz,
  feedback_sent_at timestamptz,
  processed_at     timestamptz,
  -- application tracker
  status           text check (status in ('watching', 'to_apply', 'applied', 'recruiter_screen', 'interviewing',
                                          'offer', 'rejected', 'withdrawn', 'closed')),
  date_applied     date,
  date_rejected    date,
  fit              text check (fit in ('high', 'medium', 'low')),
  level            text,
  req_id           text,
  base_range       text,
  total_comp_est   text,
  notes            text,
  notion_page_url  text,
  -- legacy Notion links from the Notion-era Job Scout (nullable; not written for new rows)
  notion_url       text,
  report_url       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- The posting url is the identity. A plain constraint, not a partial index: PostgREST upserts
  -- (on_conflict=user_id,url) need one. Manual adds may have no url; nulls are distinct.
  constraint jobs_user_url_unique unique (user_id, url)
);
create index if not exists jobs_user_stage_idx on public.jobs (user_id, stage);
create index if not exists jobs_user_status_idx on public.jobs (user_id, status) where status is not null;
create index if not exists jobs_user_first_seen_idx on public.jobs (user_id, first_seen desc);
create index if not exists jobs_user_last_seen_idx on public.jobs (user_id, last_seen desc);
-- collect reads feedback not yet sent to the agent on every run
create index if not exists jobs_feedback_pending_idx
  on public.jobs (user_id) where feedback is not null and feedback_sent_at is null;

alter table public.jobs enable row level security;

drop policy if exists "users manage own jobs" on public.jobs;
create policy "users manage own jobs" on public.jobs
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.jobs from anon, authenticated;
grant select, insert, update, delete on public.jobs to authenticated;

drop trigger if exists trg_jobs_updated_at on public.jobs;
create trigger trg_jobs_updated_at
  before update on public.jobs
  for each row execute function set_updated_at();


-- One Job Scout report per day: the ranking agent's write-up, rendered on /jobs.
create table if not exists public.job_scout_reports (
  user_id    uuid not null references auth.users(id) on delete cascade,
  date       date not null,
  markdown   text not null,
  stats      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, date)
);

alter table public.job_scout_reports enable row level security;

drop policy if exists "users read own job scout reports" on public.job_scout_reports;
create policy "users read own job scout reports" on public.job_scout_reports
  for select to authenticated
  using (user_id = auth.uid());

revoke all on public.job_scout_reports from anon, authenticated;
grant select on public.job_scout_reports to authenticated;
