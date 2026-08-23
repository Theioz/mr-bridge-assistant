import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { audit, RECIPE_AUDIT_SELECT, type Row } from "@/lib/nutrition/recipe-audit";

/**
 * Weekly recipe-library drift report.
 *
 * WHY AN ENDPOINT AND NOT A HOST SCRIPT. `scripts/audit-recipes.ts` has existed since #673 and was
 * never run by anything — no CI job, no cron, no make target — so 29 recipes drifted past the heat
 * check it already implemented. Two constraints decided the shape of the fix:
 *
 *   * CI can't be the caller: the database is tailnet-only and unreachable from a GitHub runner.
 *   * The host can't be the caller either — **compute-core has no `node` installed**, so a
 *     TypeScript file cannot execute there at all. The app container is the only place with a
 *     runtime.
 *
 * So the crontab curls this, exactly like `/api/cron/sync` already does. Same bearer auth, same
 * log file, same host. The audit itself is shared with the CLI via `lib/nutrition/recipe-audit`;
 * two copies of a drift detector would be the very thing the detector is for.
 *
 * Read-only. It changes nothing about the recipes — it only reports and notifies.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ownerUserId = process.env.OWNER_USER_ID;
  if (!ownerUserId) {
    return NextResponse.json({ error: "OWNER_USER_ID not configured" }, { status: 500 });
  }

  const db = createServiceClient();
  const { data, error } = await db
    .from("recipes")
    .select(RECIPE_AUDIT_SELECT)
    .eq("user_id", ownerUserId)
    .order("name");

  if (error) {
    return NextResponse.json({ error: `recipe fetch failed: ${error.message}` }, { status: 502 });
  }

  const rows = (data ?? []) as unknown as Row[];
  const findings = audit(rows);

  const byKind: Record<string, number> = {};
  for (const f of findings) byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;

  // Silence is the normal case and must stay silent — a job that pings every week whether or not
  // anything is wrong gets muted, and then it is worth nothing again.
  if (findings.length) {
    const summary = Object.entries(byKind)
      .sort((a, b) => b[1] - a[1])
      .map(([kind, n]) => `${kind}: ${n}`)
      .join(", ");
    const title = `Recipe audit — ${findings.length} finding${findings.length === 1 ? "" : "s"}`;
    const body = `${rows.length} recipes scanned. ${summary}`;

    // In-app notification. Non-fatal: a failed insert must not fail the audit.
    await db
      .from("notifications")
      .insert({ user_id: ownerUserId, type: "recipe_audit", title, body })
      .then(undefined, () => undefined);

    const topic = process.env.NTFY_TOPIC;
    if (topic) {
      try {
        await fetch(`https://ntfy.sh/${topic}`, {
          method: "POST",
          headers: { Title: title, "Content-Type": "text/plain" },
          body,
        });
      } catch {
        // Push is best-effort; the JSON response and the in-app row are the durable record.
      }
    }
  }

  return NextResponse.json({
    scanned: rows.length,
    count: findings.length,
    byKind,
    findings,
  });
}
