# Runbook: Rotate SUPABASE_SERVICE_ROLE_KEY

**Risk level:** MEDIUM — the key bypasses RLS and grants full database access. Rotation is low-risk technically (no data migration required), but a gap between the old key expiring and the new key being deployed will break all cron syncs and service-level operations.

**Who uses this key:** Any code that imports `createServiceClient()` from `web/src/lib/supabase/server.ts`. Do not use this client for user-specific data reads — it bypasses RLS.

---

## Prerequisites

- Access to the Supabase dashboard (project → Settings → API)
- Vercel dashboard access to update env vars and trigger a redeploy

---

## Step 1 — Generate the new key in Supabase

1. Supabase dashboard → your project → Settings → API
2. Under **Service role** → click **Reset** (or regenerate, depending on dashboard version)
3. Copy the new `service_role` JWT. This is `<NEW_SERVICE_KEY>`.

The old key remains active until Supabase expires it (typically immediately on reset, or after a brief overlap window — confirm in the dashboard).

---

## Step 2 — Update Vercel env vars

1. Vercel dashboard → your project → Settings → Environment Variables
2. Find `SUPABASE_SERVICE_ROLE_KEY` → Edit → replace value with `<NEW_SERVICE_KEY>`
3. Confirm the Sensitive flag is checked
4. Save
5. If `SMOKE_SUPABASE_SERVICE_KEY` is set (used by smoke tests), update it to the same new value

---

## Step 3 — Redeploy

Trigger a Vercel redeploy (Settings → Deployments → Redeploy latest, or push a trivial commit). Serverless functions pick up the new key on cold start.

Time the redeploy to minimize the window where the old key is expired but the new deployment is not yet live. On Vercel, a full redeploy typically completes in under two minutes.

---

## Step 4 — Verify

- [ ] `/api/cron/sync` with `CRON_SECRET`: returns 200 and rows are written to Supabase
- [ ] Settings → Integrations → Sync Now for any integration: returns 200
- [ ] Vercel logs: no `Invalid API key` or `JWT expired` errors in the 10 minutes after redeploy
- [ ] Smoke tests pass if configured: `SMOKE_SUPABASE_SERVICE_KEY` updated and test suite green

---

## Step 5 — Audit other storage locations

Check whether the old key exists anywhere besides Vercel:

- [ ] `.env.local` (development) — update to new key or remove if not needed locally
- [ ] Any CI/CD secrets (GitHub Actions, etc.) — update if present
- [ ] Any local scripts that hardcode the key — update

---

## Rollback

If the new key does not work post-redeploy:

1. In the Supabase dashboard, check whether the new key was saved correctly (copy it again)
2. Update Vercel `SUPABASE_SERVICE_ROLE_KEY` with the re-copied value and redeploy
3. If the key was reset in Supabase and the old key is now invalid, there is no rollback — generate a new key and proceed from Step 2

---

## After completion

- Discard the old key from any clipboard or local note
- Log this rotation in `docs/SECURITY.md` under the Rotation log index
