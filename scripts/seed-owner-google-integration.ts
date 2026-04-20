/**
 * One-shot script: seeds Jason's GOOGLE_REFRESH_TOKEN into user_integrations.
 *
 * Run once after deploying the per-user OAuth migration:
 *   npx tsx scripts/seed-owner-google-integration.ts
 *
 * Prerequisites (all must be set in the environment or .env.local):
 *   SUPABASE_SERVICE_ROLE_KEY
 *   NEXT_PUBLIC_SUPABASE_URL
 *   OWNER_USER_ID
 *   GOOGLE_REFRESH_TOKEN
 *   ENCRYPTION_KEY
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *
 * Safe to run multiple times — uses ON CONFLICT … DO UPDATE.
 */

import { config } from "dotenv";
import path from "path";

// Load .env.local from the web/ directory
config({ path: path.resolve(__dirname, "../web/.env.local") });

const required = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "OWNER_USER_ID",
  "GOOGLE_REFRESH_TOKEN",
  "ENCRYPTION_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
] as const;

for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ownerUserId = process.env.OWNER_USER_ID!;
const refreshToken = process.env.GOOGLE_REFRESH_TOKEN!;
const encryptionKey = process.env.ENCRYPTION_KEY!;
const clientId = process.env.GOOGLE_CLIENT_ID!;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;

async function getGrantedScopes(refreshToken: string): Promise<string[]> {
  // Exchange the refresh token for a short-lived access token, then inspect it
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    throw new Error(`Token exchange failed ${tokenRes.status}: ${body}`);
  }
  const tokenData = await tokenRes.json() as { access_token: string; scope?: string };
  return tokenData.scope?.split(" ") ?? [];
}

async function main() {
  console.log("Resolving granted scopes from GOOGLE_REFRESH_TOKEN…");
  let scopes: string[];
  try {
    scopes = await getGrantedScopes(refreshToken);
    console.log("Granted scopes:", scopes.join(", "));
  } catch (err) {
    console.warn("Could not resolve scopes (token exchange failed):", (err as Error).message);
    console.warn("Seeding with empty scopes array. Update manually if needed.");
    scopes = [];
  }

  // Encrypt via Supabase RPC (same function used by the app)
  const encryptRes = await fetch(
    `${supabaseUrl}/rest/v1/rpc/encrypt_integration_token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ token: refreshToken, key: encryptionKey }),
    },
  );
  if (!encryptRes.ok) {
    const body = await encryptRes.text();
    throw new Error(`Encryption RPC failed ${encryptRes.status}: ${body}`);
  }
  const encrypted = await encryptRes.json() as string;

  // Upsert into user_integrations (service role bypasses RLS)
  const upsertRes = await fetch(
    `${supabaseUrl}/rest/v1/user_integrations`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({
        user_id: ownerUserId,
        provider: "google",
        refresh_token_encrypted: encrypted,
        scopes,
        updated_at: new Date().toISOString(),
      }),
    },
  );

  if (!upsertRes.ok) {
    const body = await upsertRes.text();
    throw new Error(`Upsert failed ${upsertRes.status}: ${body}`);
  }

  console.log(`\nSeeded user_integrations for OWNER_USER_ID=${ownerUserId} with provider=google.`);
  console.log("Jason's calendar/gmail/fit calls will now use the DB row instead of the env var.");
  console.log("Once verified, file a follow-up issue to remove the GOOGLE_REFRESH_TOKEN env fallback.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
