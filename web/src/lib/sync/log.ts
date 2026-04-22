import type { SupabaseClient } from "@supabase/supabase-js";

export async function logSync(
  db: SupabaseClient,
  source: string,
  status: string,
  rowsWritten: number,
): Promise<void> {
  await db.from("sync_log").insert({ source, status, records_written: rowsWritten });
}

/** Returns seconds since last successful sync, or null if never synced. */
export async function lastSyncAgeSecs(
  db: SupabaseClient,
  source: string,
): Promise<number | null> {
  const { data } = await db
    .from("sync_log")
    .select("synced_at")
    .eq("source", source)
    .eq("status", "ok")
    .order("synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.synced_at) return null;
  return (Date.now() - new Date(data.synced_at).getTime()) / 1000;
}

export type SyncStatus = { syncedAt: string; status: "ok" | "error" | "partial" };

/** Returns the most recent sync row for a source regardless of status, or null if never synced. */
export async function lastSyncStatus(
  db: SupabaseClient,
  source: string,
): Promise<SyncStatus | null> {
  const { data } = await db
    .from("sync_log")
    .select("synced_at, status")
    .eq("source", source)
    .order("synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.synced_at) return null;
  return { syncedAt: data.synced_at, status: data.status as SyncStatus["status"] };
}
