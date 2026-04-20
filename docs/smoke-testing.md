# Smoke testing — Playwright + Playwright MCP

Automated browser smoke for chat-route and tool changes. Replaces the manual
"start dev, sign in, send a message, paste output back" loop for scenarios
covered by committed specs. Motivated by the PR #359 rollback (skipped manual
smoke) and the multi-hour #323 pre-release verification.

## What's covered today

- `smoke/specs/chat.spec.ts` — signs in → sends "what is 2+2" → waits for
  the /api/chat stream to close → asserts the assistant bubble is visible with
  a "4" or "four" → verifies `chat_messages` persisted user + assistant rows →
  asserts zero console errors during the turn.
- `smoke/specs/a11y.spec.ts` — runs axe-core across all 11 routes
  (`/dashboard`, `/chat`, `/fitness`, `/habits`, `/tasks`, `/weekly`,
  `/journal`, `/meals`, `/notifications`, `/settings`, `/login`). Fails on
  any Critical or Serious violation; Moderate / Minor findings surface as
  Playwright annotations in the HTML report without blocking. The
  `color-contrast` rule is temporarily disabled pending the design-token
  sweep in #381. Whole run: ~21s on a warm dev server.
- `smoke/perf/lighthouse.mts` — Lighthouse Core Web Vitals sweep across
  the same 11 routes, mobile + desktop presets, median of 3 runs per
  (route × preset). Thresholds from #323 Gate B: **CLS < 0.1**,
  **LCP < 2.5s**, **TBT < 200ms** as the INP proxy (INP is a field metric
  and can't be measured in a lab run — TBT is the published surrogate —
  see https://web.dev/articles/inp). Writes per-route HTML reports +
  `summary.json` under `web/smoke/perf-report/` (gitignored); exits
  non-zero on any breach. Expensive (~7 min for 66 Lighthouse runs
  against a prod build) — intended for nightly / manual dispatch, not
  per-PR.

## What's still manual

- **iOS Safari on a real device** — deploy a preview URL and visit from the
  phone.
- **VoiceOver / screen-reader pass** — macOS, one-off per release.
- **Subjective design quality** — Impeccable `/critique`, `/polish`.
- **Multi-turn, tool-call, and mutating-tool flows** — follow-up issues; the
  manual chat-smoke rule still applies until those specs exist.

## Prerequisites

### 1. Test account

**Never point smoke at your real account.** The test account writes to
`chat_sessions` and `chat_messages`. Running smoke against the owner account
would pollute real data.

One-time setup in the Supabase dashboard:

1. Supabase dashboard → Authentication → Users → **Add user**.
2. Email: `smoke+test@mr-bridge.test` (or any dedicated address).
3. Password: generate a strong one; store in 1Password under
   `Mr. Bridge — Smoke test account`.
4. Toggle "Auto Confirm User" so no email-verification step blocks sign-in.
5. Start the dev server, sign in once as the test account, and set
   `display_name`, `timezone`, and `location` via Settings — this initialises
   the `profiles` row.

**Do NOT connect OAuth integrations** (Gmail, Calendar, Fitbit, Oura, Google
Fit) on this account. Mutating-tool smokes are deferred to a follow-up issue
and will need a separate test Google Calendar.

### 2. Environment variables

Add to `web/.env.local`. The Playwright config auto-loads `.env.local` then
`.env` from the package root — no `source` or `node --env-file` dance needed.
Shell-exported values always win.

```
SMOKE_TEST_EMAIL=smoke+test@mr-bridge.test
SMOKE_TEST_PASSWORD=<from-1Password>
SMOKE_SUPABASE_SERVICE_KEY=<same-value-as-SUPABASE_SERVICE_ROLE_KEY>
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
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
npm run smoke:chat     # just the chat smoke
npm run smoke:a11y     # axe sweep across the 11 routes
npm run smoke           # the full suite (chat + a11y)
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

3. Prefer stable selectors in this order: `data-*` attributes (e.g.
   `data-print-message="assistant"` on chat bubbles), accessible name /
   label (`getByRole`, `getByLabel`), text content with a regex. Avoid
   class-based selectors.
4. Wait on semantic markers, not fixed timeouts — `waitForResponse`,
   `toBeVisible`, `toHaveURL`.
5. If the spec mutates shared state (chat sessions, DB rows), scope it per
   session where possible and document any residual data-accumulation.

## CI

[`.github/workflows/smoke.yml`](../.github/workflows/smoke.yml) runs two
jobs:

- **`smoke-pr`** — on every PR that touches `web/**`, the smoke docs,
  `.mcp.json`, or the workflow itself. Runs `smoke:chat` + `smoke:a11y`
  against Playwright-managed `next dev`. Cancels stale runs on new
  pushes to the same branch. Target < 3 min after warm cache.
- **`smoke-release`** — nightly at 09:00 UTC plus `workflow_dispatch`
  for manual triggers. Runs chat + a11y against dev, stops it, then
  `next build` + `next start` and runs `smoke:perf` against the prod
  bundle. Target < 20 min.

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
- `ANTHROPIC_API_KEY` — chat smoke hits the real Anthropic API.

**Never scope these to production.** Always point at the smoke test
account's Supabase project.

## Troubleshooting

- **`SMOKE_TEST_EMAIL is required for smoke tests`** — the env var isn't
  reaching Playwright. Confirm it's in `web/.env.local` (which the config
  auto-loads) or exported in your shell. `grep ^SMOKE_ web/.env.local` is a
  quick sanity check.
- **Sign-in fails** — confirm the test account is confirmed in the Supabase
  dashboard and the password in 1Password matches. Temporarily run with
  `--headed` to watch the browser: `npm run smoke:chat -- --headed`.
- **`/api/chat` 500** — check `ANTHROPIC_API_KEY` in `.env.local`. Without a
  key the chat route returns 500 and the smoke fails on stream completion.
- **Stream doesn't complete in time** — bump `expect` timeout in
  `playwright.config.ts`; streaming Sonnet can exceed 15s on cold starts.
- **Dev server port conflict** — stop any existing `next dev` on port 3000 or
  set `reuseExistingServer: true` (already the default outside CI).
