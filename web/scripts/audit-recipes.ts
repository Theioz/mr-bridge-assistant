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
import {
  gochujangLabelViolations,
  riceNamingViolations,
  spoonViolations,
} from "../src/lib/nutrition/recipe-structured.ts";
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

/**
 * A timed cooking step has to say how hot.
 *
 * "Simmer 40 min." is a real step that was really written, and on 2026-08-13 it burned a chili to
 * the bottom of the pan and dried it out — the timer did exactly what the step said. A duration
 * without a heat setting is an instruction to walk away from a pan at an unknown temperature.
 *
 * `simmer`, `boil` and `saute` deliberately do NOT count as heat cues: they name a target state
 * without saying what to set the burner to, which is precisely the gap that caused the burn. What
 * counts is a burner level, an oven temperature, or an explicit instruction that the heat is off.
 */
const HEAT_CUE = new RegExp(
  [
    // Burner levels and oven temperatures — the unambiguous forms.
    String.raw`\b(low|medium|high|medium-low|medium-high|med-high)\b`,
    String.raw`\b\d{3}\s?°?\s?[FC]\b`,
    // Explicitly no heat.
    String.raw`\boff the heat\b|\bresidual heat\b|\bheat off\b`,
    // Plain-English cues that DO pin the temperature, even without a burner setting. "Screaming
    // hot pan" and "boiling water" leave no doubt what to do; excluding them was flagging steps
    // that were already clear, and a check that cries wolf gets ignored.
    String.raw`\b(screaming|ripping|smoking|hot)\s+(hot\s+)?(pan|skillet|oven)\b`,
    // "boiling salted water" and "boiling well-salted water" are the same instruction as "boiling
    // water" — allow an adjective or two between them rather than demanding the exact phrase.
    String.raw`\bdry hot pan\b|\bboiling(\s+\w+){0,2}\s+water\b|\brolling boil\b|\bsteamer\b`,
  ].join("|"),
  "i",
);

/**
 * Timed steps where nothing is being heated at all.
 *
 * Resting a steak, pressing tofu, thawing shrimp, brining a breast, bringing meat up from the
 * fridge — these take time and involve no burner, so demanding a heat setting is nonsense. On the
 * first live run 17 of 69 flagged steps were this, which is a false-positive rate that would have
 * had me "correcting" steps that were already right.
 */
const NON_THERMAL =
  /\b(rest|rested|resting|thaw|thawed|press(ed)?|brine[d]?|marinate[d]?|chill(ed)?|soak(ed)?|salt(ed)? .*(ahead|before)|out of the fridge|room temperature|come to temp|sit|stand|cool(ed)? (uncovered|completely)?)\b/i;

/** Steps short enough to be unattended are exempt — a 1-2 minute step cannot scorch unwatched. */
const UNATTENDED_FLOOR_MINS = 3;

function timedStepsMissingHeat(steps: RecipeStep[] | null): string[] {
  if (!steps) return [];
  return steps
    .filter((s) => {
      const inlineMins = /\b(\d+)(?:\s*[-–]\s*\d+)?\s*min\b/i.exec(s.text);
      const mins = s.duration_mins ?? (inlineMins ? Number(inlineMins[1]) : 0);
      if (mins < UNATTENDED_FLOOR_MINS) return false;
      const all = [s.text, ...(s.tips ?? [])].join(" ");
      if (HEAT_CUE.test(all)) return false;

      // Only exempt as non-thermal when the step names NO cooking verb — "sear 5 min then rest"
      // still needs a heat level for the searing half.
      //
      // Look for that verb in the INSTRUCTION ONLY: the first sentence, tips excluded. Cooking
      // words turn up constantly in the surrounding rationale — "wet tofu will not BROWN", "pat
      // them dry or they STEAM grey", "dry surface is the whole game in an air FRYER", and a tip
      // on a resting step that mentions a "ROASTED vegetable". Every one of those was a false
      // positive on the live run, and each would have had a heat level bolted onto a step that
      // heats nothing.
      const instruction = s.text.split(/(?<=[.!?])\s/)[0];
      const cooks =
        /\b(sear|brown|fry|saut|simmer|boil|roast|bake|steam|grill|braise|blister|char|wilt|reduce|toast)/i;
      return !(NON_THERMAL.test(all) && !cooks.test(instruction));
    })
    .map((s) => `step ${s.step}: "${s.text.slice(0, 60)}${s.text.length > 60 ? "…" : ""}"`);
}

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

    for (const v of gochujangLabelViolations(ings)) {
      out.push({ kind: "gochujang-label", recipe: r.name, detail: `"${v.item}" — ${v.detail}` });
    }

    for (const v of riceNamingViolations(ings)) {
      out.push({
        kind: "rice-not-annotatable",
        recipe: r.name,
        detail: `"${v.item}" — ${v.detail}`,
      });
    }

    const noHeat = timedStepsMissingHeat(r.steps_json);
    if (noHeat.length) {
      out.push({
        kind: "timed-step-no-heat",
        recipe: r.name,
        detail: `${noHeat.length} timed step(s) with no heat setting — ${noHeat.join("; ")}`,
      });
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

export { audit, timedStepsMissingHeat, SINGLE_PLATE_CEILING, UNATTENDED_FLOOR_MINS };
export type { Row, Finding };
