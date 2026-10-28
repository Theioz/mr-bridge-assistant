# Security

Mr. Bridge is single-user and self-hosted on compute-core (#476). This page covers where secrets
live, what is reachable from where, and how to rotate each credential.

## Secrets: where they live

- **Vaultwarden** is canonical — Secure Note `mr-bridge-env`. Nothing secret is ever committed;
  the repo carries only `.env.example` / `web/.env.local.example` with `<placeholder>` values.
- On the node: `~/docker/mr-bridge/.env` (the app container's `env_file`), mode 0600.
- For the MCP server: `~/.mrb-secrets/env`, mode 0600, read by `web/mcp/run.sh` — **deliberately
  outside the repo tree**. A service-role key inside a repo that gets `git add -A` is one typo from
  publication.

(Historically these were Vercel env vars with the Sensitive flag. That flag made them
**write-only** — `vercel env pull` returned them empty — so Vercel was never a usable source of
truth for recovery. Vercel is gone (#514).)

Public-by-design values (they reach the browser, so they must never hold a secret):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `APP_URL`, `SHARE_BASE_URL`
- `USER_TIMEZONE`

## What never goes in environment variables

User OAuth refresh tokens — Google (Calendar), Google Health and Oura — are stored **encrypted** in
the `user_integrations` table using `pgp_sym_encrypt` keyed by `ENCRYPTION_KEY`. They are never
placed in env vars. See `web/src/lib/integrations/tokens.ts` and
[ARCHITECTURE.md → OAuth Token Encryption](ARCHITECTURE.md#oauth-token-encryption).

## Access control

The primary control is **network reach**, not application auth:

| Surface | Reach |
|---|---|
| `mr-bridge.jl-infra-lab.com` | **tailnet only.** Health data is never publicly routable. |
| `supabase.jl-infra-lab.com` | **tailnet only.** |
| `share.jl-infra-lab.com` | **The only public surface.** Caddy default-deny path allowlist: only token-gated `/share/*` is served. The dashboard, meals, journal, fitness, settings and the whole API return **404** from the internet. |

Two things worth knowing about that public surface:

- The `/share/*` pages render with the **service-role client** (they must, to resolve a share
  token without a session). They are token-gated, but they are internet-facing, so treat any
  change to them as security-relevant.
- Each new public hostname is an ADR-level decision in the homelab repo (ADR 0010). The tunnel
  is not a free re-entry point.

Inside the database, `anon` holds no privileges in `public`, every public table has RLS on, and
`authenticated` holds only SELECT/INSERT/UPDATE/DELETE — see
[ARCHITECTURE.md → RLS Pattern](ARCHITECTURE.md#rls-pattern).

## Keys and their blast radius

| Key | Blast radius if stale/leaked |
|---|---|
| `ENCRYPTION_KEY` | **The big one.** Decrypts the Google / Google Health / Oura refresh tokens in `user_integrations`. If lost, every integration must be re-authorised by hand. Runbook: [rotate-encryption-key.md](runbooks/rotate-encryption-key.md). |
| `SUPABASE_SERVICE_ROLE_KEY` | Full RLS bypass. Self-hosted, it is a JWT signed with the stack's `JWT_SECRET`; re-minting it with jl-homelab `docker/supabase/gen-keys.sh` also changes the anon key and invalidates every session. Runbook: [rotate-service-role-key.md](runbooks/rotate-service-role-key.md). |
| `CRON_SECRET` | Lets a caller trigger `/api/cron/*`. |
| `GOOGLE_CLIENT_SECRET` | OAuth client impersonation. Covers both the `google` and `google_health` consents — same client. |
| `OURA_CLIENT_SECRET` | Oura OAuth client impersonation; the Oura sync cannot refresh its token without it. |
| `NTFY_TOPIC` | Anyone who knows the topic can read (and send) notifications. It is the only secret ntfy has. |
| `FDC_API_KEY`, `POLYGON_API_KEY`, `TMDB_API_KEY`, `IGDB_CLIENT_SECRET`, `GOOGLE_BOOKS_API_KEY`, `PLEX_TOKEN` | Low to moderate: third-party data keys. `PLEX_TOKEN` grants access to the Plex server, so treat it as the most sensitive of these. |

| `ANTHROPIC_API_KEY` | Optional. Spends the Anthropic account's API credit; used only by the nutrition model client (food photos, labels, text parsing, USDA picks). Set a monthly spend limit on the key's workspace. |

**No `GROQ_API_KEY`** — removed (#476). `ANTHROPIC_API_KEY` was removed in #609–#611 and reintroduced, scoped to the nutrition client only, in 2026-10.

## Rotation cadence

| Trigger | Action |
|---------|--------|
| Post-incident (any credential exposure) | Rotate immediately, priority-ordered by blast radius |
| Annually | Review all credentials; rotate `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_SECRET`, `OURA_CLIENT_SECRET` |

## Rotation priority order

Rotate highest blast radius first. After each rotation, verify the listed signal before continuing.

1. **`SUPABASE_SERVICE_ROLE_KEY`** (and with it the anon key — both are minted from `JWT_SECRET`)
   — bypasses RLS; all data at risk. Verify: `python3 scripts/run-syncs.py --force` on compute-core
   succeeds, and sign-in works from a fresh browser.
2. **`GOOGLE_CLIENT_SECRET`** — breaks token refresh for both the `google` and `google_health`
   integrations. Verify: Settings → Integrations → Sync Now for Google Health succeeds, and the
   dashboard schedule loads.
3. **`OURA_CLIENT_SECRET`** — Verify: Settings → Integrations → Sync Now for Oura succeeds.
4. **`CRON_SECRET`** — cron endpoints return 401 until every caller has the new value (the app's
   env file and the root `.env` that `scripts/run-syncs.py` reads). Verify:
   `curl -H "Authorization: Bearer $NEW_SECRET" http://127.0.0.1:3000/api/cron/sync` on
   compute-core returns 200.
5. **`NTFY_TOPIC`** — pick a new topic, resubscribe each device. Verify:
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
5. **Document** — file a rotation log under `docs/runbooks/secret-rotation-YYYY-MM.md`, using [secret-rotation-2026-04.md](runbooks/secret-rotation-2026-04.md) as the template for its structure (its content describes the Vercel-era system).

## PR checklist

Every PR that adds or modifies env vars must complete the security checklist in `.github/PULL_REQUEST_TEMPLATE.md`. The checklist is non-optional — do not merge if any box is unchecked.

## Rotation log index

| Date | PR | Notes |
|------|----|-------|
| 2026-04-22 | [#368](https://github.com/Theioz/mr-bridge-assistant/issues/368) | Post-Vercel April 2026 incident; all secrets rotated; Monarch/TheSportsDB keys deleted |
