# Runbook: Rotate SUPABASE_SERVICE_ROLE_KEY

**Risk level:** MEDIUM — the key bypasses RLS and grants full database access. No data migration is
required, but every consumer must get the new value at the same time, and on self-hosted Supabase
the rotation also replaces the anon key and signs every user out.

**Why it is coupled to the anon key:** self-hosted GoTrue and PostgREST verify **legacy JWTs**
signed with the stack's `JWT_SECRET`. The service-role key and the anon key are both JWTs minted from
that secret. Invalidating a leaked service-role key means changing `JWT_SECRET`, which invalidates
the anon key and all existing sessions with it. (Supabase Cloud's dashboard "Reset" button does not
exist here.)

**Who uses the key:** any server code that calls `createServiceClient()` from
`web/src/lib/supabase/service.ts`, the Python scripts (`scripts/_supabase.py`), and the MCP server
(`web/mcp/server.ts`). See [ARCHITECTURE.md → Two Supabase clients](../ARCHITECTURE.md#two-supabase-clients).

---

## Prerequisites

- Shell on compute-core and a current jl-homelab checkout there (`docker/supabase/`)
- Vaultwarden access (Secure Note `mr-bridge-env`)
- A few minutes of downtime: between steps 2 and 4 the app cannot talk to Supabase

---

## Step 1 — Mint new keys

In jl-homelab `docker/supabase/`:

```bash
./gen-keys.sh     # prints JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY
```

Keep the three values for the next steps. Never commit them.

---

## Step 2 — Update the Supabase stack

Put the new `JWT_SECRET` (and the keys, wherever that stack's `.env` holds them) into the
Supabase stack's env file on compute-core, then recreate its containers so GoTrue and PostgREST
pick up the new secret:

```bash
docker compose up -d --force-recreate
```

`docker compose restart` does **not** reload `.env`.

---

## Step 3 — Update every consumer

| Where | Variables |
|---|---|
| Vaultwarden `mr-bridge-env` (canonical) | `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `~/docker/mr-bridge/.env` (app container) | same |
| Root `.env` of the repo checkout on compute-core (Python scripts, cron jobs) | `SUPABASE_SERVICE_ROLE_KEY` (and `SUPABASE_ANON_KEY`, which `.env.example` lists) |
| `~/.mrb-secrets/env` on every machine that runs the MCP server | `SUPABASE_SERVICE_ROLE_KEY` |
| `web/.env.local` on any dev machine | `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SMOKE_SUPABASE_SERVICE_KEY` |
| GitHub Actions secrets, if set (`SMOKE_SUPABASE_SERVICE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) | used by the dispatch-only smoke workflow |

---

## Step 4 — Recreate the app

The anon key is baked into the browser bundle at build time (`NEXT_PUBLIC_*`), so rebuild the
image, then recreate the container:

```bash
docker compose build && docker compose up -d --force-recreate
```

---

## Step 5 — Verify

- [ ] Sign in from a fresh browser (every old session is now invalid)
- [ ] `python3 scripts/run-syncs.py --force` on compute-core succeeds and rows land in `sync_log`
- [ ] Settings → Integrations → Sync Now for an integration succeeds
- [ ] Settings → Status shows fresh heartbeats after the next scheduled jobs
- [ ] An MCP tool call from Claude Code succeeds (e.g. a read such as listing tasks)
- [ ] `docker logs mr-bridge` shows no `Invalid API key` / `JWT` errors for 10 minutes

---

## Rollback

Restore the previous `JWT_SECRET` and keys from Vaultwarden's item history into the Supabase stack
and every consumer, then recreate both stacks. If the old key was leaked, this is not an option —
mint a fresh set and repeat from Step 1.

---

## After completion

- Discard the old values from any clipboard or local note
- Log this rotation in `docs/SECURITY.md` under the Rotation log index
