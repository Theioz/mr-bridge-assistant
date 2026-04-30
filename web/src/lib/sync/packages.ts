import { google } from "googleapis";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { gmail_v1 } from "googleapis";
import { logSync } from "./log";
import { getGoogleAuthClient } from "@/lib/google-auth";
import type { Package } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PackagesSyncResult {
  new: number;
}

type PackageUpsert = Omit<Package, "id" | "created_at">;

// ---------------------------------------------------------------------------
// Gmail helpers
// ---------------------------------------------------------------------------

function getHeader(headers: gmail_v1.Schema$MessagePartHeader[], name: string): string {
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function parseFrom(raw: string): string {
  const match = raw.match(/^"?([^"<]+)"?\s*</);
  if (match) return match[1].trim();
  return raw.replace(/<[^>]+>/, "").trim() || raw;
}

function decodeBase64url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

function extractBodyText(payload: gmail_v1.Schema$MessagePart | undefined | null): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64url(payload.body.data);
  }
  if (payload.mimeType === "text/html" && payload.body?.data) {
    return decodeBase64url(payload.body.data).replace(/<[^>]+>/g, " ");
  }
  if (payload.parts) {
    const plain = payload.parts.find((p) => p.mimeType === "text/plain");
    if (plain) return extractBodyText(plain);
    const html = payload.parts.find((p) => p.mimeType === "text/html");
    if (html) return extractBodyText(html);
    return payload.parts.map((p) => extractBodyText(p)).join("\n");
  }
  return "";
}

// ---------------------------------------------------------------------------
// ETA extraction from email body
// ---------------------------------------------------------------------------

const ETA_PATTERNS = [
  /estimated\s+delivery(?:\s+date)?:?\s*([A-Za-z,\s]+\d{1,2}(?:,\s*\d{4})?)/i,
  /expected\s+delivery(?:\s+date)?:?\s*([A-Za-z,\s]+\d{1,2}(?:,\s*\d{4})?)/i,
  /estimated\s+arrival:?\s*([A-Za-z,\s]+\d{1,2}(?:,\s*\d{4})?)/i,
  /arrives?\s+by:?\s*([A-Za-z,\s]+\d{1,2}(?:,\s*\d{4})?)/i,
  /arriving:?\s*([A-Za-z,\s]+\d{1,2}(?:,\s*\d{4})?)/i,
  /delivers?\s+by:?\s*([A-Za-z,\s]+\d{1,2}(?:,\s*\d{4})?)/i,
  /delivery\s+by:?\s*([A-Za-z,\s]+\d{1,2}(?:,\s*\d{4})?)/i,
  /will\s+(?:arrive|be\s+delivered)\s+by:?\s*([A-Za-z,\s]+\d{1,2}(?:,\s*\d{4})?)/i,
];

function relativeDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString("en-CA");
}

// Phrases that use "today" / "tomorrow" rather than a calendar date
const RELATIVE_ETA_PATTERNS: [RegExp, () => string][] = [
  [
    /\b(?:arrives?|arriving|delivered|delivering|be\s+delivered|scheduled\s+to\s+(?:arrive|be\s+delivered))\s+today\b/i,
    () => relativeDate(0),
  ],
  [
    /\b(?:arrives?|arriving|delivered|delivering|be\s+delivered|scheduled\s+to\s+(?:arrive|be\s+delivered))\s+tomorrow\b/i,
    () => relativeDate(1),
  ],
  [/\byour\s+(?:package|order)\s+arrives?\s+today\b/i, () => relativeDate(0)],
  [/\byour\s+(?:package|order)\s+arrives?\s+tomorrow\b/i, () => relativeDate(1)],
];

function extractEta(text: string): string | null {
  for (const [pattern, resolve] of RELATIVE_ETA_PATTERNS) {
    if (pattern.test(text)) return resolve();
  }
  for (const pattern of ETA_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;
    const raw = match[1].trim().replace(/^[A-Za-z]+,\s*/, "");
    const hasYear = /\b\d{4}\b/.test(raw);
    const candidate = hasYear ? raw : `${raw} ${new Date().getFullYear()}`;
    const d = new Date(candidate);
    if (isNaN(d.getTime())) continue;
    if (!hasYear && d.getTime() < Date.now() - 30 * 24 * 60 * 60 * 1000) {
      d.setFullYear(d.getFullYear() + 1);
    }
    return d.toLocaleDateString("en-CA");
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tracking number extraction
// ---------------------------------------------------------------------------

interface ExtractedTracking {
  tracking_number: string;
  carrier: string;
}

function extractTrackingNumbers(text: string, context: string): ExtractedTracking[] {
  const combined = `${context}\n${text}`;
  const results: ExtractedTracking[] = [];

  for (const m of combined.matchAll(/\b(1Z[0-9A-Z]{16})\b/g)) {
    results.push({ tracking_number: m[1], carrier: "ups" });
  }

  for (const m of combined.matchAll(/\b(TBA\d{12})\b/g)) {
    results.push({ tracking_number: m[1], carrier: "amazon" });
  }

  for (const m of combined.matchAll(/\b(9[0-9]{21})\b/g)) {
    results.push({ tracking_number: m[1], carrier: "usps" });
  }

  if (/fedex|federal express/i.test(combined)) {
    for (const m of combined.matchAll(/\b(\d{15}|\d{20})\b/g)) {
      results.push({ tracking_number: m[1], carrier: "fedex" });
    }
  }

  if (/\bDHL\b/i.test(combined)) {
    for (const m of combined.matchAll(/\b(\d{10,11})\b/g)) {
      results.push({ tracking_number: m[1], carrier: "dhl" });
    }
  }

  const seen = new Set<string>();
  return results.filter((r) => {
    if (seen.has(r.tracking_number)) return false;
    seen.add(r.tracking_number);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Main sync function
// ---------------------------------------------------------------------------

export async function syncPackages(
  db: SupabaseClient,
  userId: string,
): Promise<PackagesSyncResult> {
  const auth = await getGoogleAuthClient({ db, userId });
  const gmail = google.gmail({ version: "v1", auth });

  const listRes = await gmail.users.messages.list({
    userId: "me",
    q: 'newer_than:30d subject:(shipped OR "on its way" OR "out for delivery" OR "delivery update" OR "has been shipped" OR "your order is on its way" OR "shipping confirmation" OR "shipment notification" OR "order shipped" OR "your shipment" OR dispatched OR "arrives tomorrow" OR "arrives today" OR "your package arrives" OR "order arrives")',
    maxResults: 30,
  });
  const messages = listRes.data.messages ?? [];

  // Second pass: catch emails with ETA phrases that escaped the subject filter
  const listRes2 = await gmail.users.messages.list({
    userId: "me",
    q: 'newer_than:30d ("estimated delivery" OR "estimated arrival" OR "arrives by" OR "delivery by" OR "shipping confirmation" OR dispatched OR "arrives tomorrow" OR "arrives today" OR "delivered tomorrow" OR "delivered today" OR "scheduled to be delivered") in:inbox',
    maxResults: 30,
  });
  const seenMsgIds = new Set(messages.map((m) => m.id));
  const allMessages = [
    ...messages,
    ...(listRes2.data.messages ?? []).filter((m) => m.id && !seenMsgIds.has(m.id)),
  ];

  const { data: existingPkgs } = await db
    .from("packages")
    .select("gmail_message_id, tracking_number")
    .eq("user_id", userId);

  const processedMsgIds = new Set<string>(
    (existingPkgs ?? [])
      .map((p: { gmail_message_id: string | null }) => p.gmail_message_id)
      .filter((id): id is string => id != null),
  );

  const knownTrackingNumbers = new Set<string>(
    (existingPkgs ?? []).map((p: { tracking_number: string }) => p.tracking_number),
  );

  const newRows: PackageUpsert[] = [];

  for (const msg of allMessages) {
    if (!msg.id || processedMsgIds.has(msg.id)) continue;
    try {
      const full = await gmail.users.messages.get({
        userId: "me",
        id: msg.id,
        format: "full",
      });
      const headers = full.data.payload?.headers ?? [];
      const subject = getHeader(headers, "subject");
      const from = getHeader(headers, "from");
      const bodyText = extractBodyText(full.data.payload) + "\n" + (full.data.snippet ?? "");
      const combined = `${subject} ${from}\n${bodyText}`;

      const trackings = extractTrackingNumbers(bodyText, `${subject} ${from}`);
      const eta = extractEta(combined);
      const retailer = parseFrom(from);

      // Detect delivery confirmed from subject ("Delivered: item" pattern) or body
      const isDelivered =
        /^delivered[:\s]/i.test(subject) || /\bhas\s+been\s+delivered\b/i.test(bodyText);
      const rowStatus = isDelivered ? "delivered" : "intransit";
      const rowDeliveredAt = isDelivered ? new Date().toISOString() : null;

      // Gate NOTRACK rows: require shipping-context keywords so Venmo transfers,
      // newsletters, etc. don't get treated as packages
      const SHIPPING_CONTEXT =
        /\b(package|shipment|ship(?:ped|ping)|tracking(?:\s*(?:number|#|:))?|carrier|courier|dispatch(?:ed)?|fulfillment)\b/i;

      if (trackings.length === 0) {
        // No recognized carrier format — store as NOTRACK if the email has an ETA
        // and looks like a genuine shipping notification
        if (eta !== null && SHIPPING_CONTEXT.test(combined)) {
          const syntheticKey = `NOTRACK-${msg.id}`;
          if (!knownTrackingNumbers.has(syntheticKey)) {
            knownTrackingNumbers.add(syntheticKey);
            newRows.push({
              user_id: userId,
              tracking_number: syntheticKey,
              carrier: "unknown",
              aftership_slug: null,
              aftership_id: null,
              description: subject,
              retailer,
              status: rowStatus,
              estimated_delivery: eta,
              delivered_at: rowDeliveredAt,
              gmail_message_id: msg.id,
              last_synced_at: new Date().toISOString(),
            });
          }
        }
      }

      for (const t of trackings) {
        if (knownTrackingNumbers.has(t.tracking_number)) continue;
        knownTrackingNumbers.add(t.tracking_number);
        newRows.push({
          user_id: userId,
          tracking_number: t.tracking_number,
          carrier: t.carrier,
          aftership_slug: null,
          aftership_id: null,
          description: subject,
          retailer,
          status: rowStatus,
          estimated_delivery: eta,
          delivered_at: rowDeliveredAt,
          gmail_message_id: msg.id,
          last_synced_at: new Date().toISOString(),
        });
      }
    } catch {
      // skip individual message errors
    }
  }

  if (newRows.length > 0) {
    const { error } = await db
      .from("packages")
      .upsert(newRows, { onConflict: "user_id,tracking_number" });
    if (error) throw new Error(`Failed to upsert packages: ${error.message}`);
  }

  await logSync(db, "packages", "ok", newRows.length);
  return { new: newRows.length };
}
