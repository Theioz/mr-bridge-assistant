/**
 * Report every recipe that violates a stored-data invariant. Read-only — it changes nothing.
 *
 * The checks live in `src/lib/nutrition/recipe-audit.ts` because this is no longer the only caller:
 * `GET /api/cron/audit-recipes` runs the same `audit()` weekly from the compute-core crontab. This
 * script stays as the by-hand entry point with human-readable output.
 *
 * Usage, from web/:
 *   node --experimental-strip-types scripts/audit-recipes.ts
 *   node --experimental-strip-types scripts/audit-recipes.ts --json
 *
 * Needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and OWNER_USER_ID. Exits 1 if anything is found.
 */
import {
  audit,
  RECIPE_AUDIT_SELECT,
  type Finding,
  type Row,
} from "../src/lib/nutrition/recipe-audit.ts";

async function main() {
  const url = process.env.SUPABASE_URL?.replace("host.docker.internal", "localhost");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const owner = process.env.OWNER_USER_ID;
  if (!url || !key || !owner)
    throw new Error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and OWNER_USER_ID are required");

  const res = await fetch(
    `${url}/rest/v1/recipes?user_id=eq.${owner}&select=${RECIPE_AUDIT_SELECT}&order=name`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  if (!res.ok) throw new Error(`recipe fetch failed: ${res.status} ${await res.text()}`);
  const rows = (await res.json()) as Row[];

  const findings = audit(rows);
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ scanned: rows.length, findings }, null, 2));
  } else {
    const byKind = new Map<string, Finding[]>();
    for (const f of findings) byKind.set(f.kind, [...(byKind.get(f.kind) ?? []), f]);
    console.log(`scanned ${rows.length} recipes\n`);
    for (const [kind, list] of [...byKind].sort((a, b) => b[1].length - a[1].length)) {
      console.log(`${kind}  (${list.length})`);
      for (const f of list) console.log(`   ${f.recipe}\n      ${f.detail}`);
      console.log();
    }
    console.log(findings.length ? `${findings.length} findings` : "clean");
  }
  if (findings.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
