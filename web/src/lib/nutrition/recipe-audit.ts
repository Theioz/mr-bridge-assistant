/**
 * The recipe-library audit: every stored-data invariant, in one place.
 *
 * WHY THIS IS A LIB AND NOT JUST THE SCRIPT
 *
 * It has two callers now. `scripts/audit-recipes.ts` runs it by hand from `web/`, and
 * `GET /api/cron/audit-recipes` runs it weekly from the compute-core crontab. Those had to share an
 * implementation: two copies of a drift detector is the exact failure the detector exists to catch.
 *
 * WHY THE CRON CALLER EXISTS AT ALL — the finding that produced this file
 *
 * `timedStepsMissingHeat` shipped in #673 and **29 recipes drifted straight past it**, because the
 * script was never wired to anything: no CI job, no cron, no make target. It already exited 1 "so
 * it can gate a cron or a CI job" and nothing gated on it. A reporter nobody runs is worth exactly
 * as much as the prose convention it replaced.
 *
 * CI cannot be that caller: the database is tailnet-only and unreachable from a GitHub runner. And
 * the host cannot run this file directly — **compute-core has no `node` installed**. The app
 * container does, which is why this is reachable over HTTP rather than as a host script.
 */
import {
  gochujangLabelViolations,
  riceNamingViolations,
  spoonViolations,
} from "./recipe-structured.ts";
import { isPlausibleMatch } from "./fdc.ts";
import { normalizeFoodName } from "./inventory-draw.ts";
import type { RecipeIngredient, RecipeStep } from "../types.ts";

export interface Row {
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

export interface Finding {
  kind: string;
  recipe: string;
  detail: string;
}

/** A single plate above this is almost certainly a batch that forgot to declare its portions.
 *  Set from the library's real spread: the largest genuine single serving is ~1050 kcal (the
 *  ribeye), and the smallest known batch is 1562. Anything past this deserves a human look. */
export const SINGLE_PLATE_CEILING = 1200;

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
export const HEAT_CUE = new RegExp(
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
export const NON_THERMAL =
  /\b(rest|rested|resting|thaw|thawed|press(ed)?|brine[d]?|marinate[d]?|chill(ed)?|soak(ed)?|salt(ed)? .*(ahead|before)|out of the fridge|room temperature|come to temp|sit|stand|cool(ed)? (uncovered|completely)?)\b/i;

/** Steps short enough to be unattended are exempt — a 1-2 minute step cannot scorch unwatched. */
export const UNATTENDED_FLOOR_MINS = 3;

export function timedStepsMissingHeat(steps: RecipeStep[] | null): string[] {
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

export function audit(rows: Row[]): Finding[] {
  const out: Finding[] = [...pinInconsistencies(rows)];
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

// ── Is the pin the RIGHT food? ──────────────────────────────────────────────
//
// Every other check here verifies a pin for CONSISTENCY — that one id is not used for two
// differently named lines, that the arithmetic adds up. None of them ask whether the id names the
// food on the line, which is the failure that keeps recurring:
//
//   * #672 — gochujang priced as SRIRACHA (171188) and as CONDENSED BLACK BEAN SOUP (171141).
//   * #707 — `frozen blueberries` pinned to 171706, "Avocados, raw, California".
//   * found by this check on first run — `scallions` pinned to 170003, "Onions, CANNED".
//
// All three were found by a person happening to look. They survive because a wrong pin is
// invisible in the totals: in #707 the pin had never even been spent — the stored macros came from
// the right food — so every number on the page was correct while the citation was wrong. There is
// nothing to notice.
//
// That makes it a landmine rather than an error. Re-resolving is routine, and re-resolving #707
// would have taken a correct recipe from 256 to 321 kcal and 2.1 to 9.9 g fat.
//
// These two functions are PURE and take the descriptions already resolved. The audit stays
// synchronous, its callers own the network, and the checks stay testable without one.

/**
 * One food, two different pins.
 *
 * Needs no network, so it runs inside `audit()` and is always available — unlike the description
 * checks below, which cost an FDC lookup each. It catches what those cannot: a pin that describes a
 * *plausible* food which is nonetheless not the one the rest of the library uses.
 *
 * This is how the real defects actually look. `scallions` is pinned to 170005 ("Onions, spring or
 * scallions") in one recipe and 170003 ("Onions, CANNED") in another — and 170003 shares the word
 * "onion", so a description check passes it. `chicken breast` is pinned to the breast record ten
 * times and once to "Chicken, broilers or fryers, MEAT ONLY". `olive oil` is pinned four times to
 * olive oil and twice to "Oil, corn, peanut, AND olive", a blend.
 *
 * The disagreement is the signal. A library that prices one food two ways is wrong at least once,
 * whichever way is right — and it is wrong invisibly, because each individual line reads fine.
 *
 * Names are compared through `normalizeFoodName` (shared with the inventory draw) so "chicken
 * breast, boneless skinless" and "Chicken breast raw" count as the same food.
 */
export function pinInconsistencies(rows: Row[]): Finding[] {
  const byFood = new Map<string, Map<number, number>>();
  for (const r of rows) {
    for (const i of r.ingredients_json ?? []) {
      if (!i.fdc_id) continue;
      const key = [...normalizeFoodName(i.item)].sort().join(" ");
      if (!key) continue;
      const ids = byFood.get(key) ?? new Map<number, number>();
      ids.set(i.fdc_id, (ids.get(i.fdc_id) ?? 0) + 1);
      byFood.set(key, ids);
    }
  }

  const out: Finding[] = [];
  for (const [food, ids] of [...byFood].sort()) {
    if (ids.size < 2) continue;
    const spread = [...ids]
      .sort((a, b) => b[1] - a[1])
      .map(([id, n]) => `${id} (${n}x)`)
      .join(" vs ");
    out.push({
      kind: "pin-inconsistent",
      // Library-wide rather than per-recipe: the defect is the disagreement, and naming one of the
      // two recipes would imply that one is the wrong one before anyone has looked.
      recipe: "(library)",
      detail: `"${food}" is pinned ${ids.size} different ways — ${spread}. One food, one record: pick one.`,
    });
  }
  return out;
}

/**
 * A note that explains the substitution silences the finding.
 *
 * Some pins are deliberately not the same food because USDA has no record for the real one:
 * burrata is priced on whole-milk mozzarella, Thai basil on sweet basil. Those are decisions, not
 * defects, and the library already writes them down — "USDA has no burrata record", "priced as
 * basil, fresh".
 *
 * Honouring that convention is what keeps this check worth reading. An audit that reports known,
 * documented, deliberate choices every week is an audit that gets muted — the exact failure
 * `STANDING_BACKLOG` in the cron route exists to prevent, and the one that let #673's heat check
 * sit unread while 29 recipes drifted past it. The escape hatch also has the right incentive: the
 * way to silence it is to write down WHY.
 */
export const SUBSTITUTION_NOTE =
  /no usda|priced (?:as|on)|stand-?in|proxy|closest|substitut|nearest/i;

/**
 * Mutually exclusive descriptors along one axis. Both sides have to declare a value for a
 * contradiction to exist — a line that says nothing about form is not disagreeing with anything.
 *
 * `dry`, `dried` and `fresh` are deliberately absent from `form`. "dry brown rice" against
 * "Rice, brown, long-grain, raw" is the same food said two ways, and including them turned a
 * silent check into a noisy one.
 */
const STATE_AXES: { axis: string; groups: string[][] }[] = [
  { axis: "form", groups: [["raw"], ["cooked"], ["frozen"], ["canned"]] },
  { axis: "fat level", groups: [["nonfat", "fatfree", "skim"], ["lowfat"], ["whole", "fullfat"]] },
];

/** The single value `text` declares on this axis, or null when it declares none or several. */
function declaredState(text: string, groups: string[][]): string | null {
  const padded = ` ${text.toLowerCase().replace(/[^a-z]+/g, " ")} `;
  const hit = groups.filter((g) => g.some((w) => padded.includes(` ${w} `)));
  return hit.length === 1 ? hit[0][0] : null;
}

/** Every distinct fdc_id in these rows, so a caller can resolve descriptions once. */
export function pinnedFdcIds(rows: Row[]): number[] {
  const ids = new Set<number>();
  for (const r of rows) {
    for (const i of r.ingredients_json ?? []) if (i.fdc_id) ids.add(i.fdc_id);
  }
  return [...ids];
}

/**
 * Resolve one description per distinct id, for the two callers that own the network.
 *
 * `fetchFood` is injected rather than imported so this file never has to reach the FDC client in a
 * test. Failures are per-id and swallowed: an id that will not resolve is left out of the map, and
 * `auditPins` skips it. A rate limit is not a data defect, and an audit that reports one as though
 * it were would be lying about the library.
 *
 * Six at a time. The library has ~74 distinct ids; sequential is needlessly slow for a weekly cron
 * and unbounded parallelism is how a shared API key gets throttled.
 */
export async function resolvePinDescriptions(
  ids: number[],
  fetchFood: (fdcId: number) => Promise<{ description: string }>,
): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const CONCURRENCY = 6;
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    await Promise.all(
      ids.slice(i, i + CONCURRENCY).map(async (id) => {
        try {
          const food = await fetchFood(id);
          if (food?.description) out.set(id, food.description);
        } catch {
          // Unresolvable — skipped, not reported. See the doc comment.
        }
      }),
    );
  }
  return out;
}

/**
 * Findings for pins that do not describe the food on the line.
 *
 * `describe` returns the USDA description for an id, or undefined when it could not be resolved —
 * an unresolvable id is skipped rather than reported, because a rate limit is not a data defect.
 */
export function auditPins(rows: Row[], describe: (fdcId: number) => string | undefined): Finding[] {
  const out: Finding[] = [];
  for (const r of rows) {
    for (const ing of r.ingredients_json ?? []) {
      if (!ing.fdc_id) continue;
      const description = describe(ing.fdc_id);
      if (!description) continue;
      if (SUBSTITUTION_NOTE.test(ing.note ?? "")) continue;

      // `allowBranded` — a deliberately pinned branded record is not a defect. See fdc.ts.
      if (!isPlausibleMatch(ing.item, description, { allowBranded: true })) {
        out.push({
          kind: "pin-wrong-food",
          recipe: r.name,
          detail: `"${ing.item}" is pinned to ${ing.fdc_id} = "${description}" — no word in common. Re-pin it, or write the substitution into its note.`,
        });
        continue;
      }

      for (const { axis, groups } of STATE_AXES) {
        const onLine = declaredState(ing.item, groups);
        const onRecord = declaredState(description, groups);
        if (onLine && onRecord && onLine !== onRecord) {
          out.push({
            kind: "pin-wrong-state",
            recipe: r.name,
            detail: `"${ing.item}" says ${onLine} but ${ing.fdc_id} = "${description}" is ${onRecord} (${axis})`,
          });
        }
      }
    }
  }
  return out;
}

/** The exact column list `audit()` needs. Shared so the CLI and the cron route cannot select
 *  different shapes and disagree about what is missing. */
export const RECIPE_AUDIT_SELECT =
  "id,name,ingredients_json,steps_json,instructions,typical_portions,calories,macros_computed_at,metadata";
