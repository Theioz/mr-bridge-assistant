/**
 * Backfill `recipes.ingredients_json` / `steps_json` from the legacy free-text columns.
 *
 * Run from web/:
 *   node --experimental-strip-types scripts/backfill-structured-recipes.ts          # dry run
 *   node --experimental-strip-types scripts/backfill-structured-recipes.ts --write  # apply
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.
 *
 * This file is IO only. The conversion — and the safety rule that decides whether a recipe may be
 * converted at all — lives in src/lib/nutrition/recipe-backfill.ts, where the tests can reach it
 * without pulling the Supabase client into a dependency-free test job.
 *
 * MACROS ARE NOT RE-RESOLVED HERE.
 *
 * Existing totals were computed from the same ingredients and stay correct; re-resolving 66 recipes
 * would fire hundreds of USDA calls and change stored numbers in bulk with no one watching. The
 * structured path takes over the next time a recipe is edited or explicitly re-resolved.
 */
import { createClient } from "@supabase/supabase-js";
import { ingredientRowsFrom, stepRowsFrom } from "../src/lib/nutrition/recipe-backfill.ts";

async function main() {
  const write = process.argv.includes("--write");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  const db = createClient(url, key);

  const { data, error } = await db
    .from("recipes")
    .select("id, name, ingredients, instructions, ingredients_json")
    .order("name");
  if (error) throw new Error(error.message);

  let converted = 0;
  const blocked: { name: string; unresolved: string[] }[] = [];

  for (const r of data ?? []) {
    if (Array.isArray(r.ingredients_json) && r.ingredients_json.length) continue; // already done
    const text = (r.ingredients as string | null)?.trim();
    if (!text) continue;

    const { rows, unresolved } = ingredientRowsFrom(text);
    if (unresolved.length) {
      blocked.push({ name: r.name as string, unresolved });
      continue;
    }

    converted++;
    if (write) {
      const { error: e } = await db
        .from("recipes")
        .update({ ingredients_json: rows, steps_json: stepRowsFrom(r.instructions as string) })
        .eq("id", r.id);
      if (e) throw new Error(`${r.name}: ${e.message}`);
    } else {
      console.log(`${r.name}\n   ${JSON.stringify(rows)}`);
    }
  }

  console.log(`\n${write ? "converted" : "would convert"}: ${converted}`);
  console.log(`left on the text path (need an amount written down): ${blocked.length}`);
  for (const b of blocked) console.log(`   ${b.name}\n      - ${b.unresolved.join("\n      - ")}`);
  if (!write) console.log("\nDry run. Re-run with --write to apply.");
}

// Only run when invoked directly. Importing this module for its exported converters — which the
// tests and any ad-hoc tooling do — must not execute main() and demand credentials.
if (process.argv[1] && import.meta.filename === process.argv[1]) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
