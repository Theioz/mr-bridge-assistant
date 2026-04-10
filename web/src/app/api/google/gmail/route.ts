import { google } from "googleapis";
import { NextResponse } from "next/server";

export interface EmailSummary {
  from: string;
  subject: string;
  receivedAt: string;
}

function parseFrom(raw: string): string {
  // "Display Name <email@example.com>" → "Display Name"
  const match = raw.match(/^"?([^"<]+)"?\s*</);
  if (match) return match[1].trim();
  // bare email → return as-is
  return raw.replace(/<[^>]+>/, "").trim() || raw;
}

function getHeader(headers: { name?: string | null; value?: string | null }[], name: string): string {
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

export async function GET() {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
      return NextResponse.json({ emails: [] });
    }

    const auth = new google.auth.OAuth2(clientId, clientSecret);
    auth.setCredentials({ refresh_token: refreshToken });

    const gmail = google.gmail({ version: "v1", auth });

    const listRes = await gmail.users.messages.list({
      userId: "me",
      q: 'is:unread subject:(meeting OR urgent OR invoice OR "action required" OR deadline)',
      maxResults: 5,
    });

    const messages = listRes.data.messages ?? [];
    if (messages.length === 0) {
      return NextResponse.json({ emails: [] });
    }

    const emails: EmailSummary[] = await Promise.all(
      messages.map(async (m) => {
        const msg = await gmail.users.messages.get({
          userId: "me",
          id: m.id!,
          format: "metadata",
          metadataHeaders: ["From", "Subject", "Date"],
        });
        const headers = msg.data.payload?.headers ?? [];
        return {
          from: parseFrom(getHeader(headers, "From")),
          subject: getHeader(headers, "Subject") || "(No subject)",
          receivedAt: getHeader(headers, "Date"),
        };
      })
    );

    return NextResponse.json({ emails });
  } catch (err) {
    console.error("[gmail] error:", err);
    return NextResponse.json({ emails: [], error: "Failed to fetch emails" });
  }
}
