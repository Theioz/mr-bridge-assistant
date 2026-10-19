# Architecture

Mr. Bridge is a **single-user, self-hosted** app: one owner, one Supabase instance, on a homelab node. Multi-tenancy was abandoned in favour of self-hosting (#201). This document captures its architectural intent: why decisions were made and where the system is heading. It is not a setup guide (see [README.md](../README.md)) or an API reference — it is the record of design choices that are not visible from code alone.

---

## Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | Next.js 16 App Router | Self-hosted Docker on compute-core (web/Dockerfile, standalone output); SSR + RSC; `web/` subdirectory |
| Database | Self-hosted Supabase — Postgres + GoTrue + PostgREST | RLS on every public table; pgcrypto for token encryption. No Kong, Realtime or Storage (see [Deployment](#deployment-self-hosted-476--adr-0017)) |
| Nutrition | **USDA FoodData Central** (measured data) + a local Ollama model (`qwen2.5vl:7b`) that only identifies foods and reads qty+unit — it is never asked for grams or calories. No Anthropic API call sites remain (#609–#611). |
| Conversation | **MCP server** (`web/mcp/`) → Claude Code, on the existing subscription. No API key. The in-app chat was deleted (#476). |
| Auth | Supabase Auth | JWT; SSR cookie-based via `@supabase/ssr` |
| Hosting / Cron | Docker on compute-core | Cron is the **node's crontab** (jl-homelab `system/cron/compute-core-crontab`); there is no Vercel and no `vercel.json` (#514). |
| External APIs | Google Calendar, Google Health, Oura, USDA FoodData Central, Polygon.io, ESPN, Open-Meteo, TMDB, IGDB, Open Library, Google Books, Plex, ntfy.sh | All server-side; credentials never reach the browser. The web app's Google grant is Calendar-only — it has no Gmail scope (#693). |

---

## Schema — grouped by domain

Every table in `public` has Row Level Security switched on (see [RLS Pattern](#rls-pattern) below). Tables with a `user_id` column carry an own-rows policy; the shared exceptions are listed under [Shared tables](#shared-tables-sync_log-exercises-usda_food_picks). The tables below are grouped by domain and are not exhaustive — [`supabase/migrations/`](../supabase/migrations/) is the authoritative schema, and `.claude/rules/data-sources.md` maps each table to what writes it.

### Identity & Profile

| Table | Purpose |
|-------|---------|
| `profile` | Flat key/value store for all user preferences and settings — name, location, nutrition goals, fitness targets, theme, etc. Designed as an extension point: adding a new preference requires no schema change |

### Habits

| Table | Purpose |
|-------|---------|
| `habit_registry` | Habit definitions: name, emoji, category, active/archived |
| `habits` | Daily completion records — one row per habit per date |

### Tasks & Study

| Table | Purpose |
|-------|---------|
| `tasks` | Todos with priority, status, due date, parent_id for subtask hierarchy, `list_id`, `blocked_by` |
| `task_lists` | Named lists a task belongs to (replaced the free-text `tasks.category`) |
| `task_series` | Recurring-task rules; `scripts/spawn_task_occurrences.py` materializes `tasks` rows from them |
| `study_log` | Legacy study sessions. Nothing writes it since the study timer was removed (#762); read only by `fetch_briefing_data.py` and the data export |

### Fitness & Body Composition

| Table | Purpose |
|-------|---------|
| `fitness_log` | Weight, body fat %, derived BMI — from Google Health. (`muscle_mass_lb` is legacy: it was fed by the retired Renpho scale via Google Fit; Google Health has no lean-body-mass type — see #69) |
| `workout_sessions` | Cardio/activity sessions from Google Health or manual entry: type, duration, calories, HR zones |
| `recovery_metrics` | Oura Ring sleep/recovery: readiness, HRV, sleep stages, resting HR. (Oura-only since #607 — Google Health writes no recovery rows) |
| `strength_sessions` | Strength training sessions: start/end time, notes |
| `strength_session_sets` | Individual sets within a session: exercise, weight, reps, RPE |
| `workout_plans` | Structured weekly programs: Mon–Sun plan cards with phases (warm-up/workout/cool-down) |
| `exercise_prs` | Personal records per exercise, computed from `strength_session_sets` |
| `user_equipment` | Gym equipment inventory (dumbbell pairs, barbells, bands) used to scope workout suggestions |
| `exercises` | Shared exercise catalog (movements, cues). No `user_id`; signed-in users may read it, only the service role writes it |
| `user_metric_preferences` | Which integration to trust per metric (e.g. HRV from Oura) |

### Meals & Nutrition

| Table | Purpose |
|-------|---------|
| `recipes` | Saved recipes: name, cuisine, ingredients, tags, macros |
| `meal_log` | Daily food entries: date, meal type, macros (calories/protein/carbs/fat/fiber/sugar), optional recipe link |
| `cooks` | One time food was actually made; portions and leftovers live here, not on the recipe |
| `meal_plans` | Planned meals — a cook (leftovers), a recipe (to cook), or freeform. Carries no macros of its own |
| `inventory_items` / `inventory_draws` | Raw ingredients on hand, and the grams a cook drew from them |
| `packaged_foods` | Nutrition labels of branded products, as photographed |
| `grocery_products` | Grocery product pins (food identity → ASIN, pack size, last price) |
| `usda_food_picks` | Cache of which USDA record a food name resolved to. Service-role only |

### Backlog

| Table | Purpose |
|-------|---------|
| `backlog_items` / `backlog_sessions` | Games, shows, movies and books, plus play/watch/read sessions (Plex watch history is synced in) |

### Journal

| Table | Purpose |
|-------|---------|
| `journal_entries` | Daily reflections: 5 guided prompts + free-write; auto-saved |

### Notifications

| Table | Purpose |
|-------|---------|
| `notifications` | Push notification history: type, title, body, read status. Every ntfy push from `scripts/_push.py` also writes a row; `/api/cron/sync` purges rows older than 30 days |

### Integrations & Sync

| Table | Purpose |
|-------|---------|
| `user_integrations` | Encrypted OAuth refresh tokens per provider (`google`, `google_health`, `oura`) — see [OAuth Token Encryption](#oauth-token-encryption) |
| `sync_log` | Sync audit log and cron heartbeats: source, status, records written, error. Read by Settings → Status. No `user_id` — see [Shared tables](#shared-tables-sync_log-exercises-usda_food_picks) |

### System / Cache

| Table | Purpose |
|-------|---------|
| `stocks_cache` | Stock quote + sparkline data from Polygon.io; refreshed on-demand |
| `sports_cache` | Sports scores/schedules from ESPN (TheSportsDB removed in #368); refreshed on-demand |
| `web_vitals` | Real-user page-load metrics per route (#445), written via `POST /api/vitals` |

---

## RLS Pattern

Every per-user table enforces Row Level Security with one own-rows policy for the `authenticated` role, e.g.:

```sql
CREATE POLICY "users access own data" ON <table>
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

(Policy names vary by table; the shape does not.) A session JWT can only read or write its own rows — even with a single owner, a query that forgets a filter cannot reach rows it does not own.

### Privileges under the policies

RLS is not the only lock. Three migrations make the grants fail closed:

- **`anon` holds nothing in `public`** — no table, sequence or function privileges, now or on future objects (`20260928180000_lock_down_anon_access.sql`). The gateway routes `/rest/v1/*` straight to PostgREST with no Kong `apikey` gate, so a keyless request runs as `anon`; it can reach nothing. The migration asserts that every public table has RLS on.
- **RLS is on by default** — an event trigger enables RLS on every new table created in `public` (`20260928181000_rls_on_by_default.sql`). A table created without a policy shows nothing rather than everything.
- **`authenticated` keeps only SELECT / INSERT / UPDATE / DELETE** — TRUNCATE, TRIGGER, MAINTAIN and REFERENCES were revoked on existing and future tables, since RLS does not govern them (`20261005160000_authenticated_table_privileges.sql`, #756).

### Two Supabase clients

**`createClient()`** (`web/src/lib/supabase/server.ts`; the browser counterpart is `web/src/lib/supabase/client.ts`) — uses the anon key and the SSR cookie session. RLS is fully enforced. Used for user-facing reads and writes in Server Components and API routes.

**`createServiceClient()`** (`web/src/lib/supabase/service.ts`) — uses the service-role key, which bypasses all RLS policies. Used only server-side, in contexts that have already established who the caller is or that have no session at all:

- The cron routes (`/api/cron/sync`, `/api/cron/audit-recipes`), behind `CRON_SECRET`
- OAuth callbacks (`/api/auth/{google,google-health,oura}/callback`) — create/update `user_integrations` rows
- The public, token-gated `/share/*` pages, which must resolve a share token without a session
- A number of signed-in API routes (recipes, cooks, inventory, meal plans, packaged foods, sync) that check `auth.getUser()` first and then write with the user's id
- The MCP server (`web/mcp/server.ts`), scoped to `OWNER_USER_ID`

Because the service client bypasses RLS, **RLS does not protect those paths** — the route's own auth check and `user_id` filter do. Treat any change to them as security-relevant.

**`SUPABASE_SERVICE_ROLE_KEY` is never exposed to the browser.** It lives only in server-side env.

### Shared tables (`sync_log`, `exercises`, `usda_food_picks`)

These have no `user_id`. All three still have RLS on:

- **`sync_log`** — policy `authenticated full access` (`USING (true)`). Sync and cron heartbeats are an infrastructure concern, not user data, and the table holds no PII.
- **`exercises`** — a shared catalog; `authenticated` may SELECT, writes are service-role only.
- **`usda_food_picks`** — RLS on with **no** policy, so only the service role can read or write it.

---

## OAuth Token Encryption

OAuth refresh tokens are long-lived credentials. They are stored encrypted at rest in `user_integrations.refresh_token_encrypted` (type: `bytea`).

**Encryption:** `extensions.pgp_sym_encrypt(token, key)` from the `pgcrypto` Postgres extension. The symmetric key is `ENCRYPTION_KEY` — a 32-byte hex string set as a server-side env var, never in the browser.

**SQL-layer helpers:** Two `SECURITY DEFINER` functions, `encrypt_integration_token(token, key)` and `decrypt_integration_token(encrypted, key)`, wrap the pgcrypto calls (`20260420000001_add_user_integrations.sql`). The key is **not** stored in the database: the server reads `ENCRYPTION_KEY` from its env and passes it as an RPC argument on each call (`web/src/lib/integrations/tokens.ts`). `anon` cannot execute either function (`20260928180000_lock_down_anon_access.sql`); `authenticated` and the service role can.

**Access tokens** (short-lived) are stored as plaintext in `access_token` / `access_token_expires_at`. They expire within the hour and pose no at-rest risk.

**RLS** ensures each `user_integrations` row is owned by exactly one user. OAuth callbacks write the row with the service client.

---

## Nutrition Architecture

Macros are **not** produced by a language model. The pipeline splits the job by competence:

1. **Identify** — the local model (`qwen2.5vl:7b` via Ollama) turns text or a photo into a
   food list: name, quantity, unit. Nothing else.
2. **Quantify** — USDA FoodData Central supplies the measured portion weights and the macros.

This is more accurate than what it replaced, not less: the previous implementation asked
Claude to *recall* nutrition facts. Measured failure modes that motivated the split:

- The model put a large egg at **105g** (real ~50g) and a cup of cooked rice at **284g**
  (real ~158g) — roughly 2x on both. So it is never asked to weigh anything.
- USDA's top search hit for "chicken breast, cooked" is **breaded microwaved tenders**
  (252 kcal, 17.6g carbs vs ~165/0 for plain). So candidates are ranked to demote processed
  forms, and the model *picks* from the cleaned list — selection is a task models are
  reliable at, even when recall is not.
- Some USDA records report energy only under Atwater codes (957/958), not the classic 208,
  and some carry no nutrition at all. Both yield a plausible-looking **0 kcal** if unhandled.

Onboarding macro targets use the **Mifflin-St Jeor** equation (`lib/nutrition/targets.ts`) —
the model was being handed exactly the inputs to a formula and asked to approximate its
output. It now returns `null` on insufficient input rather than inventing targets.

Code: `web/src/lib/nutrition/{parse,fdc,estimate,suggest,targets}.ts`.


## Verified-Success Contract

All state-mutating MCP tools return a typed result shape:

```typescript
// web/src/lib/tools/_contract.ts
({ ok: true } & T) | { ok: false; error: string }
```

The tool never returns `ok: true` unless the mutation is confirmed. For calendar operations, this means:

1. **Write** — create/update/delete the event via Google Calendar API
2. **Read back** — fetch the event by ID immediately after
3. **Verify** — confirm the returned event matches the intended state
4. **Return** — only then return `{ ok: true }`

This contract was introduced because the AI was previously surfacing "Done — event created" even when the Google API had returned an error or the event hadn't persisted. The read-after-write step ensures Bridge only confirms what it can prove.

Tools that read state (no mutation) return their payload directly. The `{ ok }` shape is reserved for mutations.

---

## Cross-references

| Resource | What it contains |
|----------|-----------------|
| [README.md](../README.md) | Setup guide, env vars, deployment steps |
| [CHANGELOG.md](../CHANGELOG.md) | Full feature history by release |
| [docs/SECURITY.md](SECURITY.md) | Where secrets live, network exposure, rotation order and runbooks |
| [supabase/migrations/](../supabase/migrations/) | Authoritative schema history — every table creation and RLS policy is here |

## Deployment (self-hosted, #476 / ADR 0017)

Runs on `compute-core`, a homelab node. **Three hostnames, three exposure levels:**

| Hostname | Reach | What |
|---|---|---|
| `mr-bridge.jl-infra-lab.com` | tailnet only | The full app. Health data is never publicly routable. |
| `supabase.jl-infra-lab.com` | tailnet only | The database gateway. It **must** be a real hostname — the browser talks to Supabase directly (anon-key client), so it cannot hide on the Docker network. |
| `share.jl-infra-lab.com` | **public** | Only token-gated `/share/*`, behind a Caddy default-deny path allowlist. Dashboard, meals, journal, fitness, settings and the whole API return 404 from the internet. |

**Supabase is three containers**, not the upstream ten: Postgres 17.6 + GoTrue + PostgREST,
plus a small node-local Caddy gateway. Dropped as verified-unused: kong, realtime,
storage-api, imgproxy, edge-runtime, analytics, supavisor, studio.

**Realtime is not deployed.** Its only consumer was the in-app chat, deleted in #476; the
chat tables and their realtime publication were dropped in
`20260713000000_drop_chat_orphans.sql`.

### Why the browser and the server use different Supabase URLs

This is the single most important thing to understand about the deployment, and the source
of four separate runtime-only bugs during the migration.

Vercel + Supabase Cloud put both sides of the app on the public internet, so one URL served
both. Self-hosted, they are on opposite sides of a network boundary:

- **browser** → `https://supabase.jl-infra-lab.com` (tailnet vhost, via Caddy on the edge host)
- **server** → `http://supabase-gateway:8000` (`SUPABASE_INTERNAL_URL`) — because the app's
  node has **no route** to the edge host's tailnet IP. Using the public URL server-side fails
  with `TypeError: fetch failed` on every service-role call, cron run and RSC page.

Consequences that follow from that split, each of which broke something:

1. **CORS** — GoTrue answers `OPTIONS` with a bare 204 and no `Access-Control-Allow-Origin`;
   upstream, *Kong* adds it. Caddy now answers the `/auth/v1` preflight. (PostgREST handles
   its own, which is why only login broke.)
2. **Cookie name** — `@supabase/ssr` derives it from the URL's *hostname*, so browser and
   server disagreed. Login **succeeded**, then middleware found no session and bounced to
   `/login` forever. `cookieOptions.name` is now pinned (`lib/supabase/urls.ts`).

## The MCP server

`web/mcp/server.ts` exposes **52 tools** to Claude Code / Claude Desktop, over the existing
Claude subscription. `.mcp.json` launches it through `web/mcp/run.sh`, which reads its secrets
from `~/.mrb-secrets/env` (outside the repo tree). It is a thin **adapter**, not a rewrite:
`web/src/lib/tools/*` defines each tool as an AI SDK `tool()` with a plain JSON Schema and an
async `execute()` — structurally already an MCP tool — so each tool keeps **one**
implementation. Where a tool and a web route do the same job they call the same `lib/` helper
(e.g. `lib/fitness/cancel-workout.ts`), so the app and Claude Code do not drift apart.

It also inherits none of the old chat route's bug class. There is no serverless deadline, no
streaming wire format and no message history to reconstruct — so the orphaned
`tool_use`/`tool_result` 400s, the fabricated "I ran out of time" message and the Continue
button do not exist rather than being ported. Those were artifacts of running a tool loop
inside a 90-second Lambda, not of the tools.

**Laptop/desktop only.** claude.ai and the mobile app can only reach *remote* MCP servers over
HTTPS; a stdio server is invisible to them. The web app remains the phone client — phone for
logging, laptop for thinking.
