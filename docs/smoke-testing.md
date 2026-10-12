# Smoke testing — Playwright + Playwright MCP

Automated browser smoke for UI and route changes. Replaces the manual
"start dev, sign in, click through, paste output back" loop for scenarios
covered by committed specs. Motivated by the PR #359 rollback (skipped manual
smoke) and the multi-hour #323 pre-release verification.

## What's covered today

- `smoke/specs/a11y.spec.ts` — runs axe-core across 13 routes
  (`/dashboard`, `/fitness`, `/habits`, `/tasks`, `/weekly`, `/journal`,
  `/meals`, `/inventory`, `/library`, `/calendar`, `/notifications`,
  `/settings`, `/login`). Fails on any Critical or Serious violation;
  Moderate / Minor findings surface as Playwright annotations in the HTML
  report without blocking. No axe rules are disabled.
- `smoke/specs/gate-b.spec.ts` — responsive overflow, theme persistence,
  touch targets, print styles and nav smoke across 10 routes (`/dashboard`,
  `/journal`, `/tasks`, `/habits`, `/meals`, `/fitness`, `/weekly`,
  `/notifications`, `/settings`, `/login`).
- Plus targeted specs: `calendar-smoke`, `dashboard-hydration`, `export`,
  `login-signup-smoke`, `security-headers`, `tasks-mutation-errors`.
- `smoke/perf/lighthouse.mts` — Lighthouse Core Web Vitals sweep across
  10 routes (`/dashboard`, `/fitness`, `/habits`, `/tasks`, `/weekly`,
  `/journal`, `/meals`, `/notifications`, `/settings`, `/login`), mobile + desktop presets, median of 3 runs per
  (route × preset). Thresholds from #323 Gate B: **CLS < 0.1**,
  **LCP < 2.5s**, **TBT < 200ms** as the INP proxy (INP is a field metric
  and can't be measured in a lab run — TBT is the published surrogate —
  see https://web.dev/articles/inp). Writes per-route HTML reports +
  `summary.json` under `web/smoke/perf-report/` (gitignored); exits
  non-zero on any breach. Expensive (~7 min for 60 Lighthouse runs
  against a prod build) — intended for nightly / manual dispatch, not
  per-PR.

## What's still manual

- **iOS Safari on a real device** — visit the deployed app from the phone over
  the tailnet.
- **VoiceOver / screen-reader pass** — macOS, one-off per release.
- **Subjective design quality** — Impeccable `/critique`, `/polish`.
- **MCP tool flows** — the MCP server (`web/mcp/`) is not driven by these
  specs; exercise mutating tools by hand from a Claude Code session.

## Prerequisites

### 1. Test account

**Never point smoke at your real account.** Several specs mutate data (tasks,
theme, sign-out). Running smoke against the owner account would pollute real
data.

One-time setup on the self-hosted Supabase (there is no Studio dashboard; create
the user through GoTrue's admin API or `auth.users` as postgres):

1. Create a user.
2. Email: `smoke+test@mr-bridge.test` (or any dedicated address).
3. Password: generate a strong one; store it in your password manager
   (Vaultwarden is canonical for this deployment's secrets).
4. Mark it email-confirmed (`email_confirm: true`) so no verification step blocks sign-in.
5. Start the dev server, sign in once as the test account, and fill in the
   basics in Settings (name, location) — this creates the account's rows in
   the key/value `profile` table.

**Do NOT connect OAuth integrations** (Calendar, Google Health, Oura) on
this account. Mutating-tool smokes are deferred to a follow-up issue
and will need a separate test Google Calendar.

### 2. Environment variables

Add to `web/.env.local`. The Playwright config auto-loads `.env.local` then
`.env` from the package root — no `source` or `node --env-file` dance needed.
Shell-exported values always win.

```
SMOKE_TEST_EMAIL=smoke+test@mr-bridge.test
SMOKE_TEST_PASSWORD=<from-your-password-manager>
SMOKE_SUPABASE_SERVICE_KEY=<same-value-as-SUPABASE_SERVICE_ROLE_KEY>
NEXT_PUBLIC_SUPABASE_URL=https://supabase.jl-infra-lab.com
```

`SMOKE_SUPABASE_SERVICE_KEY` is the same value as `SUPABASE_SERVICE_ROLE_KEY`
— aliased to make the smoke code path explicit and to allow scoping to a
smoke-only Supabase project later if desired.

### 3. Install Playwright browsers

One-time per machine:

```
cd web
npm run smoke:install
```

Downloads Chromium + dependencies (~150 MB).

## Running locally

The Playwright config auto-starts `npm run dev` on port 3000 (and reuses it if
you already have one running). From `web/`:

```
npm run smoke:a11y     # axe sweep across the 10 routes
npm run smoke           # the full suite
```

`smoke:perf` is the exception — Lighthouse runs expect a Next server on
`localhost:3000` that they drive via CDP, and mobile preset throttling
makes dev-mode numbers meaningless (4× CPU throttle + slow-3G on top of
unminified, source-mapped bundles = guaranteed 6–10s LCP regardless of
real perf). Always run against a production build:

```
npm run build
npm run start          # in one terminal
npm run smoke:perf     # in another
```

Useful variants (#445):

```
PERF_ROUTES=/login npm run smoke:perf                              # public route only, no test account needed
PERF_TARGET=https://mr-bridge.jl-infra-lab.com npm run smoke:perf  # measure the live deployment instead
```

**Local only since the July 2026 self-host cutover.** The database is tailnet-only, so a
GitHub-hosted runner cannot sign in; the workflow (see [CI](#ci)) only runs on manual dispatch, or
on its weekly schedule when explicitly enabled, and needs a runner that can reach the tailnet. Put
`SMOKE_TEST_EMAIL` / `SMOKE_TEST_PASSWORD` for a test account on the self-hosted instance in
`web/.env.local`.

The script fronts the app with a local proxy that drops one response header,
`Referrer-Policy`: Lighthouse 13.1 on Chromium 147 crashes the page on it (`TARGET_CRASHED` →
`FAILED_DOCUMENT_REQUEST`), and the app sends it on every route. Nothing else is altered.

Lab numbers are a simulated mid-range phone on slow 4G. For what the app is like on the device it
is actually used from, see the real-user metrics: `python3 scripts/web_vitals_report.py`.

`web/smoke/perf-report/<route>-<preset>.html` is the full Lighthouse
UI; `web/smoke/perf-report/summary.json` is the structured breakdown.

Per-route baselines live in
[web/smoke/perf/baselines.json](../web/smoke/perf/baselines.json) —
the gate is `value <= max(threshold, baseline)`, so current known-bad
routes don't block the pipeline but regressions past the current
floor still fail. Ratchet baselines down as perf improves; delete the
file once every route passes the hard thresholds. Tracked in
[#384](https://github.com/Theioz/mr-bridge-assistant/issues/384).

On failure, Playwright writes a trace + screenshot to
`web/smoke/test-results/` and an HTML report to
`web/smoke/playwright-report/`. Open the report with
`npx playwright show-report smoke/playwright-report`.

## Playwright MCP — interactive browser control

`@playwright/mcp` (Microsoft's official Playwright MCP server) is registered
in [.mcp.json](../.mcp.json) at the repo root. When Claude Code opens a
session in this repo, the Playwright MCP tools surface — `browser_navigate`,
`browser_type`, `browser_click`, `browser_snapshot`, etc. — so Claude can
drive a real browser during authoring, debugging, and verification without
the user pasting output back.

First-time approval: the Claude Code launch dialog asks to approve project
MCP servers. Approve `playwright`. Subsequent sessions reuse the approval.

The MCP and the committed `smoke/` suite are independent:

- **MCP** — interactive authoring. Claude drives Chrome during a session.
- **Committed specs** — durable regression gate. Runs before PRs and
  releases. Survives across sessions.

## Authoring a new smoke

1. Add a new file under `web/smoke/specs/` — e.g. `auth.spec.ts`.
2. Import the signed-in fixture:

   ```ts
   import { test, expect } from "../fixtures/auth";

   test("describes the user-visible outcome", async ({ signedInPage, consoleErrors }) => {
     const page = signedInPage;
     await page.goto("/some-route");
     // ...
     expect(consoleErrors).toHaveLength(0);
   });
   ```

3. Prefer stable selectors in this order: `data-*` attributes, accessible name /
   label (`getByRole`, `getByLabel`), text content with a regex. Avoid
   class-based selectors.
4. Wait on semantic markers, not fixed timeouts — `waitForResponse`,
   `toBeVisible`, `toHaveURL`.
5. If the spec mutates shared state (DB rows), scope it per
   session where possible and document any residual data-accumulation.

## CI

[`.github/workflows/smoke.yml`](../.github/workflows/smoke.yml) runs two
jobs. Neither runs on pull requests: the app and Supabase are tailnet-only, so a
GitHub-hosted runner cannot reach them (see the workflow header).

Neither job is useful until a runner that can reach the tailnet exists and
the secrets below point at the self-hosted instance.

- **`smoke-a11y`** — `smoke:a11y` (axe sweep, critical + serious violations
  fail) against Playwright-managed `next dev`. Runs on `workflow_dispatch`
  with suite `a11y`, and weekly (Mondays 09:00 UTC) **only** when the repo
  variable `SMOKE_SCHEDULE_ENABLED` is `true` — off by default, so the
  schedule is skipped rather than failing until a reachable runner exists.
- **`smoke-release`** — `workflow_dispatch` with suite `release`. Runs a11y
  against dev, stops it, then `next build` + `next start` and runs
  `smoke:perf` against the prod bundle. Target < 20 min.

A plain `next build` (no app, no secrets) runs on every PR touching `web/**`
via [`build.yml`](../.github/workflows/build.yml).

Playwright browsers are cached with key
`playwright-<runner>-<hash(package-lock.json)>`; the `--with-deps
chromium` install only runs on cache miss. On failure both jobs
upload `smoke/test-results/`, `smoke/playwright-report/`, and (for
release) `smoke/perf-report/` as GitHub artifacts with 14-day
retention.

### Secrets

Add these under repo Settings → Secrets and variables → Actions:

- `SMOKE_TEST_EMAIL`
- `SMOKE_TEST_PASSWORD`
- `SMOKE_SUPABASE_SERVICE_KEY` — service-role key; the workflow aliases
  it to `SUPABASE_SERVICE_ROLE_KEY` at runtime so server tools find it
  under their expected name.
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the Next middleware + auth flow
  use this on every request; without it the dev server crashes before
  Playwright ever signs in.

**Never scope these to the owner account.** Always use the smoke test account.

## Troubleshooting

- **`SMOKE_TEST_EMAIL is required for smoke tests`** — the env var isn't
  reaching Playwright. Confirm it's in `web/.env.local` (which the config
  auto-loads) or exported in your shell. `grep ^SMOKE_ web/.env.local` is a
  quick sanity check.
- **Sign-in fails** — confirm the test account is email-confirmed and the
  password you stored matches. Temporarily run with `--headed` to watch the
  browser: `npm run smoke:a11y -- --headed`.
- **Dev server port conflict** — stop any existing `next dev` on port 3000 or
  set `reuseExistingServer: true` (already the default outside CI).
