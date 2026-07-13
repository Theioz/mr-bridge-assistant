# Security

## Sensitive-flag rule

Every secret lives in **Vaultwarden** (Secure Note `mr-bridge-env`) and, at runtime, in a mode-0600 env file on the node — never in the repo tree. (Historically these were Vercel env vars with the Sensitive flag; that flag made them **write-only**, which is worth remembering: `vercel env pull` returns them EMPTY, so Vercel was never a usable source of truth for recovery.)

Public-by-design variables (the only ones that may omit the flag):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_DEMO_EMAIL`
- `NEXT_PUBLIC_DEMO_PASSWORD`
- `APP_URL`
- `USER_TIMEZONE`

## What never goes in environment variables

User OAuth tokens — Google (Calendar, Gmail, Fit), Fitbit refresh tokens, and Oura PATs — are stored **encrypted** in the `user_integrations` Supabase table using `pgp_sym_encrypt` keyed by `ENCRYPTION_KEY`. They are never placed in env vars. See `web/src/lib/integrations/tokens.ts`.

## Rotation cadence

| Trigger | Action |
|---------|--------|
| Post-incident (any credential exposure) | Rotate immediately, priority-ordered by blast radius |
| Annually | Review all credentials; rotate SUPABASE_SERVICE_ROLE_KEY, GOOGLE_CLIENT_SECRET, FITBIT_CLIENT_SECRET |

## Rotation priority order

Rotate highest blast radius first. After each rotation, verify the listed signal before continuing.

1. **SUPABASE_SERVICE_ROLE_KEY** — bypasses RLS; all data at risk. Verify: `/api/cron/sync` returns 200.
4. **SUPABASE_ANON_KEY** — auth + client queries break. Verify: sign in from a fresh browser.
5. **GOOGLE_CLIENT_SECRET** — existing users must re-OAuth. Surface a notice in Settings. Verify: disconnect/reconnect Google in Settings → Integrations.
6. **FITBIT_CLIENT_SECRET** — new OAuth flows + token refresh break; existing stored tokens survive. Verify: Sync Now for Fitbit returns 200.
7. **CRON_SECRET** — cron endpoints return 401. Verify: `curl -H "Authorization: Bearer $NEW_SECRET" /api/cron/sync` returns 200.
8. Third-party API keys (POLYGON_API_KEY, etc.) — rotate in respective consoles.

**Do not rotate ENCRYPTION_KEY** without a re-encryption migration. See [docs/runbooks/rotate-encryption-key.md](runbooks/rotate-encryption-key.md) for the full procedure.

## Key rotation runbooks

| Secret | Runbook |
|--------|---------|
| ENCRYPTION_KEY | [runbooks/rotate-encryption-key.md](runbooks/rotate-encryption-key.md) |
| SUPABASE_SERVICE_ROLE_KEY | [runbooks/rotate-service-role-key.md](runbooks/rotate-service-role-key.md) |

## Breach response

1. **Freeze** — immediately revoke or rotate the exposed credential in the issuing console. If a service-role key is exposed, also verify Supabase RLS policies are intact.
2. **Rotate** — follow the priority order above. Update the node's env file; `docker compose up -d --force-recreate`.
3. **Verify** — confirm all API routes return expected status codes. Tail `docker logs mr-bridge` for 10 minutes post-deploy.
4. **Communicate** — if any user-facing integration (e.g., Google OAuth) is broken, surface a notice in Settings → Integrations and add a CHANGELOG entry. No secret values in any communication.
5. **Document** — file a rotation log under `docs/runbooks/secret-rotation-YYYY-MM.md` using the template from `docs/runbooks/secret-rotation-2026-04.md`.

## PR checklist

Every PR that adds or modifies env vars must complete the security checklist in `.github/PULL_REQUEST_TEMPLATE.md`. The checklist is non-optional — do not merge if any box is unchecked.

## Rotation log index

| Date | PR | Notes |
|------|----|-------|
| 2026-04-22 | [#368](https://github.com/Theioz/mr-bridge-assistant/issues/368) | Post-Vercel April 2026 incident; all secrets rotated; Monarch/TheSportsDB keys deleted |

## Access control (self-hosted, #476)

The primary control is **network reach**, not application auth:

| Surface | Reach |
|---|---|
| `mr-bridge.jl-infra-lab.com` | **tailnet only.** Health data is never publicly routable. |
| `supabase.jl-infra-lab.com` | **tailnet only.** |
| `share.jl-infra-lab.com` | **The only public surface.** Caddy default-deny path allowlist: only token-gated `/share/*` is served. The dashboard, meals, journal, fitness, settings, admin and the whole API return **404** from the internet. |

Two things worth knowing about that public surface:

- The `/share/*` pages render with the **service-role client** (they must, to resolve a share
  token without a session). They are token-gated, but they are internet-facing, so treat any
  change to them as security-relevant.
- Each new public hostname is an ADR-level decision in the homelab repo (ADR 0010). The tunnel
  is not a free re-entry point.

## Secrets: where they live

- **Vaultwarden** is canonical — Secure Note `mr-bridge-env`.
- On the node: `~/docker/mr-bridge/.env`, mode 0600.
- For the MCP server: `~/.mrb-secrets/env`, mode 0600 — **deliberately outside the repo tree**.
  A service-role key inside a repo that gets `git add -A` is one typo from publication.

## Keys to rotate

| Key | Blast radius if stale/leaked |
|---|---|
| `ENCRYPTION_KEY` | **The big one.** Decrypts the Google/Fitbit/Oura refresh tokens in `user_integrations`. If lost, every integration must be re-authorised by hand. Rotation procedure: `docs/runbooks/rotate-encryption-key.md`. |
| `SUPABASE_SERVICE_ROLE_KEY` | Full RLS bypass. Self-hosted: re-mint with `docker/supabase/gen-keys.sh` (which also changes `JWT_SECRET`, invalidating the anon key and all sessions). |
| `CRON_SECRET` | Lets a caller trigger `/api/cron/*`. |
| `FDC_API_KEY` | Low: a rate-limited public data key. |
| `GOOGLE_CLIENT_SECRET` / `FITBIT_CLIENT_SECRET` | OAuth client impersonation. |

**No `ANTHROPIC_API_KEY` and no `GROQ_API_KEY`** — both removed in #476.
