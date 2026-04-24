import { z } from "zod";
import JSZip from "jszip";
import { createClient } from "@/lib/supabase/server";
import { EXPORT_TABLES, rangeToSinceIso } from "@/lib/export/tables";
import { toCSV } from "@/lib/export/csv";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BodySchema = z.object({
  format: z.enum(["json", "csv"]),
  range: z.enum(["all", "30d", "90d", "1y"]),
});

const MANIFEST_SCHEMA_VERSION = 1;

export async function POST(req: Request) {
  let parsed;
  try {
    parsed = BodySchema.safeParse(await req.json());
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!parsed.success) {
    return Response.json({ error: "Invalid body: expected { format, range }" }, { status: 400 });
  }
  const { format, range } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const sinceIso = rangeToSinceIso(range);
  const rowCounts: Record<string, number> = {};
  const errors: Record<string, string> = {};

  const tableResults = await Promise.all(
    EXPORT_TABLES.map(async (t) => {
      try {
        let query = supabase.from(t.name).select(t.columns.join(","));
        if (!t.scopedByRls) {
          query = query.eq("user_id", user.id);
        }
        if (t.dateColumn && sinceIso) {
          query = query.gte(t.dateColumn, sinceIso);
        }
        const { data, error } = await query;
        if (error) throw error;
        const rows = (data ?? []) as unknown as Record<string, unknown>[];
        rowCounts[t.name] = rows.length;
        return { table: t, rows };
      } catch (err) {
        errors[t.name] = err instanceof Error ? err.message : String(err);
        rowCounts[t.name] = 0;
        return { table: t, rows: [] as Record<string, unknown>[] };
      }
    }),
  );

  const exportedAt = new Date();
  const manifest = {
    schema_version: MANIFEST_SCHEMA_VERSION,
    exported_at: exportedAt.toISOString(),
    user_id: user.id,
    format,
    range,
    since: sinceIso,
    row_counts: rowCounts,
    errors,
    excluded_tables: [
      "chat_sessions",
      "chat_messages",
      "user_equipment",
      "notifications",
      "packages",
      "stocks_cache",
      "sports_cache",
      "user_integrations",
      "sync_log",
      "timer_state",
    ],
  };

  const zip = new JSZip();
  zip.file("_manifest.json", JSON.stringify(manifest, null, 2));

  for (const { table, rows } of tableResults) {
    if (format === "json") {
      zip.file(`${table.fileBasename}.json`, JSON.stringify(rows, null, 2));
    } else {
      zip.file(`${table.fileBasename}.csv`, toCSV(rows, table.columns));
    }
  }

  const content = await zip.generateAsync({ type: "nodebuffer" });
  const yyyymmdd = exportedAt.toISOString().slice(0, 10).replace(/-/g, "");
  const filename = `mr-bridge-export-${yyyymmdd}.zip`;

  return new Response(new Uint8Array(content), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "Content-Length": String(content.byteLength),
    },
  });
}
