/**
 * Backfill `recipes.ingredients_json` / `steps_json` from the legacy free-text columns.
 *
 * Run from web/:
 *   node --experimental-strip-types scripts/backfill-structured-recipes.ts          # dry run
 *   node --experimental-strip-types scripts/backfill-structured-recipes.ts --write  # apply
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.
 *
 * WHY A SCRIPT AND NOT A SQL MIGRATION
 *
 * The conversion needs the same quantity lexer the macro pipeline uses (`lexQuantity`), so that a
 * backfilled amount is read exactly the way a logged amount is. Reimplementing that in PL/pgSQL
 * would create a second parser that silently drifts from the first.
 *
 * THE SAFETY RULE: ALL-OR-NOTHING PER RECIPE
 *
 * A row with `quantity: null` is EXCLUDED from the macro total by design — that is what makes
 * "salt, to taste" behave. It also means a line whose amount we failed to read would silently
 * delete a real ingredient from a real total. The text path at least invents an amount and flags
 * the recipe low-confidence; converting it badly would look cleaner and be worse.
 *
 * So a recipe is converted only when EVERY line either yields an amount or is recognisably a
 * seasoning. Anything else leaves the whole recipe on the text path and is printed for a human to
 * fix in the editor. Measured on the live library at time of writing: 67 of 72 convert, and the 5
 * that don't genuinely have no amount written down anywhere ("Pasta, corn, spinach, green beans").
 *
 * MACROS ARE NOT RE-RESOLVED HERE.
 *
 * Existing totals were computed from the same ingredients and stay correct; re-resolving 67 recipes
 * would fire hundreds of USDA calls and change stored numbers in bulk with no one watching. The
 * structured path takes over the next time a recipe is edited or explicitly re-resolved.
 */
import { createClient } from "@supabase/supabase-js";
import { lexQuantity } from "../src/lib/nutrition/quantity.ts";
import { splitIngredientLines } from "../src/lib/units.ts";
import type { RecipeIngredient, RecipeStep } from "../src/lib/types.ts";

/** Lines that legitimately carry no amount. Kept narrow — see the safety rule above. */
const TRULY_AMOUNTLESS =
  /\b(to taste|to garnish|for garnish|to serve|zero[- ]cal|as needed|optional)\b/i;
const SEASONING = /\b(salt|pepper|powder|cumin|seasoning|spice|paprika|herbs?)\b/i;

/**
 * "kimchi 120 g", "Ribeye 0.78 lb (354g)" — the amount TRAILS the food.
 *
 * `lexQuantity` reads only a LEADING amount, deliberately: a trailing number in meal text is more
 * often a temperature or a year. Handling the trailing form here keeps that lexer untouched, and it
 * matters because rows written in August 2026 used exactly this shape.
 */
const TRAILING =
  /^(.*?)[\s,(]*(\d+(?:\.\d+)?)\s*(g|kg|ml|l|oz|lb|tbsp|tsp|cup|clove|can|slice)s?\b/i;

export function ingredientRowsFrom(text: string): {
  rows: RecipeIngredient[];
  unresolved: string[];
} {
  let lines = splitIngredientLines(text);
  // Semicolon prose, e.g. "cod 227 g; kimchi 120 g; 2 large eggs".
  if (lines.length === 1 && lines[0].includes(";")) {
    lines = lines[0]
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const rows: RecipeIngredient[] = [];
  const unresolved: string[] = [];

  for (let raw of lines) {
    raw = raw
      .replace(/^PER SERVING \([^)]*\)\.\s*/i, "")
      .replace(/\.$/, "")
      .trim();
    if (!raw) continue;

    const lead = lexQuantity(raw);
    if (lead) {
      const at = raw.indexOf(lead.source);
      const item = (at < 0 ? raw : raw.slice(at + lead.source.length))
        .trim()
        .replace(/^(of\s+|[,\-–—]\s*)/i, "");
      rows.push({ item: item || raw, quantity: lead.qty, unit: lead.unit });
      continue;
    }

    const tail = TRAILING.exec(raw);
    if (tail && tail[1].trim()) {
      const rest = raw
        .slice(tail[0].length)
        .trim()
        .replace(/^[),\s]+/, "");
      rows.push({
        item: tail[1].trim().replace(/[,(]$/, "").trim(),
        quantity: parseFloat(tail[2]),
        unit: tail[3].toLowerCase(),
        note: rest || null,
      });
      continue;
    }

    rows.push({ item: raw, quantity: null, unit: null });
    if (!TRULY_AMOUNTLESS.test(raw) && !SEASONING.test(raw)) unresolved.push(raw);
  }
  return { rows, unresolved };
}

/** Numbered or newline-separated instructions -> steps. Blank-line groups win over single lines. */
export function stepRowsFrom(text: string | null): RecipeStep[] | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  const chunks = (t.includes("\n\n") ? t.split(/\n{2,}/) : t.split("\n"))
    .map((c) => c.trim().replace(/^\d+[.)]\s*/, ""))
    .filter(Boolean);
  return chunks.length ? chunks.map((text, i) => ({ step: i + 1, text })) : null;
}

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

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
