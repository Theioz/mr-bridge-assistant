/**
 * Pure conversion from the legacy free-text ingredient columns to structured rows.
 *
 * Split out of scripts/backfill-structured-recipes.ts so it can be tested. The CI `node` job runs
 * `node --test` with NO npm install — deliberately, so unit tests stay pure logic — so a test that
 * reaches a module importing @supabase/supabase-js fails to resolve. Keeping the parsing here and
 * the IO in the script means the interesting half is covered and the boring half needs no deps.
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
 * fix in the editor. Measured on the live library at time of writing: 66 of 72 convert, and the 6
 * that don't genuinely have no amount written down anywhere ("Pasta, corn, spinach, green beans",
 * "Onion, bell pepper, marinara", "cherry tomatoes").
 *
 * MACROS ARE NOT RE-RESOLVED HERE.
 *
 * Existing totals were computed from the same ingredients and stay correct; re-resolving 66 recipes
 * would fire hundreds of USDA calls and change stored numbers in bulk with no one watching. The
 * structured path takes over the next time a recipe is edited or explicitly re-resolved.
 */
import { lexQuantity } from "./quantity.ts";
import { splitIngredientLines } from "../units.ts";
import type { RecipeIngredient, RecipeStep } from "../types.ts";

/** Lines that legitimately carry no amount. Kept narrow — see the safety rule above. */
const TRULY_AMOUNTLESS =
  /\b(to taste|to garnish|for garnish|to serve|zero[- ]cal|as needed|optional)\b/i;

/**
 * Ingredients that contribute ~nothing and are safe to carry at `quantity: null`.
 *
 * EVERY comma/&/plus-separated component of a line must match. A substring test over the whole
 * line is not good enough and the first draft of this proved it: `/\bpepper\b/` matched
 * "Onion, bell pepper, marinara", so a line carrying marinara and onion — real calories — was
 * classified as seasoning and would have been silently dropped from Turkey Pasta's total. That is
 * precisely the failure the all-or-nothing rule exists to prevent, defeated by its own allowlist.
 *
 * So the unit of judgement is the component, not the line, and anything not on this list blocks the
 * whole recipe for a human to look at.
 */
const NEGLIGIBLE_COMPONENT =
  /^(salt|black pepper|white pepper|pepper|peppercorns?|garlic|garlic powder|onion powder|chili powder|chilli powder|cumin|paprika|oregano|thyme|basil|parsley|cilantro|coriander|cinnamon|seasoning|spices?|herbs?|lemon|lime|lemon juice|lime juice|water|no oil|zero[- ]cal)$/i;

/** True only when every component of the line is individually negligible. */
function isAllNegligible(line: string): boolean {
  const parts = line
    .replace(/\([^)]*\)/g, "") // drop parentheticals like "(no oil)"
    .split(/,|\band\b|&|\+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 0 && parts.every((p) => NEGLIGIBLE_COMPONENT.test(p));
}

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
    if (!TRULY_AMOUNTLESS.test(raw) && !isAllNegligible(raw)) unresolved.push(raw);
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
