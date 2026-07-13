# Architecture

This document captures Mr. Bridge's architectural intent: why decisions were made and where the system is heading. It is not a setup guide (see [README.md](../README.md)) or an API reference — it is the record of design choices that are not visible from code alone.

For a live map of code relationships, see [graphify-out/GRAPH_REPORT.md](../graphify-out/GRAPH_REPORT.md).

---

## Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | Next.js 16 App Router | Self-hosted Docker on compute-core (web/Dockerfile, standalone output); SSR + RSC; `web/` subdirectory |
| Database | Supabase Postgres | RLS enforced; pgcrypto for token encryption |
| Nutrition | **USDA FoodData Central** (measured data) + a local Ollama model (`qwen2.5vl:7b`) that only identifies foods and reads qty+unit — it is never asked for grams or calories. One residual Anthropic call site remains: `api/meals/scan-chat`. |
| Conversation | **MCP server** (`web/mcp/`) → Claude Code, on the existing subscription. No API key. The in-app chat was deleted (#476). |
| Auth | Supabase Auth | JWT; SSR cookie-based via `@supabase/ssr` |
| Hosting / Cron | Self-hosted on compute-core. Cron is the **node's crontab** — `web/vercel.json` is deleted. |
| External APIs | Google Calendar, Gmail, Oura, Fitbit, Polygon.io, Open-Meteo, ntfy.sh, TheSportsDB | All server-side; credentials never reach the browser |

---

## Schema — grouped by domain

All tables with a `user_id` column enforce Row Level Security (see [RLS Pattern](#rls-pattern) below). 30 live tables (31 created, `timer_state` dropped in 20260427000001) total are user-scoped; `sync_log` is the single exception.

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
| `tasks` | Todos with priority, status, due date, parent_id for subtask hierarchy |
| `study_log` | Study sessions: subject, duration, notes |

### Fitness & Body Composition

| Table | Purpose |
|-------|---------|
| `fitness_log` | Weight, body fat %, BMI, muscle mass — from Google Fit, Fitbit, or Renpho |
| `workout_sessions` | Cardio/activity sessions from Fitbit or manual entry: type, duration, calories, HR zones |
| `recovery_metrics` | Oura Ring and Fitbit sleep/recovery: readiness, HRV, sleep stages, resting HR |
| `strength_sessions` | Strength training sessions: start/end time, notes |
| `strength_session_sets` | Individual sets within a session: exercise, weight, reps, RPE |
| `workout_plans` | Structured weekly programs: Mon–Sun plan cards with phases (warm-up/workout/cool-down) |
| `exercise_prs` | Personal records per exercise, computed from `strength_session_sets` |
| `user_equipment` | Gym equipment inventory (dumbbell pairs, barbells, bands) used to scope workout suggestions |

### Meals & Nutrition

| Table | Purpose |
|-------|---------|
| `recipes` | Saved recipes: name, cuisine, ingredients, tags, macros |
| `meal_log` | Daily food entries: date, meal type, macros (calories/protein/carbs/fat/fiber/sugar), optional recipe link |

### Journal

| Table | Purpose |
|-------|---------|
| `journal_entries` | Daily reflections: 5 guided prompts + free-write; auto-saved |

### Chat & AI

| Table | Purpose |
|-------|---------|
| `chat_sessions` | Chat session metadata: device, started_at, summary, soft-delete flag |
| `chat_messages` | Individual messages: role, content, parts (tool calls/results), position for ordering |

### Notifications & Packages

| Table | Purpose |
|-------|---------|
| `notifications` | Push notification history: type, title, body, read status; 30-day TTL |
| `packages` | Package delivery tracking: carrier, tracking number, ETA, status — parsed from Gmail |

### Integrations & Sync

| Table | Purpose |
|-------|---------|
| `user_integrations` | Encrypted OAuth refresh tokens per provider (Google, Fitbit, Oura) — see [OAuth Token Encryption](#oauth-token-encryption) |
| `sync_log` | External sync audit log: source, status, records written, error — globally readable/writable (no per-user RLS) |

### System / Cache

| Table | Purpose |
|-------|---------|
| `stocks_cache` | Stock quote + sparkline data from Polygon.io; refreshed on-demand |
| `sports_cache` | Sports scores/schedules from ESPN (TheSportsDB removed in #368); refreshed on-demand |

### SaaS / Multi-tenant Infrastructure

| Table | Purpose |
|-------|---------|
| `tenant_quotas` | Per-user daily rate limits: token cap, tool-call cap, demo-turn cap; atomic check-and-increment via `check_and_increment_quota()` |
| `feature_flags` | Per-user and global feature toggles; per-user row overrides a null-user-id global default |
| `admin_audit_log` | Append-only log of every admin mutation: actor, action, before/after JSON |

---

## RLS Pattern

Every user-data table enforces Row Level Security with a single policy:

```sql
CREATE POLICY "users can access own rows"
  ON <table>
  USING (user_id = auth.uid());
```

This means a user's session JWT can only read or write their own rows — no cross-user data leakage is possible via the API layer even if a query forgets a filter.

### Two Supabase clients

**`createClient()`** (`web/src/lib/supabase/server.ts`) — uses the anon key and the SSR cookie session. RLS is fully enforced. Used for all user-facing reads and writes in Server Components and standard API routes.

**`createServiceClient()`** (`web/src/lib/supabase/service.ts`) — uses the service-role key, which bypasses all RLS policies. Used only in trusted server-side contexts where RLS would block a legitimate system operation:

- Cron sync routes (`/api/cron/sync`, `/api/cron/reset-demo`) — write to any user's rows
- OAuth callbacks — create/update `user_integrations` rows before the session is fully established
- Admin pages (`/admin`) — read and mutate any tenant's data
- Quota enforcement functions (`check_and_increment_quota`, `record_quota_tokens`) — atomic operations that must succeed regardless of session state

**`SUPABASE_SERVICE_ROLE_KEY` is never exposed to the browser.** It lives only in server-side env vars.

### Exception: `sync_log`

`sync_log` has no per-user RLS policy. It is globally readable and writable by the authenticated role. Rationale: sync operations run under the service client or Python scripts and are an infrastructure concern, not user data. The table has no PII.

---

## OAuth Token Encryption

OAuth refresh tokens are long-lived credentials. They are stored encrypted at rest in `user_integrations.refresh_token_encrypted` (type: `bytea`).

**Encryption:** `pgp_sym_encrypt(token::bytea, key)` from the `pgcrypto` Postgres extension. The symmetric key is `ENCRYPTION_KEY` — a 32-byte hex string set as a server-side env var, never in the browser.

**Why SQL-layer helpers:** Two `SECURITY DEFINER` functions (`encrypt_integration_token`, `decrypt_integration_token`) wrap the pgcrypto calls. This keeps `ENCRYPTION_KEY` out of application call sites — the key is only referenced inside the function bodies, which run under the definer's privileges.

**Access tokens** (short-lived) are stored as plaintext in `access_token` / `access_token_expires_at`. They expire within the hour and pose no at-rest risk.

**RLS** ensures each `user_integrations` row is owned by exactly one user. The service client bypasses this only during OAuth callbacks (the user is mid-flow and the session may not yet be set).

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
{ ok: true } | { ok: false, error: string }
```

The tool never returns `ok: true` unless the mutation is confirmed. For calendar operations, this means:

1. **Write** — create/update/delete the event via Google Calendar API
2. **Read back** — fetch the event by ID immediately after
3. **Verify** — confirm the returned event matches the intended state
4. **Return** — only then return `{ ok: true }`

This contract was introduced because the AI was previously surfacing "Done — event created" even when the Google API had returned an error or the event hadn't persisted. The read-after-write step ensures Bridge only confirms what it can prove.

Tools that read state (no mutation) return their payload directly. The `{ ok }` shape is reserved for mutations.

---

## Multi-Tenant Roadmap

### Current state: per-user isolation

Every user-data table is scoped by `user_id = auth.uid()`. One user's data is invisible to any other user. This is the correct foundation for a SaaS product — it maps cleanly to a billing customer, a data subject (GDPR), and an RLS policy.

The current "multi-tenant" infrastructure shipped in 2026-04-24:

- **`tenant_quotas`** — per-user daily rate limits (tokens, tool calls, demo turns), configurable per tenant via admin overrides
- **`feature_flags`** — per-user toggles over a null-user-id global default; foundation for A/B testing and gradual rollouts
- **`admin_audit_log`** — every admin mutation is logged with actor, action, and before/after JSON
- **`/admin` route** — tenant CRUD, quota overrides, feature-flag toggles, audit log; gated by `is_admin: true` in `user_metadata`

### Next: shared spaces (`tenant_id`)

The planned evolution introduces a `tenants` table and a `tenant_id` foreign key on tables where multiple users share data (e.g. household grocery lists, shared workout programs):

```
auth.users (user_id)
    └── tenant_members (user_id, tenant_id, role)
            └── tenant (tenant_id)
                    └── shared_tasks, shared_recipes, … (tenant_id)
```

Per-user tables (`fitness_log`, `habits`, `recovery_metrics`, etc.) stay user-scoped and do not gain `tenant_id` — body composition and sleep data are always private. Only explicitly collaborative tables will be tenant-scoped.

RLS policies on shared tables will check membership:

```sql
USING (
  tenant_id IN (
    SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
  )
)
```

**Not yet implemented.** No migrations exist for this layer. The `user_id`-only model is complete and production-ready for the single-user and independent-multi-user case.

### Invitation / membership model

Planned: email invitations, `tenant_members.role` (owner/member/viewer), per-role RLS variants for read-only members. No timeline committed.

---

## Cross-references

| Resource | What it contains |
|----------|-----------------|
| [README.md](../README.md) | Setup guide, env vars, deployment steps |
| [CHANGELOG.md](../CHANGELOG.md) | Full feature history by release |
| [docs/SECURITY.md](SECURITY.md) | CSP hardening, nonce injection, auth guard patterns |
| [graphify-out/GRAPH_REPORT.md](../graphify-out/GRAPH_REPORT.md) | Live code graph — god nodes, community clusters, surprising connections |
| [supabase/migrations/](../supabase/migrations/) | Authoritative schema history — every table creation and RLS policy is here |

## Deployment (self-hosted, #476 / ADR 0017)

Runs on `compute-core`, a homelab node. **Three hostnames, three exposure levels:**

| Hostname | Reach | What |
|---|---|---|
| `mr-bridge.jl-infra-lab.com` | tailnet only | The full app. Health data is never publicly routable. |
| `supabase.jl-infra-lab.com` | tailnet only | The database gateway. It **must** be a real hostname — the browser talks to Supabase directly (anon-key client), so it cannot hide on the Docker network. |
| `share.jl-infra-lab.com` | **public** | Only token-gated `/share/*`, behind a Caddy default-deny path allowlist. Dashboard, meals, journal, fitness, settings, admin and the whole API return 404 from the internet. |

**Supabase is three containers**, not the upstream ten: Postgres 17.6 + GoTrue + PostgREST,
plus a small node-local Caddy gateway. Dropped as verified-unused: kong, realtime,
storage-api, imgproxy, edge-runtime, analytics, supavisor, studio.

**Realtime is not deployed.** Migration `20260502000000_chat_messages_realtime.sql` added
`chat_messages` to the realtime publication; its only consumer was the chat, which is gone.

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

`web/mcp/server.ts` exposes the same **30 tools** the chat had, to Claude Code / Claude
Desktop, over the existing Claude subscription. It is a thin **adapter**, not a rewrite:
`lib/tools/*` already defines each tool as an AI SDK `tool()` with a plain JSON Schema and an
async `execute()` — structurally already an MCP tool. So each tool keeps **one**
implementation and the app and Claude Code cannot drift apart.

It also inherits none of the old chat route's bug class. There is no serverless deadline, no
streaming wire format and no message history to reconstruct — so the orphaned
`tool_use`/`tool_result` 400s, the fabricated "I ran out of time" message and the Continue
button do not exist rather than being ported. Those were artifacts of running a tool loop
inside a 90-second Lambda, not of the tools.

**Laptop/desktop only.** claude.ai and the mobile app can only reach *remote* MCP servers over
HTTPS; a stdio server is invisible to them. The web app remains the phone client — phone for
logging, laptop for thinking.
