import { google } from "googleapis";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadIntegration, persistRotatedToken } from "@/lib/integrations/tokens";

export class GoogleNotConnectedError extends Error {
  constructor() {
    super("Google account not connected. Connect Google in Settings.");
    this.name = "GoogleNotConnectedError";
  }
}

/**
 * Returns an OAuth2 client authenticated with the user's stored refresh token.
 *
 * Falls back to the GOOGLE_REFRESH_TOKEN env var if the user matches OWNER_USER_ID
 * and no DB row exists yet — migration path until the seed script is run post-deploy.
 *
 * Throws GoogleNotConnectedError if neither source has a token for this user.
 */
export async function getGoogleAuthClient({
  db,
  userId,
}: {
  db: SupabaseClient;
  userId: string;
}) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET env vars");
  }

  const auth = new google.auth.OAuth2(clientId, clientSecret);

  // Catch lookup errors (e.g. ENCRYPTION_KEY not yet configured in dev) and
  // fall through to the env fallback rather than surfacing an infra error.
  const integration = await loadIntegration(db, userId, "google").catch(() => null);

  if (integration) {
    auth.setCredentials({ refresh_token: integration.refreshToken });

    // Persist rotated refresh tokens (Google occasionally rotates them)
    auth.on("tokens", async (tokens) => {
      if (tokens.refresh_token) {
        await persistRotatedToken(db, userId, "google", tokens.refresh_token).catch(() => {});
      }
    });

    return auth;
  }

  // Migration fallback: owner user before seed script has been run
  const ownerUserId = process.env.OWNER_USER_ID;
  const envToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (userId === ownerUserId && envToken) {
    auth.setCredentials({ refresh_token: envToken });
    return auth;
  }

  throw new GoogleNotConnectedError();
}
