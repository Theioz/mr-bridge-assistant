/**
 * Report every recipe that violates a stored-data invariant. Read-only — it changes nothing.
 *
 * WHY THIS EXISTS
 *
 * Two of this project's conventions have now drifted silently for weeks at a time. The spoon-unit
 * rule was applied by hand across 25 recipes on 2026-07-31 and every recipe written afterwards
 * ignored it, until a human noticed. `macros_computed_at` being absent made four planned meals
 * unloggable, and that was found by accident too. The pattern is not carelessness; it is that
 * nothing looks. A rule with no reporter is a rule that decays to a suggestion.
 *
 * The write path (`parseIngredientRows`) and the database trigger both REJECT bad data going
 * forward. This is the other half: it tells you what is already stored, including rows written
 * before those guards existed and rows written by tooling that talks to PostgREST directly.
 *
 * Usage, from web/:
 *   node --experimental-strip-types scripts/audit-recipes.ts
 *   node --experimental-strip-types scripts/audit-recipes.ts --json
 *
 * Needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and OWNER_USER_ID. Exits 1 if anything is found,
 * so it can gate a cron or a CI job.
 */
import { spoonViolations } from "../src/lib/nutrition/recipe-structured.ts";
import type { RecipeIngredient, RecipeStep } from "../src/lib/types.ts";

interface Row {
  id: string;
  name: string;
  ingredients_json: RecipeIngredient[] | null;
  steps_json: RecipeStep[] | null;
  instructions: string | null;
  typical_portions: number | null;
  calories: number | null;
  macros_computed_at: string | null;
  metadata: Record<string, unknown> | null;
}

interface Finding {
  kind: string;
  recipe: string;
  detail: string;
}

/** A single plate above this is almost certainly a batch that forgot to declare its portions.
 *  Set from the library's real spread: the largest genuine single serving is ~1050 kcal (the
 *  ribeye), and the smallest known batch is 1562. Anything past this deserves a human look. */
const SINGLE_PLATE_CEILING = 1200;

function audit(rows: Row[]): Finding[] {
  const out: Finding[] = [];
  for (const r of rows) {
    const ings = r.ingredients_json ?? [];
    const quantified = ings.filter((i) => typeof i.quantity === "number" && i.quantity > 0);

    for (const v of spoonViolations(r.ingredients_json)) {
      out.push({
        kind: "spoon-unit",
        recipe: r.name,
        detail: `"${v.item}" is ${v.grams} g — should be ${v.suggestion}`,
      });
    }

    const unpinned = quantified.filter((i) => !i.fdc_id);
    if (unpinned.length) {
      out.push({
        kind: "unpinned-fdc-id",
        recipe: r.name,
        // Without a pin a re-resolve re-runs USDA search, which has matched avocado OIL to an
        // avocado and sweet potato to sweet potato LEAVES — both passing the plausibility guard.
        detail: `${unpinned.length}/${quantified.length} ingredients unpinned: ${unpinned
          .map((i) => i.item)
          .slice(0, 4)
          .join(", ")}${unpinned.length > 4 ? "…" : ""}`,
      });
    }

    // A batch whose portions are undeclared stores the whole cook where every consumer expects one
    // serving, so "Ate this" logs the entire batch into meal_log for a single sitting.
    if ((r.calories ?? 0) > SINGLE_PLATE_CEILING && (r.typical_portions ?? 1) <= 1) {
      out.push({
        kind: "undeclared-batch",
        recipe: r.name,
        detail: `${r.calories} kcal stored as one serving with typical_portions=${r.typical_portions}`,
      });
    }

    if (r.calories != null && !r.macros_computed_at) {
      out.push({
        kind: "unstamped-macros",
        recipe: r.name,
        // macros_computed_at is the gate: without it the recipe renders as a stub and "Ate this"
        // marks the plan row eaten while writing no meal_log row at all.
        detail: `has ${r.calories} kcal but no macros_computed_at — renders as a stub, logs nothing`,
      });
    }

    if (r.steps_json?.length === 1 && r.steps_json[0].text.length > 200) {
      out.push({
        kind: "single-step-blob",
        recipe: r.name,
        detail: `the whole method is one ${r.steps_json[0].text.length}-char step`,
      });
    }

    if (!r.steps_json?.length && r.instructions?.trim()) {
      out.push({ kind: "no-structured-steps", recipe: r.name, detail: "instructions never split" });
    }
  }
  return out;
}

async function main() {
  const url = process.env.SUPABASE_URL?.replace("host.docker.internal", "localhost");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const owner = process.env.OWNER_USER_ID;
  if (!url || !key || !owner)
    throw new Error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and OWNER_USER_ID are required");

  const select =
    "id,name,ingredients_json,steps_json,instructions,typical_portions,calories,macros_computed_at,metadata";
  const res = await fetch(
    `${url}/rest/v1/recipes?user_id=eq.${owner}&select=${select}&order=name`,
    {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    },
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

// Only run when invoked directly, so `audit` stays importable by tests.
if (process.argv[1] && import.meta.filename === process.argv[1]) {
  main().catch((e) => {
    console.error(e);
    process.exit(2);
  });
}

export { audit, SINGLE_PLATE_CEILING };
export type { Row, Finding };
