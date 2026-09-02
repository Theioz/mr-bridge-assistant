import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { BacklogStatus, MediaType } from "@/lib/types";

// Bulk commit for the CSV import (#690). POST /api/backlog does three round trips per
// item — a duplicate select, a max(priority) select, an insert — which is both ~1500
// queries for a 500-row export and a read-modify-write race on priority. This does the
// whole batch in one duplicate select, one max(priority) select per media_type, and one
// insert.
export const maxDuration = 60;

const MAX_ITEMS = 1000;
const MEDIA_TYPES: MediaType[] = ["game", "show", "movie", "book"];
const STATUSES: BacklogStatus[] = ["backlog", "active", "paused", "finished", "dropped"];

interface ImportItem {
  media_type: MediaType;
  title: string;
  creator: string | null;
  release_date: string | null;
  description: string | null;
  cover_url: string | null;
  external_id: string;
  external_source: string;
  metadata: Record<string, unknown> | null;
  status: BacklogStatus;
  rating: number | null;
  review: string | null;
  finished_at: string | null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** Validate one client-supplied row into an insertable shape, or say what is wrong. */
function coerce(raw: unknown, index: number): ImportItem | string {
  if (!raw || typeof raw !== "object") return `Item ${index}: not an object`;
  const r = raw as Record<string, unknown>;

  const media_type = r.media_type as MediaType;
  if (!MEDIA_TYPES.includes(media_type)) return `Item ${index}: invalid media_type`;

  const title = str(r.title);
  if (!title) return `Item ${index}: title is required`;

  const external_id = str(r.external_id);
  if (!external_id) return `Item ${index}: external_id is required`;

  const status = (r.status as BacklogStatus) ?? "backlog";
  if (!STATUSES.includes(status)) return `Item ${index}: invalid status`;

  let rating: number | null = null;
  if (r.rating !== null && r.rating !== undefined) {
    const n = Number(r.rating);
    if (!Number.isFinite(n) || n < 0 || n > 10) return `Item ${index}: rating must be 0–10`;
    rating = n;
  }

  return {
    media_type,
    title,
    creator: str(r.creator),
    release_date: str(r.release_date),
    description: str(r.description),
    cover_url: str(r.cover_url),
    external_id,
    external_source: str(r.external_source) ?? "manual",
    metadata:
      r.metadata && typeof r.metadata === "object" ? (r.metadata as Record<string, unknown>) : null,
    status,
    rating,
    review: str(r.review),
    finished_at: str(r.finished_at),
  };
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const raw = body?.items;
  if (!Array.isArray(raw))
    return NextResponse.json({ error: "items must be an array" }, { status: 400 });
  if (raw.length === 0) return NextResponse.json({ inserted: [], skipped: [] });
  if (raw.length > MAX_ITEMS) {
    return NextResponse.json({ error: `At most ${MAX_ITEMS} items per request` }, { status: 400 });
  }

  const items: ImportItem[] = [];
  for (let i = 0; i < raw.length; i++) {
    const coerced = coerce(raw[i], i);
    if (typeof coerced === "string") return NextResponse.json({ error: coerced }, { status: 400 });
    items.push(coerced);
  }

  const key = (i: Pick<ImportItem, "media_type" | "external_id">) =>
    `${i.media_type}:${i.external_id}`;
  const skipped: {
    media_type: MediaType;
    external_id: string;
    title: string;
    existing_id?: string;
  }[] = [];

  // Collapse repeats inside the payload before asking the database about them.
  const unique: ImportItem[] = [];
  const claimed = new Set<string>();
  for (const item of items) {
    if (claimed.has(key(item))) {
      skipped.push({
        media_type: item.media_type,
        external_id: item.external_id,
        title: item.title,
      });
      continue;
    }
    claimed.add(key(item));
    unique.push(item);
  }

  // One duplicate query for the whole batch. Re-running the same import lands here and
  // inserts nothing.
  const { data: existingRows, error: existingErr } = await supabase
    .from("backlog_items")
    .select("id, external_id, media_type")
    .eq("user_id", user.id)
    .in("external_id", [...new Set(unique.map((i) => i.external_id))]);
  if (existingErr) return NextResponse.json({ error: existingErr.message }, { status: 500 });

  const existing = new Map<string, string>();
  for (const row of existingRows ?? [])
    existing.set(`${row.media_type}:${row.external_id}`, row.id);

  const toInsert = unique.filter((item) => {
    const existing_id = existing.get(key(item));
    if (existing_id) {
      skipped.push({
        media_type: item.media_type,
        external_id: item.external_id,
        title: item.title,
        existing_id,
      });
      return false;
    }
    return true;
  });

  if (toInsert.length === 0) return NextResponse.json({ inserted: [], skipped });

  // Read the top of each affected stack once, then hand out max+1 … max+n in memory.
  const nextPriority = new Map<MediaType, number>();
  for (const media_type of [...new Set(toInsert.map((i) => i.media_type))]) {
    const { data: maxRow, error } = await supabase
      .from("backlog_items")
      .select("priority")
      .eq("user_id", user.id)
      .eq("media_type", media_type)
      .order("priority", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    nextPriority.set(media_type, (maxRow?.priority ?? -1) + 1);
  }

  const rows = toInsert.map((item) => {
    const priority = nextPriority.get(item.media_type)!;
    nextPriority.set(item.media_type, priority + 1);
    return { ...item, user_id: user.id, priority };
  });

  const { data: inserted, error } = await supabase.from("backlog_items").insert(rows).select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ inserted: inserted ?? [], skipped }, { status: 201 });
}
