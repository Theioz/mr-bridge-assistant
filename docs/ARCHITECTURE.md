# Architecture

This document captures Mr. Bridge's architectural intent: why decisions were made and where the system is heading. It is not a setup guide (see [README.md](../README.md)) or an API reference — it is the record of design choices that are not visible from code alone.

For a live map of code relationships, see [graphify-out/GRAPH_REPORT.md](../graphify-out/GRAPH_REPORT.md).

---

## Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | Next.js 16 App Router | Deployed on Vercel; SSR + RSC; `web/` subdirectory |
| Database | Supabase Postgres | RLS enforced; pgcrypto for token encryption |
| AI | Anthropic Claude API (AI SDK v4) | Sonnet/Haiku routing; Opus not in hot path |
| Auth | Supabase Auth | JWT; SSR cookie-based via `@supabase/ssr` |
| Hosting / Cron | Vercel | Daily sync cron at 06:00 PST via `vercel.json` |
| External APIs | Google Calendar, Gmail, Oura, Fitbit, Polygon.io, Open-Meteo, ntfy.sh, TheSportsDB | All server-side; credentials never reach the browser |

---

## Schema — grouped by domain

All tables with a `user_id` column enforce Row Level Security (see [RLS Pattern](#rls-pattern) below). 27 tables total are user-scoped; `sync_log` is the single exception.

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
| `sports_cache` | Sports scores/schedules from TheSportsDB/ESPN; refreshed on-demand |
| `timer_state` | Single-row upsert: active study timer state |

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

## Prompt-Caching Architecture

`POST /api/chat/route.ts` places two Anthropic cache breakpoints in every request:

1. **System prompt breakpoint** — at the end of the system prompt block, using `cache_control: { type: "ephemeral", ttl: "1h" }`.
2. **Trailing tool breakpoint** — a synthetic tool result appended to the message array via `withTrailingCacheBreakpoint()`, also `ttl: "1h"`. This ensures the full conversation context up to the trailing message is cached even when the system prompt hasn't changed.

**Why 1-hour TTL:** The Anthropic default is 5 minutes. On an active session, a 5-minute TTL causes 10–30 cache re-writes per hour at $3.75/MTok each. Switching to 1-hour TTL reduces that to 1 re-write/hr at $6/MTok — roughly 60–80% reduction in cache-write cost on active days.

**Model routing (`selectModel`):**

| Tier | Model | Criteria |
|------|-------|---------|
| Simple reads | Claude Haiku | 34 recognized read-only intent patterns (habits, calendar lookup, recovery, body stats, stocks, sports, streaks) |
| Default | Claude Sonnet | All mutations, complex queries, anything not matched above |
| Planning / Opus | Not in hot path | Available for session planning commands only |

Mutations (`assign_workout`, `create_calendar_event`, `reschedule_workout`, etc.) are never routed to Haiku regardless of phrasing — they have no simple-pattern match and fall through to Sonnet.

---

## Verified-Success Contract

All state-mutating chat tools return a typed result shape:

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
