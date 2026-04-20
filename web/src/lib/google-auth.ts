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
 * Throws GoogleNotConnectedError if no DB row exists for this user.
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

  const integration = await loadIntegration(db, userId, "google").catch(() => null);

  if (!integration) {
    throw new GoogleNotConnectedError();
  }

  auth.setCredentials({ refresh_token: integration.refreshToken });

  // Persist rotated refresh tokens (Google occasionally rotates them)
  auth.on("tokens", async (tokens) => {
    if (tokens.refresh_token) {
      await persistRotatedToken(db, userId, "google", tokens.refresh_token).catch(() => {});
    }
  });

  return auth;
}
