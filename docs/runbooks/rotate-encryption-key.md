# Runbook: Rotate ENCRYPTION_KEY

**Risk level:** HIGH — requires a data migration inside a transaction. All OAuth refresh tokens in `user_integrations` must be re-encrypted with the new key before the app is given the new key. Any window where the app's key and the key the rows were encrypted with disagree breaks every integration (Google, Google Health, Oura).

**Affected table:** `user_integrations.refresh_token_encrypted` (bytea, encrypted with `extensions.pgp_sym_encrypt`)

**Code reference:** `web/src/lib/integrations/tokens.ts` — calls the `encrypt_integration_token` / `decrypt_integration_token` RPCs, passing `ENCRYPTION_KEY` from the server env. The Python scripts decrypt the same way via `scripts/_integrations.py`.

---

## Prerequisites

- A `psql` session on compute-core as `postgres`:
  `docker exec -it supabase-db psql -U postgres -d postgres`
  (There is no Supabase dashboard or SQL editor — the self-hosted stack has no Studio.)
- The current value of `ENCRYPTION_KEY` (Vaultwarden Secure Note `mr-bridge-env`)
- A quiet moment — the cron jobs and the app must not write `user_integrations` during Step 3. An Oura sync rotates its refresh token on every run, so avoid the scheduled sync time (Settings → Status lists it).

---

## Step 1 — Generate the new key

Run locally. Never commit this value to git.

```bash
openssl rand -hex 32
```

Copy the output. This is `<NEW_KEY>`. Keep both `<OLD_KEY>` (current value) and `<NEW_KEY>` accessible for the next steps.

---

## Step 2 — Verify decryption works with the current key

Before touching any data, confirm the current key actually decrypts rows:

```sql
SELECT
  id,
  user_id,
  provider,
  extensions.pgp_sym_decrypt(refresh_token_encrypted, '<OLD_KEY>') AS decrypted_token
FROM user_integrations
LIMIT 3;
```

Replace `<OLD_KEY>` with the literal current key value. If `decrypted_token` returns readable strings (not an error), the current key is correct and you can proceed. If this throws, stop — the key in Vaultwarden may not match what was used to encrypt. Investigate before continuing.

---

## Step 3 — Re-encrypt all rows in a transaction

Replace both placeholders with the literal key values (plain string literals in single quotes).

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

`decrypted_token` must return readable strings. If this throws a decryption error, do not update the env files — roll back (see Rollback section).

---

## Step 5 — Update every copy of the key

| Where | Who reads it |
|---|---|
| Vaultwarden `mr-bridge-env` (canonical) | — |
| `~/docker/mr-bridge/.env` | the app container |
| Root `.env` of the repo checkout on compute-core | Python cron scripts (`scripts/_integrations.py`) |
| `~/.mrb-secrets/env` on every machine that runs the MCP server | calendar tools in `web/mcp/server.ts` |
| `web/.env.local` on any dev machine | `next dev` |

---

## Step 6 — Recreate the app container

```bash
docker compose up -d --force-recreate
```

`ENCRYPTION_KEY` is read at runtime, so no image rebuild is needed. `docker compose restart` does **not** reload `.env`.

---

## Step 7 — Verify end-to-end

For each connected integration:

- [ ] Google: the dashboard schedule / `/calendar` loads events without errors
- [ ] Google Health: Settings → Integrations → Sync Now succeeds
- [ ] Oura: Settings → Integrations → Sync Now succeeds
- [ ] `docker logs mr-bridge`: no `Token decryption failed` errors in the 10 minutes after the recreate

If any integration fails with a decryption error, roll back immediately.

---

## Rollback

If the app fails after Step 6 (re-encryption already committed, but a consumer has the wrong key):

1. Putting `<OLD_KEY>` back into the env files will **not** restore function — the database already holds data encrypted with `<NEW_KEY>`.

**The only safe rollback is to re-run the migration SQL in reverse** (swap `<OLD_KEY>` and `<NEW_KEY>`) and restore `<OLD_KEY>` everywhere in Step 5. This is why Step 4 verification is critical — catch the problem before changing the env files.

If re-encryption errored mid-way, the `BEGIN`/`COMMIT` block ensures nothing was committed. Re-run Step 3 cleanly.

---

## After completion

- Discard both key values from any clipboard or local note
- Log this rotation in `docs/SECURITY.md` under the Rotation log index
