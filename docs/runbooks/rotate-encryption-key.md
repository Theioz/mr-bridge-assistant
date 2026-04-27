# Runbook: Rotate ENCRYPTION_KEY

**Risk level:** HIGH — requires a data migration inside a transaction. All OAuth refresh tokens in `user_integrations` must be re-encrypted with the new key before the app is redeployed. Any window where the app key and the database key disagree will break every integration for every user.

**Affected table:** `user_integrations.refresh_token_encrypted` (bytea, encrypted with `extensions.pgp_sym_encrypt`)

**Code reference:** `web/src/lib/integrations/tokens.ts` — `encrypt_integration_token` / `decrypt_integration_token` Supabase RPCs

---

## Prerequisites

- Access to the Supabase SQL editor (project dashboard → SQL Editor)
- The current value of `ENCRYPTION_KEY` (retrieve from Vercel dashboard → Settings → Environment Variables)
- Vercel dashboard access to update env vars and trigger a redeploy
- A maintenance window if there are active users — the migration is transactional but brief

---

## Step 1 — Generate the new key

Run locally. Never commit this value to git.

```bash
openssl rand -hex 32
```

Copy the output. This is `<NEW_KEY>`. Keep both `<OLD_KEY>` (current Vercel value) and `<NEW_KEY>` accessible for the next steps.

---

## Step 2 — Verify decryption works with the current key

Before touching any data, confirm the current key actually decrypts rows. In the Supabase SQL editor:

```sql
SELECT
  id,
  user_id,
  provider,
  extensions.pgp_sym_decrypt(refresh_token_encrypted, '<OLD_KEY>') AS decrypted_token
FROM user_integrations
LIMIT 3;
```

Replace `<OLD_KEY>` with the literal current key value. If `decrypted_token` returns readable strings (not an error), the current key is correct and you can proceed. If this throws, stop — the key in Vercel may not match what was used to encrypt. Investigate before continuing.

---

## Step 3 — Re-encrypt all rows in a transaction

In the Supabase SQL editor, run the following. Replace both placeholders with the literal key values (no colon prefix — plain string literals in single quotes).

```sql
BEGIN;

-- Prevent concurrent writes during re-encryption.
LOCK TABLE user_integrations IN EXCLUSIVE MODE;

-- Sanity check: count rows before update.
-- Compare this number to the count after the UPDATE.
SELECT count(*) AS rows_before FROM user_integrations;

-- Re-encrypt every row: decrypt with old key, encrypt with new key.
UPDATE user_integrations
SET
  refresh_token_encrypted = extensions.pgp_sym_encrypt(
    extensions.pgp_sym_decrypt(refresh_token_encrypted, '<OLD_KEY>'),
    '<NEW_KEY>'
  ),
  updated_at = now();

-- Verify row count matches.
SELECT count(*) AS rows_after FROM user_integrations;

COMMIT;
```

After `COMMIT`, confirm `rows_before` equals `rows_after`. If they differ, the table was written to during the migration window — investigate before proceeding.

---

## Step 4 — Verify decryption with the new key

Immediately after the migration, confirm the new key decrypts correctly:

```sql
SELECT
  id,
  user_id,
  provider,
  extensions.pgp_sym_decrypt(refresh_token_encrypted, '<NEW_KEY>') AS decrypted_token
FROM user_integrations
LIMIT 3;
```

`decrypted_token` must return readable strings. If this throws a decryption error, do not update Vercel — roll back (see Rollback section).

---

## Step 5 — Update Vercel env var

1. Vercel dashboard → your project → Settings → Environment Variables
2. Find `ENCRYPTION_KEY` → Edit
3. Replace the value with `<NEW_KEY>` — ensure the Sensitive flag is checked
4. Save

Do not redeploy yet.

---

## Step 6 — Redeploy

Trigger a Vercel redeploy (Settings → Deployments → Redeploy latest, or push a trivial commit). All serverless functions will pick up the new `ENCRYPTION_KEY` atomically on cold start.

---

## Step 7 — Verify end-to-end

For each connected integration (Google, Fitbit, Oura):

- [ ] Google: navigate to Calendar tab — events load without errors
- [ ] Fitbit: Settings → Integrations → Sync Now for Fitbit returns 200
- [ ] Oura: Settings → Integrations → Sync Now for Oura returns 200
- [ ] Vercel logs: no `Token decryption failed` errors in the 10 minutes after redeploy

If any integration fails with a decryption error post-redeploy, roll back immediately.

---

## Rollback

If the app fails after Step 6 (re-encryption already committed, but Vercel is wrong):

1. In Vercel, revert `ENCRYPTION_KEY` to `<OLD_KEY>` and redeploy — the database already has data encrypted with `<NEW_KEY>`, so this will not restore function.

**The only safe rollback is to re-run the migration SQL in reverse** (swap `<OLD_KEY>` and `<NEW_KEY>`) before any user traffic hits the new deployment. This is why Step 4 verification is critical — catch the problem before updating Vercel.

If re-encryption is partially complete (migration errored mid-way), the `BEGIN`/`COMMIT` block ensures nothing was committed. Re-run Step 3 cleanly.

---

## After completion

- Discard both key values from any clipboard or local note
- Old key: if it was stored anywhere besides Vercel (e.g. `.env.local`), remove it
- Log this rotation in `docs/SECURITY.md` under the Rotation log index
