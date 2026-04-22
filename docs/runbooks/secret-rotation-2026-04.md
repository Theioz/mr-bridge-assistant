# Secret Rotation Runbook — April 2026

**Incident:** Vercel April 2026 security incident.
**Date executed:** 2026-04-22
**PR:** TBD (replace after merge)
**Executor:** Jason Leung

---

## Pre-rotation checklist

- [x] Git history scanned for committed secrets (`git log -S "sk-ant-api"`, `git log -S "sb_secret_"`, `git log -S "eyJ" -- '*.env*'`) — zero hits.
- [x] `.env` and `.env.local` confirmed gitignored (root + web `.gitignore`).
- [x] Branch cut from `origin/main` (not local main).

---

## Audit — Vercel env var inventory

Fill in from Vercel dashboard before rotation. Column definitions:
- **Exists**: ✓ present in Production / — not present
- **Sensitive**: ✓ flag set / ✗ flag missing / n/a (public)

| Variable | Exists | Sensitive | Action |
|----------|--------|-----------|--------|
| SUPABASE_SERVICE_ROLE_KEY | | | Rotate |
| SUPABASE_ANON_KEY | | | Rotate |
| NEXT_PUBLIC_SUPABASE_URL | | n/a | Keep |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | | n/a | Keep |
| ANTHROPIC_API_KEY | | | Rotate |
| GROQ_API_KEY | | | Rotate |
| GOOGLE_CLIENT_ID | | | Keep (public OAuth client ID) |
| GOOGLE_CLIENT_SECRET | | | Rotate |
| FITBIT_CLIENT_ID | | | Keep (public OAuth client ID) |
| FITBIT_CLIENT_SECRET | | | Rotate if present |
| CRON_SECRET | | | Rotate |
| POLYGON_API_KEY | | | Rotate |
| ENCRYPTION_KEY | | | Keep — out of scope (see docs/SECURITY.md) |
| OWNER_USER_ID | | | Not a secret — note only |
| DEMO_USER_ID | | | Not a secret — note only |
| DEMO_EMAIL | | | Keep |
| DEMO_PASSWORD | | | Keep |
| NEXT_PUBLIC_DEMO_EMAIL | | n/a | Keep |
| NEXT_PUBLIC_DEMO_PASSWORD | | n/a | Keep |
| PICOVOICE_ACCESS_KEY | | | Rotate if present |
| APP_URL | | n/a | Keep |
| USER_TIMEZONE | | n/a | Keep |
| NTFY_TOPIC | | | Keep (not a high-risk credential) |
| SMOKE_TEST_EMAIL | | | Keep |
| SMOKE_TEST_PASSWORD | | | Rotate if present |
| SMOKE_SUPABASE_SERVICE_KEY | | | Rotate (same value as SERVICE_ROLE_KEY) |
| OWNER_USER_ID | | n/a | Not a secret |
| MONARCH_EMAIL | | | **Delete** — abandoned integration |
| MONARCH_PASSWORD | | | **Delete** — abandoned integration |
| MONARCH_MFA_SECRET | | | **Delete** — abandoned integration |
| SPORTSDB_API_KEY | | | **Delete** — migrated to ESPN (no key) |
| SPORTS_PROVIDER | | | **Delete** — no longer used |
| OURA_ACCESS_TOKEN | | | **Delete** — post-#425, lives in user_integrations |
| FITBIT_REFRESH_TOKEN | | | **Delete** — post-#425, lives in user_integrations |
| GOOGLE_REFRESH_TOKEN | | | **Delete if present** — deprecated post-#390 |
| GOOGLE_FIT_REFRESH_TOKEN | | | **Delete if present** — deprecated post-#390 |

---

## Rotation log

Record new secret prefix (not full value), date/time, and verification result for each rotation.

### 1. SUPABASE_SERVICE_ROLE_KEY

- **Rotated:** [ ] Date/time: ___
- **Console:** Supabase dashboard → Settings → API → Service role → Reset
- **Verification:** `/api/cron/sync` with new `CRON_SECRET` returns 200 and rows written: [ ]
- **Notes:**

### 2. ANTHROPIC_API_KEY

- **Rotated:** [ ] Date/time: ___
- **Console:** console.anthropic.com → API Keys → Create key; revoke old
- **Verification:** Chat message end-to-end returns completion: [ ]
- **Notes:**

### 3. GROQ_API_KEY

- **Rotated:** [ ] Date/time: ___
- **Console:** console.groq.com → API Keys → Create key; revoke old
- **Verification:** Demo-account chat returns completion: [ ]
- **Notes:**

### 4. SUPABASE_ANON_KEY

- **Rotated:** [ ] Date/time: ___
- **Console:** Supabase dashboard → Settings → API → anon key → Reset
- **Verification:** Sign in from fresh browser; dashboard loads: [ ]
- **Notes:**

### 5. GOOGLE_CLIENT_SECRET

- **Rotated:** [ ] Date/time: ___
- **Console:** Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client → Edit → Reset secret
- **Re-OAuth required:** Yes — owner must disconnect/reconnect Google in Settings → Integrations
- **Verification:** Calendar events load after reconnect: [ ]
- **Notes:**

### 6. FITBIT_CLIENT_SECRET

- **Present in Vercel:** [ ] Yes / [ ] No
- **Rotated (if present):** [ ] Date/time: ___
- **Console:** dev.fitbit.com → your app → Edit → Regenerate secret
- **Verification:** Settings → Sync Now for Fitbit returns 200: [ ]
- **Notes:**

### 7. CRON_SECRET

- **Rotated:** [ ] Date/time: ___
- **New value generated with:** `openssl rand -hex 32`
- **Updated in Vercel:** [ ] Updated in Vercel Cron configuration: [ ]
- **Verification:** Cron invocation in Vercel logs returns 200, not 401: [ ]
- **Notes:**

### 8. POLYGON_API_KEY

- **Rotated:** [ ] Date/time: ___
- **Console:** polygon.io → Dashboard → API Keys → Regenerate
- **Verification:** Watchlist widget loads stock data: [ ]
- **Notes:**

---

## Variables deleted from Vercel

- [ ] MONARCH_EMAIL
- [ ] MONARCH_PASSWORD
- [ ] MONARCH_MFA_SECRET
- [ ] SPORTSDB_API_KEY
- [ ] SPORTS_PROVIDER
- [ ] OURA_ACCESS_TOKEN (if present)
- [ ] FITBIT_REFRESH_TOKEN (if present)
- [ ] GOOGLE_REFRESH_TOKEN (if present)
- [ ] GOOGLE_FIT_REFRESH_TOKEN (if present)

---

## Sensitive flag audit

After all rotations, confirm every variable in the audit table above shows Sensitive in Vercel:

- [ ] All rotated secrets re-added with Sensitive flag checked.
- [ ] No plaintext secret value visible in Vercel build logs post-deploy.

---

## Post-rotation verification

- [ ] `npm run typecheck` clean in `web/`.
- [ ] Chat message end-to-end (Anthropic path).
- [ ] Demo-account chat (Groq path).
- [ ] Settings → Integrations → Sync Now for Fitbit: 200.
- [ ] Settings → Integrations → Sync Now for Oura: 200.
- [ ] Calendar tab loads events (after Google re-OAuth).
- [ ] `/api/cron/sync` with new CRON_SECRET: 200.
- [ ] Vercel logs: no 401/403 spikes in 10 minutes post-deploy.
- [ ] Watchlist widget shows stock data (Polygon).

---

## Re-OAuth impact

| Integration | Re-OAuth required | Reason |
|-------------|-------------------|--------|
| Google | Yes | CLIENT_SECRET rotated — existing stored tokens become invalid |
| Fitbit | No | Only CLIENT_SECRET rotated; stored refresh tokens in user_integrations are not invalidated by rotating the app secret |
| Oura | No | PAT-based; no client secret |

Users affected by Google re-OAuth: see Settings → Integrations reconnect note.

---

## Owner actions (manual, in browser)

1. Vercel dashboard: complete the audit table above.
2. Rotate each secret in its console (priority order in docs/SECURITY.md).
3. Update Vercel env vars with new values; ensure Sensitive flag is set.
4. Redeploy.
5. Reconnect Google in Settings → Integrations.
6. Run through the post-rotation verification checklist above.
7. Fill in results in this file and update the PR description.
