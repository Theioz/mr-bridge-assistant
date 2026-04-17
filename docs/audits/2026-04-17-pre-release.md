# Pre-release audit — 2026-04-17

Scope: issue [#252](https://github.com/Theioz/mr-bridge-assistant/issues/252). Method: stratified sweep (ship-blocker hunt → deep dive). Executed against `main` at `7ce4b677` (post demo-refresh merge).

## Go/no-go recommendation

**Ship with caveats.** No findings block the release from a correctness, security, or data-integrity standpoint. Three caveats gate the cut:

1. **Manual UX walkthrough is outstanding.** Category 8 (cold-login click-through on mobile 375px + desktop ≥1024px against the refreshed demo account) was not performed by this audit — it requires a browser session. Owner must complete it before cutting the tag.
2. **Trivial-fix PR must merge first.** `.env.example` currently documents the wrong Supabase variable names — fresh clones won't boot with the documented values. Fix bundled in the companion PR.
3. **Follow-ups filed, not fixed.** `npm run lint` isn't wired up (so CI has no lint enforcement), and three major-version dep upgrades (Next 15→16, AI SDK 4→6, TypeScript 5→6) are pending. None block this release; all are filed as separate issues for the next cycle.

All pre-flagged "critical" bugs from the audit brief (#319, #239, #268, #223) were already CLOSED in main before the audit began — they landed in the run-up to the release window, not as audit follow-ups.

## Summary by category

| Category | Status | Notes |
|----------|--------|-------|
| 1. Open bugs | Clean | 20 open issues — all feature backlog or release-adjacent tracking (#272, #323). No open bugs. |
| 2. Code audit | Clean | Zero `TODO`/`FIXME`/`XXX`/`HACK` markers in `web/src`. Zero Tailwind color-class drift. No hardcoded user IDs (only env-configured `OWNER_USER_ID` in `/api/cron/sync`). |
| 3. Docs | Mixed | README current. CHANGELOG current. Architecture diagram updated today. **`.env.example` has real gaps** — see Medium #1 and #2 below. CLAUDE.md current. |
| 4. Dependencies | Advisory | `npm audit`: 0 critical, 0 high, 2 moderate. 10 outdated — 3 majors (Next, AI SDK, TypeScript). All filed as follow-ups. |
| 5. Build + types | Clean | `npm run build` passes (Next 15 build runs typecheck). **`npm run lint` does NOT run** — no ESLint config; `next lint` triggers interactive setup. Filed as Medium #3. |
| 6. Supabase | Clean | All 21 tables have `enable row level security` ✓. All user-owned tables have `auth.uid() = user_id` policies. Only `sync_log` keeps `using (true)` — intentional (global integration log, non-sensitive). The old over-permissive `using (true)` policies from `20260410163801_initial_schema.sql` were dropped and replaced in `20260413000000_add_user_id_multitenancy.sql` — verified. |
| 7. API routes | Clean | All 25 API routes check `auth.getUser()` and return 401 on null (except `/api/cron/*` which gate on `CRON_SECRET`). `createServiceClient()` used in 6 routes — all pair it with an explicit `.eq("user_id", userId)` filter (correct pattern for perf + app-level tenancy). No stack-trace leaks (`err.stack` never returned). |
| 8. UX walkthrough | **Not performed** | Requires browser. Owner must walk cold-login → dashboard → each tab → settings on mobile 375px + desktop ≥1024px against the demo account before cutting. |

## Critical (ship blockers)

None.

## High

None.

## Medium

1. **`.env.example` documents wrong Supabase variable names.** `SUPABASE_URL` / `SUPABASE_ANON_KEY` are in the example file, but code in `web/src/lib/supabase/{client,server,service}.ts`, `web/src/middleware.ts`, and `web/src/app/auth/callback/route.ts` reads `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`. A fresh clone filling in the documented names will fail to boot. **Bundled in trivial-fix PR.**

2. **`.env.example` missing 9 referenced env vars.** Used in code, not documented: `POLYGON_API_KEY`, `USER_TIMEZONE`, `SPORTSDB_API_KEY`, `SPORTS_PROVIDER`, `CRON_SECRET`, `OWNER_USER_ID`, `GROQ_API_KEY`, `GOOGLE_FIT_CLIENT_ID`, `GOOGLE_FIT_CLIENT_SECRET`. The last four are optional (have fallbacks or only needed for specific integrations), but `CRON_SECRET` is required for cron endpoints to function. **Bundled in trivial-fix PR.**

3. **`npm run lint` is not functional.** No ESLint config exists in `web/`; `next lint` triggers interactive setup on every invocation. CI has no lint enforcement despite `package.json` exposing a `lint` script. Additionally, `next lint` is deprecated in Next 16. **Filed as new issue — Medium follow-up.**

## Low

4. **Major-version dep upgrades pending.** Next 15.5.15 → 16.2.4, AI SDK 4.3.19 → 6.0.168, TypeScript 5.9.3 → 6.0.3. All majors; each is non-trivial migration work. No security driver, no functional gap, but staying on old majors accumulates migration debt. **Filed as new issues — Low follow-up.**

5. **`npm audit`: 2 moderate vulnerabilities.** No high or critical. Moderate-severity findings in transitive dependencies; no immediate action required.

6. **`docs/README.md` says "all 20 tables" but 21 tables exist.** Minor count nit (strength_session_sets was added in `20260416000000` and the count wasn't updated). **Bundled in trivial-fix PR.**

7. **`.claude/rules/mr-bridge-rules.md` has a stale forward-reference.** Line in "Location Management / Web UI hook (future)" says "When the web interface is built (issue #10), expose a Location field in Settings…" — the web interface has shipped and `/settings` already exposes the Location field. **Bundled in trivial-fix PR.**

## Trivial (bundled in PR)

- `.env.example`: rename `SUPABASE_URL` → `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_ANON_KEY` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `.env.example`: add `POLYGON_API_KEY`, `USER_TIMEZONE`, `SPORTSDB_API_KEY`, `SPORTS_PROVIDER`, `CRON_SECRET`, `OWNER_USER_ID`, `GROQ_API_KEY`, `GOOGLE_FIT_CLIENT_ID`, `GOOGLE_FIT_CLIENT_SECRET`.
- `README.md`: "all 20 tables" → "all 21 tables" (or remove the count, which is more resilient — going with phrasing "all tables" to stop the count from going stale).
- `.claude/rules/mr-bridge-rules.md`: drop the "(future)" framing on the Location Management / Web UI hook section since `/settings` exposes this today.
- `CHANGELOG.md`: entry for the above under `[Unreleased] Fixed`.
- `docs/audits/2026-04-17-pre-release.md` (this report) committed.

## Manual verification required before cutting release

This audit was executed from CLI — it cannot walk the UI. Owner must do the following before tagging:

- [ ] Log out, log in as `demo@mr-bridge.app` using the "Try demo" button.
- [ ] Dashboard loads — all 9 widgets populated (weather, schedule, habits, tasks, body comp, recovery, activity, stocks, sports).
- [ ] Chat tab — send a message; verify streaming + persistence.
- [ ] Each tab: Habits, Tasks, Fitness, Meals, Journal, Weekly, Notifications, Settings — no empty states, no 500s, no broken buttons.
- [ ] Repeat on mobile 375px (devtools responsive mode or a phone).
- [ ] No regressions vs. the previous release on navigation, auth-redirect, or session persistence.

## Filed follow-up issues

(Populated in close comment on #252 after filing.)

## Process notes for next audit

- Pass 1 (ship-blocker hunt) completed in ~10 min and surfaced nothing — the stratified approach paid off: we got the "we're OK to keep going" signal early.
- Worth adding a `typecheck` script alongside `build` so typecheck can run independently (currently only runs as part of `next build`, which is ~45s).
- Worth adding `depcheck` to the CI path to catch unused deps automatically.
- The UX-walkthrough leg needs a harness (Playwright?) if we want the audit to be fully automatable next time.
