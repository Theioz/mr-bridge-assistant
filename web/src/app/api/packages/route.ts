import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { lastSyncAgeSecs } from "@/lib/sync/log";
import type { Package } from "@/lib/types";

export interface PackagesApiResponse {
  packages: Package[];
  lastSyncedAt: string | null;
}

const DEMO_PACKAGES: Package[] = [
  {
    id: "demo-1",
    user_id: "demo",
    tracking_number: "1Z999AA10123456784",
    carrier: "ups",
    aftership_slug: "ups",
    aftership_id: null,
    description: "Your order has shipped",
    retailer: "Allbirds",
    status: "intransit",
    estimated_delivery: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    delivered_at: null,
    gmail_message_id: "demo-msg-1",
    last_synced_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  },
  {
    id: "demo-2",
    user_id: "demo",
    tracking_number: "9400111899223397081901",
    carrier: "usps",
    aftership_slug: "usps",
    aftership_id: null,
    description: "Your item has shipped",
    retailer: "Amazon",
    status: "outfordelivery",
    estimated_delivery: new Date().toISOString().slice(0, 10),
    delivered_at: null,
    gmail_message_id: "demo-msg-2",
    last_synced_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  },
];

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (user.id === process.env.DEMO_USER_ID) {
    return NextResponse.json({
      packages: DEMO_PACKAGES,
      lastSyncedAt: new Date().toISOString(),
    } satisfies PackagesApiResponse);
  }

  // Return active packages + anything delivered within the last 3 days
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("packages")
    .select("*")
    .eq("user_id", user.id)
    .or(`status.neq.delivered,delivered_at.gte.${threeDaysAgo}`)
    .order("estimated_delivery", { ascending: true, nullsFirst: false });

  if (error) {
    console.error("[/api/packages]", error);
    return NextResponse.json({ error: "Failed to fetch packages" }, { status: 500 });
  }

  // Get last sync time from sync_log for staleness check
  const ageSecs = await lastSyncAgeSecs(supabase, "packages");
  const lastSyncedAt =
    ageSecs !== null ? new Date(Date.now() - ageSecs * 1000).toISOString() : null;

  return NextResponse.json({
    packages: (data ?? []) as Package[],
    lastSyncedAt,
  } satisfies PackagesApiResponse);
}
