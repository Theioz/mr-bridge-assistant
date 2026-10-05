-- Real-user page-load metrics (#445).
--
-- #445 set a 2500 ms mobile LCP target measured by Lighthouse's simulated mid-range phone on slow
-- 4G. Measured on 2026-10-05, /login scored 2840 ms in that simulation while the same page painted
-- its LCP element in ~195 ms unthrottled. The simulation replays every byte requested before LCP
-- over a 1.6 Mbps link, so it ranks font and JS weight, not what the app's actual users see on
-- their actual phones. Before cutting fonts or JS for a lab number, record the field numbers.
--
-- One row per metric per page load, written by the signed-in app through POST /api/vitals
-- (components/web-vitals-reporter.tsx). The route is normalized client-side (ids become :id) so
-- rows group by page, not by record.

begin;

create table if not exists public.web_vitals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  metric text not null check (metric in ('LCP', 'FCP', 'CLS', 'INP', 'TTFB')),
  value double precision not null check (value >= 0),
  rating text check (rating in ('good', 'needs-improvement', 'poor')),
  route text not null,
  nav_type text,
  viewport_w integer,
  viewport_h integer,
  dpr real,
  -- navigator.connection.effectiveType where the browser exposes it (Chrome/Android; not Safari).
  effective_type text,
  mobile boolean,
  created_at timestamptz not null default now()
);

alter table public.web_vitals enable row level security;

drop policy if exists "users insert own vitals" on public.web_vitals;
create policy "users insert own vitals" on public.web_vitals
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "users read own vitals" on public.web_vitals;
create policy "users read own vitals" on public.web_vitals
  for select to authenticated using (auth.uid() = user_id);

-- Grant exactly what the app uses. The default privileges still hand `authenticated` ALL on a new
-- table, including TRUNCATE, which row-level security does not cover: any signed-in session could
-- empty the table. Revoke first, then grant the two verbs the app needs.
revoke all on public.web_vitals from authenticated, anon;
grant select, insert on public.web_vitals to authenticated;

create index if not exists web_vitals_user_created_idx
  on public.web_vitals (user_id, created_at desc);

notify pgrst, 'reload schema';

commit;
