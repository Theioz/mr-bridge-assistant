# Operations

How the running deployment is built, updated, scheduled and backed up. Topology and the reasons behind it are in [ARCHITECTURE.md](ARCHITECTURE.md#deployment); secrets and rotation are in [SECURITY.md](SECURITY.md).

The compose files, reverse-proxy config and crontab that implement this live in a private deployment repository. This page states what they do so that this repo's code and docs can be read without it. Paths below are the deployment's own; `<your-domain>` stands for its domain.

## Pieces

| Piece | Container | Notes |
|---|---|---|
| App | `mr-bridge` | Built on the server from a git clone of this repo (`web/Dockerfile`, Next.js standalone). The image is not published |
| Postgres | `supabase-db` | Supabase's Postgres 17 image. Published on loopback only |
| Auth | `supabase-auth` | GoTrue. Sign-up disabled; SMTP is used for password reset only |
| REST | `supabase-rest` | PostgREST, schema `public` |
| Gateway | `supabase-gateway` | A small Caddy that routes `/auth/v1` and `/rest/v1`. The app reaches it by container name on a shared Docker network |
| Model | `ollama` | Local fallback for food identification. Reached by container name on a shared Docker network; no LAN port |

## Env files and who reads them

There is no single env file. Each process reads its own, and a variable changed in one is not changed in the others.

| File | On | Read by |
|---|---|---|
| `~/docker/mr-bridge/.env` | server | The app container (`env_file`) and the compose build args (`NEXT_PUBLIC_*`) |
| `<clone>/.env` (repo root of the server's clone) | server | The host Python jobs, `scripts/run-syncs.py`, `scripts/notify.sh`, through `scripts/_supabase.py` |
| `~/.mrb-secrets/cron.env` | server | The two `curl` cron lines that call `/api/cron/*`, for `CRON_SECRET` |
| `~/docker/supabase/.env` | server | The Supabase stack: `POSTGRES_PASSWORD`, `JWT_SECRET`, `SITE_URL`, `SUPABASE_PUBLIC_URL`, `SMTP_*` |
| `~/.mrb-secrets/env` | each laptop | The MCP server, through `web/mcp/run.sh` (`MRB_ENV_FILE` overrides the path) |
| `web/.env.local` | dev machine | `npm run dev` and Playwright |

Templates: [`.env.example`](../.env.example) for the root `.env` and the MCP file, [`web/.env.local.example`](../web/.env.local.example) for local development. `node scripts/check-docs.mjs` fails when code reads a variable neither template documents, or a template documents one no code reads.

Three variables that are easy to get wrong:

| Variable | Rule |
|---|---|
| `NEXT_PUBLIC_*` | Inlined into the client bundle at **build** time. Changing one needs a rebuild, not a restart |
| `SUPABASE_URL` | Read only by the Python scripts and the MCP server. On a laptop it is `https://supabase.<your-domain>`. On the server, each cron entry sets `SUPABASE_URL=http://localhost:8000` inline, which wins over the file (`load_dotenv` does not override an existing variable) |
| `SUPABASE_INTERNAL_URL` | Set in the app container only (`http://supabase-gateway:8000`). The browser uses `NEXT_PUBLIC_SUPABASE_URL`. See [ARCHITECTURE.md](ARCHITECTURE.md#why-the-browser-and-the-server-use-different-supabase-urls) |

## Deploying an app change

The app is baked into the image, so a deploy is a rebuild. On the server:

```bash
cd ~/src/mr-bridge-assistant && git fetch -q && git checkout main && git pull
cd ~/docker/mr-bridge && docker compose build mr-bridge && docker compose up -d --force-recreate mr-bridge
docker inspect --format '{{.Created}}' mr-bridge:local   # must be later than the merge
```

- Pull in the **source clone**, not in `~/docker/mr-bridge`. That directory is not a git repository; the build context is the clone. A build against an unpulled clone hits the cache on every layer and reports success.
- `--force-recreate` is required after an env change too: `docker compose restart` does not reload `.env`.
- If the change includes a migration, apply it first (next section).

The host Python jobs run from the same clone, in a virtualenv:

```bash
cd ~/src/mr-bridge-assistant && python3 -m venv .venv && .venv/bin/pip install -r scripts/requirements.txt
./.venv/bin/python scripts/run-syncs.py --force
```

Use `./.venv/bin/python` on the server: the scripts import `python-dotenv` and `supabase`, which the system interpreter does not have.

## Applying a migration

Nothing applies migrations automatically. Apply each new file in `supabase/migrations/` by hand, **before** rebuilding an app that depends on it, then tell PostgREST to reload its schema cache.

```bash
cd ~/src/mr-bridge-assistant
docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/<file>.sql
docker exec supabase-db psql -U postgres -d postgres -c "NOTIFY pgrst, 'reload schema'"
```

- Without the reload, PostgREST keeps serving the old schema and a new table or column returns an error through the API while working in `psql`.
- `postgres` is not the superuser in the Supabase image; `supabase_admin` is. Use `-U supabase_admin` when a migration alters an object that role owns or creates an event trigger. `select tableowner from pg_tables where tablename = '<table>'` shows the owner.
- A new table in `public` starts with row-level security on and no policy (an event trigger does this), so it returns no rows to the app until the migration adds a policy. See [ARCHITECTURE.md](ARCHITECTURE.md#rls-pattern).
- List what the pull request applies in its description; the PR template has a line for it.

## Schedule

All times are UTC and fixed, so local times shift by an hour with daylight saving. The host crontab is the source; `web/src/lib/status/jobs.json` is the in-repo registry that **Settings → Status** and `scripts/check_stale_signals.py` read.

| When (UTC) | What | Runs |
|---|---|---|
| 14:00 daily | Sync Oura, Google Health, Plex, stocks, sports; purge notifications older than 30 days | `GET /api/cron/sync` |
| 14:30 daily | Morning summary push: weather, recovery, today's workout, planned meals, due tasks | `scripts/check_morning_summary.py` |
| 00:00 and 16:00 daily | Task due and overdue reminders, deduplicated per task for 24 h | `scripts/check_task_due_alerts.py` |
| 02:00 daily | Journal reminder, only if nothing was journaled today | `scripts/check_journal_reminder.py` |
| 15:00 daily | Birthday reminders from Google Calendar | `scripts/check_birthday_notif.py` |
| 06:00 daily | Create the next occurrences of recurring tasks | `scripts/spawn_task_occurrences.py` |
| 06:30 daily | Delete tasks completed more than 90 days ago | `scripts/purge_completed_tasks.py` |
| every 6 h | Fail a heartbeat when a job or data source has gone stale | `scripts/check_stale_signals.py` |
| Sun, Tue, Thu 03:00; Mon 01:00 | Coach nudges: missed session, weekly planning | `scripts/coach_check.py` |
| Mon 15:00 | Recipe-library audit; pushes only when findings changed | `GET /api/cron/audit-recipes` |
| Mon 16:00 | Warn about recurring series about to run out | `scripts/check_series_expiring.py` |
| Mon to Fri 10:30; hourly 12:30 to 17:30 | Job Scout: collect postings, then ingest the ranking agent's decisions | `scripts/job_scout.py collect` / `ingest` |
| 03:30 daily | Database dump | the Supabase stack's backup script (deployment repo) |
| Mon 04:00 | Weekly review nudge | GitHub Actions, `.github/workflows/weekly-review-nudge.yml` |

Rules:

- Every job in `jobs.json` writes a heartbeat row to `sync_log`. When you schedule a job, add it there or Status cannot see it. Job Scout is the exception: it is scheduled but not in `jobs.json` and writes no `sync_log` row; its failures surface only through the host's cron heartbeat.
- Alerting is external. Each cron entry runs under a heartbeat wrapper that reports to an uptime monitor; `check_stale_signals.py` covers what that cannot see (a source going stale inside a successful sync run) by exiting 10 with the reason.
- The two `/api/cron/*` calls and `/api/internal/*` authenticate with `Authorization: Bearer $CRON_SECRET` and are called on `http://127.0.0.1:3000`. The private hostname does not route from the server itself.

### Notification senders

| Sender | ntfy push | Row in `notifications` |
|---|---|---|
| `scripts/_push.py` (all Python jobs; `scripts/notify.sh` wraps it) | yes | yes |
| `/api/cron/audit-recipes` | yes | yes, written by the route itself |
| GitHub Actions weekly review nudge | yes | no |

Every `_push.py` send appends a line to `~/.mr-bridge/notify.log` on the machine that sent it: title, type, click URL and HTTP status, never the topic. Device setup is in [notifications-setup.md](notifications-setup.md).

## Weekly plan

`/weekly-plan` is a Claude Code command, not a scheduled job. Claude writes the plan; `scripts/weekly_plan.py` supplies the context, enforces the structural rules and submits through `/api/internal/plan`. Run it on the server with `INTERNAL_APP_URL=http://localhost:3000`. Procedure: `.claude/commands/weekly-plan.md`.

## MCP server on a laptop

```bash
mkdir -p ~/.mrb-secrets && chmod 700 ~/.mrb-secrets
# write the variables from .env.example into ~/.mrb-secrets/env, then:
chmod 600 ~/.mrb-secrets/env
```

`.mcp.json` launches `web/mcp/run.sh`, which exports that file's `KEY=VALUE` lines and starts `web/mcp/server.ts`. It needs `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `OWNER_USER_ID`, plus the variables the tools you call depend on. The file sits outside the repo on purpose: it holds the service-role key.

## Backups

Self-hosting means there is no managed point-in-time recovery. Backups are the operator's job.

- **Settings → Data export is not a backup.** It leaves out `user_integrations` (the encrypted OAuth tokens), so it cannot restore an account.
- Dump **both** the `public` and `auth` schemas. Every table has a foreign key to `auth.users(id)`, and `OWNER_USER_ID` is a literal UUID in the env files; a restore that changes user ids breaks everything.
- Keep `ENCRYPTION_KEY` with the dump but not in it. A restore with the wrong key produces a healthy-looking database in which every integration fails. Prove the key decrypts a real `user_integrations` row before trusting a restore.
- The dump must be copied off the server to count.

- The dump holds health data and the auth schema, so encrypt it before it leaves the server.

In this deployment a nightly `pg_dump` runs at 03:30 UTC from the Supabase stack's backup script. The dump is encrypted with `age` to a public recipient before it is written to network storage, and the script refuses to write a plaintext dump when `age` or the recipient is missing. The server holds only the public recipient, so it cannot read its own backups: **a restore starts with a decrypt on the machine that holds the private key**, then loads the decrypted dump. The script, retention and restore drill are in the deployment repo.
