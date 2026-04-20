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
npm run smoke           # the full suite (same as :chat today)
```

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

Not yet configured. Tracked as a follow-up issue alongside the axe a11y spec
and Lighthouse perf runner. When it lands, expect `smoke:chat` to run on
every PR and the full suite nightly.

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
