import { google } from "googleapis";
import { NextResponse } from "next/server";
import { getGoogleAuthClient, GoogleNotConnectedError } from "@/lib/google-auth";
import { createClient } from "@/lib/supabase/server";

export interface EmailSummary {
  from: string;
  subject: string;
  snippet?: string;
  receivedAt: string;
  account: "personal" | "professional";
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

const DEMO_EMAILS: EmailSummary[] = [
  { from: "UPS Tracking",   subject: "Your package is out for delivery today",   snippet: "Hi Alex, your package is out for delivery today. Estimated delivery: today by 8pm. Track at ups.com.",                                    receivedAt: "Mon, 13 Apr 2026 08:14:00 -0700", account: "personal" },
  { from: "Alaska Airlines", subject: "Flight Confirmation: SFO → SEA Apr 20",  snippet: "Your flight AS 321 on April 20 from San Francisco (SFO) to Seattle (SEA) is confirmed. Departs 7:45am, arrives 9:50am. Code: KXZP94.",    receivedAt: "Thu, 10 Apr 2026 11:02:00 -0700", account: "personal" },
  { from: "Figma",          subject: "Action required: Accept team invite",       snippet: "Lena Park has invited you to join the 'Product Design' team on Figma. Click here to accept the invitation.",                                receivedAt: "Mon, 13 Apr 2026 09:47:00 -0700", account: "professional" },
  { from: "DocuSign",       subject: "Invoice #4421 — please sign",              snippet: "Alex Chen, a document has been sent to you for signature by Acme Corp. Invoice #4421 for $1,240.00. This request expires in 7 days.",       receivedAt: "Fri, 11 Apr 2026 15:12:00 -0700", account: "professional" },
];

export async function GET() {
  const serverClient = await createClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Return mock data for demo user
  if (user.id === process.env.DEMO_USER_ID) {
    return NextResponse.json({ emails: DEMO_EMAILS });
  }

  try {
    const auth = await getGoogleAuthClient({ db: serverClient, userId: user.id });
    const gmail = google.gmail({ version: "v1", auth });

    // Resolve the "Professional" label name → internal ID (user labels use opaque IDs, not names)
    const labelsRes = await gmail.users.labels.list({ userId: "me" });
    const professionalLabelId = labelsRes.data.labels?.find(
      (l) => l.name?.toLowerCase() === "professional"
    )?.id ?? null;

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
        const labelIds = msg.data.labelIds ?? [];
        const account: EmailSummary["account"] =
          professionalLabelId && labelIds.includes(professionalLabelId)
            ? "professional"
            : "personal";
        return {
          from: parseFrom(getHeader(headers, "From")),
          subject: getHeader(headers, "Subject") || "(No subject)",
          snippet: msg.data.snippet ?? undefined,
          receivedAt: getHeader(headers, "Date"),
          account,
        };
      })
    );

    return NextResponse.json({ emails });
  } catch (err) {
    if (err instanceof GoogleNotConnectedError) {
      return NextResponse.json({ emails: [], not_connected: true }, { status: 403 });
    }
    console.error("[gmail] error:", err);
    return NextResponse.json({ emails: [], error: "Failed to fetch emails" });
  }
}
