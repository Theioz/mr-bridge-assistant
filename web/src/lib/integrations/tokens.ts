import type { SupabaseClient } from "@supabase/supabase-js";

function requireEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error("ENCRYPTION_KEY env var is required");
  return key;
}

export interface IntegrationRecord {
  refreshToken: string;
  scopes: string[];
  connectedAt: string;
  accessToken: string | null;
  accessTokenExpiresAt: string | null;
}

export async function storeIntegration(
  db: SupabaseClient,
  userId: string,
  provider: string,
  opts: { refreshToken: string; scopes: string[] },
): Promise<void> {
  const key = requireEncryptionKey();
  const { data: encrypted, error: encErr } = await db.rpc("encrypt_integration_token", {
    token: opts.refreshToken,
    key,
  });
  if (encErr) throw new Error(`Token encryption failed: ${encErr.message}`);

  const { error } = await db.from("user_integrations").upsert(
    {
      user_id: userId,
      provider,
      refresh_token_encrypted: encrypted,
      scopes: opts.scopes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" },
  );
  if (error) throw new Error(`Failed to store integration: ${error.message}`);
}

export async function loadIntegration(
  db: SupabaseClient,
  userId: string,
  provider: string,
): Promise<IntegrationRecord | null> {
  const key = requireEncryptionKey();
  const { data, error } = await db
    .from("user_integrations")
    .select("refresh_token_encrypted, scopes, connected_at, access_token, access_token_expires_at")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  if (error) throw new Error(`Failed to load integration: ${error.message}`);
  if (!data) return null;

  const { data: decrypted, error: decErr } = await db.rpc("decrypt_integration_token", {
    encrypted: data.refresh_token_encrypted,
    key,
  });
  if (decErr) throw new Error(`Token decryption failed: ${decErr.message}`);

  return {
    refreshToken: decrypted as string,
    scopes: data.scopes ?? [],
    connectedAt: data.connected_at,
    accessToken: data.access_token,
    accessTokenExpiresAt: data.access_token_expires_at,
  };
}

export async function deleteIntegration(
  db: SupabaseClient,
  userId: string,
  provider: string,
): Promise<void> {
  const { error } = await db
    .from("user_integrations")
    .delete()
    .eq("user_id", userId)
    .eq("provider", provider);
  if (error) throw new Error(`Failed to delete integration: ${error.message}`);
}

export async function listConnectedUsers(db: SupabaseClient, provider: string): Promise<string[]> {
  const { data, error } = await db
    .from("user_integrations")
    .select("user_id")
    .eq("provider", provider);
  if (error) throw new Error(`Failed to list connected users: ${error.message}`);
  return (data ?? []).map((r: { user_id: string }) => r.user_id);
}

export async function persistRotatedToken(
  db: SupabaseClient,
  userId: string,
  provider: string,
  refreshToken: string,
): Promise<void> {
  const key = requireEncryptionKey();
  const { data: encrypted, error: encErr } = await db.rpc("encrypt_integration_token", {
    token: refreshToken,
    key,
  });
  if (encErr) throw new Error(`Token rotation encrypt failed: ${encErr.message}`);

  const { error } = await db
    .from("user_integrations")
    .update({ refresh_token_encrypted: encrypted, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("provider", provider);
  if (error) throw new Error(`Failed to persist rotated token: ${error.message}`);
}
