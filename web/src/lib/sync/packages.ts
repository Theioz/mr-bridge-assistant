import { google } from "googleapis";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { gmail_v1 } from "googleapis";
import { logSync } from "./log";
import { getGoogleAuthClient } from "@/lib/google-auth";
import { createAfterShipTracking, getAfterShipTracking } from "@/lib/aftership";
import type { Package } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PackagesSyncResult {
  new: number;
  updated: number;
  delivered: number;
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
    // Prefer text/plain, then text/html, then recurse into other parts
    const plain = payload.parts.find((p) => p.mimeType === "text/plain");
    if (plain) return extractBodyText(plain);
    const html = payload.parts.find((p) => p.mimeType === "text/html");
    if (html) return extractBodyText(html);
    return payload.parts.map((p) => extractBodyText(p)).join("\n");
  }
  return "";
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

  // UPS: 1Z + 16 alphanumeric — highly distinctive
  for (const m of combined.matchAll(/\b(1Z[0-9A-Z]{16})\b/g)) {
    results.push({ tracking_number: m[1], carrier: "ups" });
  }

  // Amazon Logistics: TBA + 12 digits
  for (const m of combined.matchAll(/\b(TBA\d{12})\b/g)) {
    results.push({ tracking_number: m[1], carrier: "amazon" });
  }

  // USPS: 22-digit numbers starting with 9 (94xxx, 93xxx, 92xxx, 95xxx)
  for (const m of combined.matchAll(/\b(9[0-9]{21})\b/g)) {
    results.push({ tracking_number: m[1], carrier: "usps" });
  }

  // FedEx: 15 or 20 digits, only when FedEx is mentioned in context
  if (/fedex|federal express/i.test(combined)) {
    for (const m of combined.matchAll(/\b(\d{15}|\d{20})\b/g)) {
      results.push({ tracking_number: m[1], carrier: "fedex" });
    }
  }

  // DHL: 10-11 digits, only when DHL is mentioned
  if (/\bDHL\b/i.test(combined)) {
    for (const m of combined.matchAll(/\b(\d{10,11})\b/g)) {
      results.push({ tracking_number: m[1], carrier: "dhl" });
    }
  }

  // Dedup by tracking_number (keep first occurrence)
  const seen = new Set<string>();
  return results.filter((r) => {
    if (seen.has(r.tracking_number)) return false;
    seen.add(r.tracking_number);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Status normalization
// ---------------------------------------------------------------------------

function normalizeTag(tag: string | null): string {
  if (!tag) return "pending";
  return tag.toLowerCase().replace(/\s+/g, "");
}

// ---------------------------------------------------------------------------
// Main sync function
// ---------------------------------------------------------------------------

export async function syncPackages(
  db: SupabaseClient,
  userId: string,
): Promise<PackagesSyncResult> {
  const apiKey = process.env.AFTERSHIP_API_KEY;
  if (!apiKey) throw new Error("AFTERSHIP_API_KEY not configured");

  // ── Step 1: Scan Gmail ──────────────────────────────────────────────────────
  const auth = await getGoogleAuthClient({ db, userId });
  const gmail = google.gmail({ version: "v1", auth });

  const listRes = await gmail.users.messages.list({
    userId: "me",
    q: 'newer_than:30d subject:(shipped OR "on its way" OR "out for delivery" OR "delivery update" OR "has been shipped" OR "your order is on its way")',
    maxResults: 30,
  });
  const messages = listRes.data.messages ?? [];

  // ── Step 2: Determine which messages and tracking numbers are already known ─
  const { data: existingPkgs } = await db
    .from("packages")
    .select(
      "gmail_message_id, tracking_number, status, aftership_slug, aftership_id, description, retailer, estimated_delivery, delivered_at",
    )
    .eq("user_id", userId);

  const processedMsgIds = new Set<string>(
    (existingPkgs ?? [])
      .map((p: { gmail_message_id: string | null }) => p.gmail_message_id)
      .filter((id): id is string => id != null),
  );

  const knownTrackingNumbers = new Set<string>(
    (existingPkgs ?? []).map((p: { tracking_number: string }) => p.tracking_number),
  );

  // ── Step 3: Extract tracking numbers from new messages ─────────────────────
  interface Extracted {
    tracking_number: string;
    carrier: string;
    gmail_message_id: string;
    retailer: string;
    description: string;
  }
  const extracted: Extracted[] = [];

  for (const msg of messages) {
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
      const trackings = extractTrackingNumbers(bodyText, `${subject} ${from}`);
      const retailer = parseFrom(from);
      for (const t of trackings) {
        if (!knownTrackingNumbers.has(t.tracking_number)) {
          extracted.push({
            ...t,
            gmail_message_id: msg.id,
            retailer,
            description: subject,
          });
          knownTrackingNumbers.add(t.tracking_number);
        }
      }
    } catch {
      // skip individual message errors
    }
  }

  // ── Step 4: Create AfterShip trackings for newly discovered numbers ─────────
  let newCount = 0;
  const newRows: PackageUpsert[] = [];

  const createResults = await Promise.allSettled(
    extracted.map(async (e) => {
      const aftership = await createAfterShipTracking(apiKey, e.tracking_number);
      return { ...e, aftership };
    }),
  );

  for (const r of createResults) {
    if (r.status === "rejected") continue;
    const { tracking_number, carrier, gmail_message_id, retailer, description, aftership } =
      r.value;
    newCount++;
    newRows.push({
      user_id: userId,
      tracking_number,
      carrier: aftership.slug ?? carrier,
      aftership_slug: aftership.slug ?? null,
      aftership_id: aftership.id ?? null,
      description,
      retailer,
      status: normalizeTag(aftership.tag),
      estimated_delivery: aftership.expected_delivery?.slice(0, 10) ?? null,
      delivered_at: null,
      gmail_message_id,
      last_synced_at: new Date().toISOString(),
    });
  }

  // ── Step 5: Refresh existing active packages from AfterShip ────────────────
  let updatedCount = 0;
  let deliveredCount = 0;
  const refreshRows: PackageUpsert[] = [];

  type ActivePkg = Pick<
    Package,
    | "tracking_number"
    | "carrier"
    | "aftership_slug"
    | "aftership_id"
    | "description"
    | "retailer"
    | "estimated_delivery"
    | "delivered_at"
    | "gmail_message_id"
  >;

  const activePkgs = ((existingPkgs ?? []) as (ActivePkg & { status: string | null })[]).filter(
    (p) => p.status !== "delivered" && p.status !== "expired" && p.aftership_slug,
  );

  const refreshResults = await Promise.allSettled(
    activePkgs.map(async (pkg) => {
      const aftership = await getAfterShipTracking(
        apiKey,
        pkg.aftership_slug!,
        pkg.tracking_number,
      );
      return { pkg, aftership };
    }),
  );

  for (const r of refreshResults) {
    if (r.status === "rejected") continue;
    const { pkg, aftership } = r.value;
    const status = normalizeTag(aftership.tag);
    if (status === "delivered") deliveredCount++;
    else updatedCount++;
    refreshRows.push({
      user_id: userId,
      tracking_number: pkg.tracking_number,
      carrier: pkg.carrier,
      aftership_slug: pkg.aftership_slug,
      aftership_id: aftership.id ?? pkg.aftership_id,
      description: pkg.description,
      retailer: pkg.retailer,
      status,
      estimated_delivery: aftership.expected_delivery?.slice(0, 10) ?? pkg.estimated_delivery,
      delivered_at: status === "delivered" ? new Date().toISOString() : pkg.delivered_at,
      gmail_message_id: pkg.gmail_message_id,
      last_synced_at: new Date().toISOString(),
    });
  }

  // ── Step 6: Upsert all rows ─────────────────────────────────────────────────
  const allRows = [...newRows, ...refreshRows];
  if (allRows.length > 0) {
    const { error } = await db
      .from("packages")
      .upsert(allRows, { onConflict: "user_id,tracking_number" });
    if (error) throw new Error(`Failed to upsert packages: ${error.message}`);
  }

  await logSync(db, "packages", "ok", allRows.length);
  return { new: newCount, updated: updatedCount, delivered: deliveredCount };
}
