# Security

Mr. Bridge is single-user and self-hosted. This page covers where secrets live, what is reachable
from where, how sign-in works, and how to rotate each credential.

## Secrets: where they live

Nothing secret is committed. The repo carries only `.env.example` and `web/.env.local.example`,
with `<placeholder>` values. Names only below; which process reads which file is in
[OPERATIONS.md](OPERATIONS.md#env-files-and-who-reads-them).

| Place | Holds |
|---|---|
| Password vault (Vaultwarden), Secure Note `mr-bridge-env` | The canonical copy of the app's variables. It can drift from the live files; compare names before relying on it for a restore |
| `~/docker/mr-bridge/.env` on the server, mode 0600 | Everything the app container reads |
| The server clone's root `.env` | What the host Python jobs read, including `SUPABASE_SERVICE_ROLE_KEY`, `ENCRYPTION_KEY`, `CRON_SECRET` and `NTFY_TOPIC` |
| `~/.mrb-secrets/cron.env` on the server | `CRON_SECRET`, for the cron lines that call the app |
| `~/docker/supabase/.env` on the server | `POSTGRES_PASSWORD`, `JWT_SECRET`, `SMTP_PASS` and the other `SMTP_*` values |
| `~/.mrb-secrets/env` on each laptop that runs the MCP server, mode 0600 | The service-role key and the other variables the tools need. **Deliberately outside the repo tree**: a service-role key inside a repo that gets `git add -A` is one typo from publication |
| GitHub Actions secrets | `NTFY_TOPIC` and `APP_URL` (weekly review nudge); the smoke-test account and Supabase values if the smoke workflow is enabled |
| `~/.mrb-android/` on each build machine | The Android release keystore and `keystore.properties` ([android/README.md](../android/README.md#the-signing-key)) |

Not secret:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL`: inlined into
  the client bundle at build time, so they reach every browser. They must never hold a secret.
- `APP_URL`, `SHARE_BASE_URL`, `USER_TIMEZONE`: server-side configuration with no secret value.

## What never goes in environment variables

User OAuth refresh tokens — Google (Calendar), Google Health and Oura — are stored **encrypted** in
the `user_integrations` table using `pgp_sym_encrypt` keyed by `ENCRYPTION_KEY`. They are never
placed in env vars. See `web/src/lib/integrations/tokens.ts` and
[ARCHITECTURE.md → OAuth Token Encryption](ARCHITECTURE.md#oauth-token-encryption).

## Access control

The primary control is **network reach**, not application auth:

| Surface | Reach |
|---|---|
| `mr-bridge.<your-domain>` | **tailnet only.** Health data is never publicly routable. |
| `supabase.<your-domain>` | **tailnet only.** |
| `share.<your-domain>` | **The only public surface.** Default-deny, enforced twice. The reverse proxy passes only `GET`/`HEAD` for token-gated `/share/*` and a short list of static assets named exactly (`/_next/static/*`, the icons, `/manifest.json`); the app then applies the same scope itself (`web/src/lib/share-host.ts`, called first thing in `src/proxy.ts`). The dashboard, meals, journal, fitness, settings and the whole API return **404** from the internet. Share pages send `noindex`. |

Two things worth knowing about that public surface:

- The `/share/*` pages render with the **service-role client** (they must, to resolve a share
  token without a session). They are token-gated, but they are internet-facing, so treat any
  change to them as security-relevant.
- A new public hostname is a deliberate, recorded decision, never a side effect of another
  change.

Inside the database, `anon` holds no privileges in `public`, every public table has RLS on, and
`authenticated` holds only SELECT/INSERT/UPDATE/DELETE — see
[ARCHITECTURE.md → RLS Pattern](ARCHITECTURE.md#rls-pattern).

## Auth model

- **Sign-in is GoTrue email and password.** Sign-up is disabled at GoTrue
  (`GOTRUE_DISABLE_SIGNUP`), so the only account is the owner's. There is no OAuth sign-in; the
  Google and Oura OAuth flows connect data sources to an already signed-in user.
- **Password reset is by email.** SMTP is configured for the reset link and nothing else.
- **The session is an SSR cookie** with a pinned name (`web/src/lib/supabase/urls.ts`).
  `web/src/proxy.ts` redirects any request without a session to `/login`, except the share pages.
- **Signed-in requests run as `authenticated`** under row-level security. Server paths that use
  the service-role client bypass it; they are listed in
  [ARCHITECTURE.md](ARCHITECTURE.md#two-supabase-clients).
- **Machine callers use `CRON_SECRET`** as a bearer token, for `/api/cron/*` and `/api/internal/*`.
- **The MCP server holds the service-role key** on every laptop that runs it, and acts as
  `OWNER_USER_ID`. Anyone with that laptop's `~/.mrb-secrets/env` has the whole database.
- **Share links are bearer tokens in the URL.** Whoever has the link can read that item or library
  until the token is revoked.

## Keys and their blast radius

| Key | Blast radius if stale/leaked |
|---|---|
| `ENCRYPTION_KEY` | **The big one.** Decrypts the Google / Google Health / Oura refresh tokens in `user_integrations`. If lost, every integration must be re-authorised by hand. Runbook: [rotate-encryption-key.md](runbooks/rotate-encryption-key.md). |
| `JWT_SECRET` (Supabase stack) | **Highest.** Signs the anon and service-role keys and every session JWT. Whoever holds it can mint a service-role key. Changing it invalidates both keys and every session. |
| `POSTGRES_PASSWORD` (Supabase stack) | Direct database access as the roles GoTrue and PostgREST connect with, below row-level security entirely. Postgres is published on the server's loopback only. |
| `SUPABASE_SERVICE_ROLE_KEY` | Full RLS bypass. It is a JWT signed with the stack's `JWT_SECRET`; re-minting it (the deployment's key-generation script) also changes the anon key and invalidates every session. Runbook: [rotate-service-role-key.md](runbooks/rotate-service-role-key.md). |
| `CRON_SECRET` | Lets a caller trigger `/api/cron/*` **and** `/api/internal/*`. The internal routes run on the service-role client as the owner: `/api/internal/plan` reads the planning context (profile, equipment, recent sets, recovery, meals, habits) and writes `workout_plans`; `/api/internal/resolve-recipe-macros` rewrites recipe macros. On the public share host these paths return 404. |
| `GOOGLE_CLIENT_SECRET` | OAuth client impersonation. Covers both the `google` and `google_health` consents — same client. |
| `OURA_CLIENT_SECRET` | Oura OAuth client impersonation; the Oura sync cannot refresh its token without it. |
| `NTFY_TOPIC` | Anyone who knows the topic can read (and send) notifications. It is the only secret ntfy has. |
| `FDC_API_KEY`, `POLYGON_API_KEY`, `TMDB_API_KEY`, `IGDB_CLIENT_SECRET`, `GOOGLE_BOOKS_API_KEY`, `PLEX_TOKEN` | Low to moderate: third-party data keys. `PLEX_TOKEN` grants access to the Plex server, so treat it as the most sensitive of these. |
| `SMTP_PASS` (Supabase stack) | Sends mail as the configured mailbox; used for password-reset mail. |
| Android release keystore | Signs the APK. If lost, an update cannot be installed over the existing app without wiping its data; if leaked, someone else can sign an update. |
| `ANTHROPIC_API_KEY` | Optional. Spends the Anthropic account's API credit; used only by the nutrition model client (food photos, labels, text parsing, USDA picks). Set a monthly spend limit on the key's workspace. |

There is no `GROQ_API_KEY`. `ANTHROPIC_API_KEY` is read only by the nutrition model client (`web/src/lib/nutrition/llm-anthropic.ts`).

## Rotation cadence

| Trigger | Action |
|---------|--------|
| Post-incident (any credential exposure) | Rotate immediately, priority-ordered by blast radius |
| Annually | Review all credentials; rotate `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_SECRET`, `OURA_CLIENT_SECRET` |

## Rotation priority order

Rotate highest blast radius first. After each rotation, verify the listed signal before continuing.

1. **`SUPABASE_SERVICE_ROLE_KEY`** (and with it the anon key — both are minted from `JWT_SECRET`)
   — bypasses RLS; all data at risk. Verify: `./.venv/bin/python scripts/run-syncs.py --force` in the
   server's clone succeeds, and sign-in works from a fresh browser.
2. **`GOOGLE_CLIENT_SECRET`** — breaks token refresh for both the `google` and `google_health`
   integrations. Verify: Settings → Integrations → Sync Now for Google Health succeeds, and the
   dashboard schedule loads.
3. **`OURA_CLIENT_SECRET`** — Verify: Settings → Integrations → Sync Now for Oura succeeds.
4. **`CRON_SECRET`** — cron endpoints return 401 until every caller has the new value: the app's
   env file, the clone's root `.env` that `scripts/run-syncs.py` and `scripts/weekly_plan.py`
   read, and `~/.mrb-secrets/cron.env` that the crontab sources. Verify:
   `curl -H "Authorization: Bearer $NEW_SECRET" http://127.0.0.1:3000/api/cron/sync` on
   the server returns 200.
5. **`NTFY_TOPIC`** — pick a new topic, update it in the app's env file, the clone's root
   `.env` and the GitHub Actions secret, then resubscribe each device. Verify:
   `bash scripts/notify.sh --message "test"`.
6. Third-party data keys — rotate in the respective consoles.

**Do not rotate `ENCRYPTION_KEY`** without a re-encryption migration. See
[runbooks/rotate-encryption-key.md](runbooks/rotate-encryption-key.md) for the full procedure.

After changing the node's env file, recreate the container: `docker compose up -d --force-recreate`
(a plain `restart` does not reload `.env`).

## Key rotation runbooks

| Secret | Runbook |
|--------|---------|
| ENCRYPTION_KEY | [runbooks/rotate-encryption-key.md](runbooks/rotate-encryption-key.md) |
| SUPABASE_SERVICE_ROLE_KEY | [runbooks/rotate-service-role-key.md](runbooks/rotate-service-role-key.md) |

## Breach response

1. **Freeze** — immediately revoke or rotate the exposed credential in the issuing console. If a service-role key is exposed, also verify RLS policies are intact.
2. **Rotate** — follow the priority order above. Update Vaultwarden and the node's env file; `docker compose up -d --force-recreate`.
3. **Verify** — confirm all API routes return expected status codes. Tail `docker logs mr-bridge` for 10 minutes after the recreate.
4. **Communicate** — if any user-facing integration (e.g., Google OAuth) is broken, surface a notice in Settings → Integrations and add a CHANGELOG entry. No secret values in any communication.
5. **Document** — file a rotation log under `docs/runbooks/secret-rotation-YYYY-MM.md`, using [history/secret-rotation-2026-04.md](history/secret-rotation-2026-04.md) as the template for its structure (its content describes an earlier hosting setup), and add a row to the index below.

## PR checklist

Every PR that adds or modifies env vars must complete the security checklist in `.github/PULL_REQUEST_TEMPLATE.md`. The checklist is non-optional — do not merge if any box is unchecked.

## Rotation log index

| Date | PR | Notes |
|------|----|-------|
| 2026-04-22 | [#368](https://github.com/Theioz/mr-bridge-assistant/issues/368) | After a hosting-provider security incident: all secrets rotated; Monarch and TheSportsDB keys deleted. Log: [history/secret-rotation-2026-04.md](history/secret-rotation-2026-04.md) |
