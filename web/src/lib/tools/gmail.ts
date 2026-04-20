import { tool, jsonSchema } from "ai";
import { google } from "googleapis";
import { getGoogleAuthClient } from "@/lib/google-auth";
import type { ToolContext } from "./_context";

const DEMO_EMAILS = [
  {
    id: "demo-email-1",
    from: "UPS Tracking <tracking@ups.com>",
    subject: "Your package is out for delivery today",
    date: "Mon, 13 Apr 2026 08:14:00 -0700",
    body: "Hi Alex, your package is out for delivery today. Estimated delivery: today by 8pm. Track at ups.com.",
  },
  {
    id: "demo-email-2",
    from: "Alaska Airlines <noreply@alaskaair.com>",
    subject: "Flight Confirmation: SFO → SEA Apr 20",
    date: "Thu, 10 Apr 2026 11:02:00 -0700",
    body: "Your flight AS 321 on April 20 from San Francisco (SFO) to Seattle (SEA) is confirmed. Departs 7:45am, arrives 9:50am. Confirmation code: KXZP94.",
  },
  {
    id: "demo-email-3",
    from: "Figma <notifications@figma.com>",
    subject: "Action required: Accept team invite from Lena Park",
    date: "Mon, 13 Apr 2026 09:47:00 -0700",
    body: "Lena Park has invited you to join the 'Product Design' team on Figma. Click here to accept.",
  },
  {
    id: "demo-email-4",
    from: "Hacker News Digest <digest@hackernewsdigest.com>",
    subject: "Top stories: Llama 4 benchmarks, SQLite as a backend",
    date: "Mon, 13 Apr 2026 06:30:00 -0700",
    body: "Top HN stories this week: Llama 4 beats GPT-4o on several benchmarks; SQLite as production backend — when it makes sense; Cloudflare Workers hits 100M active deployments.",
  },
  {
    id: "demo-email-5",
    from: "DocuSign <dse@docusign.net>",
    subject: "Invoice #4421 — please sign",
    date: "Fri, 11 Apr 2026 15:12:00 -0700",
    body: "Alex Chen, a document has been sent to you for signature by Acme Corp. Invoice #4421 for $1,240.00 is ready for your review. This request will expire in 7 days.",
  },
];

export function buildGmailTools({ supabase, userId, isDemo }: ToolContext) {
  return {
    search_gmail: tool({
      description:
        "Search Gmail using any Gmail query string (e.g. 'from:regal tickets', 'subject:invoice is:unread'). Returns message ID, sender, subject, and date. Use get_email_body to read the full content of a specific message.",
      inputSchema: jsonSchema<{ query: string; max_results?: number }>({
        type: "object",
        required: ["query"],
        properties: {
          query: {
            type: "string",
            description: "Gmail search query. Supports all Gmail search operators.",
          },
          max_results: {
            type: "number",
            description: "Max messages to return. Defaults to 5, max 10.",
          },
        },
      }),
      execute: async ({ query, max_results = 5 }) => {
        if (isDemo) {
          const q = query.toLowerCase();
          const mockEmails = DEMO_EMAILS.filter((e) =>
            !q || e.subject.toLowerCase().includes(q.split(" ")[0]) || q.includes("unread") || q.includes("subject:")
          ).slice(0, Math.min(max_results, 5));
          return { results: mockEmails };
        }
        try {
          const auth = await getGoogleAuthClient({ db: supabase, userId });
          const gmail = google.gmail({ version: "v1", auth });

          const listRes = await gmail.users.messages.list({
            userId: "me",
            q: query,
            maxResults: Math.min(max_results, 10),
          });

          const messages = listRes.data.messages ?? [];
          if (messages.length === 0) return { results: [] };

          const getHeader = (
            headers: { name?: string | null; value?: string | null }[],
            name: string
          ) => headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

          const summaries = await Promise.all(
            messages.map(async (m) => {
              const msg = await gmail.users.messages.get({
                userId: "me",
                id: m.id!,
                format: "metadata",
                metadataHeaders: ["From", "Subject", "Date"],
              });
              const headers = msg.data.payload?.headers ?? [];
              return {
                id: m.id,
                from: getHeader(headers, "From"),
                subject: getHeader(headers, "Subject") || "(No subject)",
                date: getHeader(headers, "Date"),
              };
            })
          );

          return { results: summaries };
        } catch (err) {
          return { error: err instanceof Error ? err.message : "Gmail search failed" };
        }
      },
    }),

    get_email_body: tool({
      description:
        "Fetch the full text body of a Gmail message by its ID. Use this after search_gmail to read email content. Returns decoded plain text.",
      inputSchema: jsonSchema<{ message_id: string }>({
        type: "object",
        required: ["message_id"],
        properties: {
          message_id: {
            type: "string",
            description: "The Gmail message ID from search_gmail results.",
          },
        },
      }),
      execute: async ({ message_id }) => {
        if (isDemo) {
          const email = DEMO_EMAILS.find((e) => e.id === message_id);
          if (!email) return { error: "Email not found" };
          return { id: message_id, from: email.from, subject: email.subject, date: email.date, body: email.body ?? email.subject, truncated: false };
        }
        try {
          const auth = await getGoogleAuthClient({ db: supabase, userId });
          const gmail = google.gmail({ version: "v1", auth });

          const msg = await gmail.users.messages.get({
            userId: "me",
            id: message_id,
            format: "full",
          });

          const headers = msg.data.payload?.headers ?? [];
          const getHeader = (name: string) =>
            headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

          type Part = {
            mimeType?: string | null;
            body?: { data?: string | null } | null;
            parts?: Part[] | null;
          };

          function findBody(parts: Part[], mime: string): string | null {
            for (const part of parts) {
              if (part.mimeType === mime && part.body?.data) {
                return Buffer.from(part.body.data, "base64url").toString("utf-8");
              }
              if (part.parts) {
                const found = findBody(part.parts, mime);
                if (found) return found;
              }
            }
            return null;
          }

          const payload = msg.data.payload;
          let body: string | null = null;

          if (payload?.body?.data) {
            body = Buffer.from(payload.body.data, "base64url").toString("utf-8");
          } else if (payload?.parts) {
            body = findBody(payload.parts as Part[], "text/plain");
            if (!body) {
              const html = findBody(payload.parts as Part[], "text/html");
              if (html) body = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
            }
          }

          const isTruncated = body ? body.length > 4000 : false;
          const bodyText = body
            ? isTruncated
              ? body.slice(0, 4000) + `\n\n[...email truncated — ${body.length - 4000} more characters not shown]`
              : body
            : null;

          return {
            id: message_id,
            from: getHeader("From"),
            subject: getHeader("Subject"),
            date: getHeader("Date"),
            body: bodyText ?? "(No readable body found)",
            truncated: isTruncated,
          };
        } catch (err) {
          return { error: err instanceof Error ? err.message : "Failed to fetch email body" };
        }
      },
    }),
  };
}
