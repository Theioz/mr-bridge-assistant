# Security

## Sensitive-flag rule

Every environment variable that is not intentionally public **must** have the Sensitive flag enabled in the Vercel dashboard. Sensitive variables are redacted in build logs and not accessible via the Vercel API. There are no exceptions.

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
| Post-incident (any credential exposure or Vercel incident) | Rotate immediately, priority-ordered by blast radius |
| Quarterly (every 3 months) | Rotate ANTHROPIC_API_KEY, GROQ_API_KEY, CRON_SECRET, third-party API keys |
| Annually | Review all credentials; rotate SUPABASE_SERVICE_ROLE_KEY, GOOGLE_CLIENT_SECRET, FITBIT_CLIENT_SECRET |

## Rotation priority order

Rotate highest blast radius first. After each rotation, verify the listed signal before continuing.

1. **SUPABASE_SERVICE_ROLE_KEY** — bypasses RLS; all data at risk. Verify: `/api/cron/sync` returns 200.
2. **ANTHROPIC_API_KEY** — chat unavailable if stale. Verify: send one chat message.
3. **GROQ_API_KEY** — demo path unavailable. Verify: demo-account chat returns a completion.
4. **SUPABASE_ANON_KEY** — auth + client queries break. Verify: sign in from a fresh browser.
5. **GOOGLE_CLIENT_SECRET** — existing users must re-OAuth. Surface a notice in Settings. Verify: disconnect/reconnect Google in Settings → Integrations.
6. **FITBIT_CLIENT_SECRET** — new OAuth flows + token refresh break; existing stored tokens survive. Verify: Sync Now for Fitbit returns 200.
7. **CRON_SECRET** — cron endpoints return 401. Verify: `curl -H "Authorization: Bearer $NEW_SECRET" /api/cron/sync` returns 200.
8. Third-party API keys (POLYGON_API_KEY, etc.) — rotate in respective consoles.
9. Deployment Protection token — regenerate in Vercel dashboard.

**Do not rotate ENCRYPTION_KEY** without a re-encryption migration script that decrypts every `user_integrations.refresh_token_encrypted` row with the old key and re-encrypts with the new. This is a separate, planned operation.

## Breach response

1. **Freeze** — immediately revoke or rotate the exposed credential in the issuing console. If a service-role key is exposed, also verify Supabase RLS policies are intact.
2. **Rotate** — follow the priority order above. Update Vercel env vars; redeploy.
3. **Verify** — confirm all API routes return expected status codes. Tail Vercel logs for 10 minutes post-deploy.
4. **Communicate** — if any user-facing integration (e.g., Google OAuth) is broken, surface a notice in Settings → Integrations and add a CHANGELOG entry. No secret values in any communication.
5. **Document** — file a rotation log under `docs/runbooks/secret-rotation-YYYY-MM.md` using the template from `docs/runbooks/secret-rotation-2026-04.md`.

## PR checklist

Every PR that adds or modifies env vars must complete the security checklist in `.github/PULL_REQUEST_TEMPLATE.md`. The checklist is non-optional — do not merge if any box is unchecked.

## Rotation log index

| Date | PR | Notes |
|------|----|-------|
| 2026-04-22 | [#368](https://github.com/Theioz/mr-bridge-assistant/issues/368) | Post-Vercel April 2026 incident; all secrets rotated; Monarch/TheSportsDB keys deleted |
