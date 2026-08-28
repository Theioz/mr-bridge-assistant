/**
 * Meal estimation: local model identifies, USDA quantifies.
 *
 * Pipeline per food:
 *   parse (model)  ->  search USDA  ->  pick best (model)  ->  qty+unit -> grams
 *   (USDA portions) -> per-100g macros scaled to grams (USDA)
 *
 * The model never produces a number that ends up in your macros. It only decides
 * WHICH food and HOW MANY units. Every gram and every calorie comes from USDA
 * measured data. This replaces an Anthropic call that recalled nutrition facts
 * from memory — it is more accurate, not less.
 */
import {
  addMacros,
  EMPTY_MACROS,
  getFood,
  gramsFor,
  isPlausibleMatch,
  macrosForGrams,
  roundMacros,
  searchFoods,
  type Macros,
} from "./fdc";
import { parseFoodPhoto, parseFoodText, pickBestFood, type ParsedFood } from "./parse";
import { lookupPicks, normalizeQuery, type CachedPick } from "./pick-cache";
import { lexQuantity } from "./quantity";

export type EstimatedItem = {
  /** What the user said / the model saw. */
  input: string;
  /**
   * The USDA-style food name this was searched under — the key the memo is written against.
   *
   * Carried out to the caller so that the memo can be written when the USER LOGS the meal
   * rather than when the model picks. See recordPick's note on why the pick alone is not
   * enough of a signal.
   */
  query: string;
  /** The USDA food we actually used. */
  matched: string;
  fdcId: number;
  qty: number;
  unit: string;
  grams: number;
  /** false when we fell back to an assumed portion weight. */
  exactPortion: boolean;
  /**
   * false when the source text stated no quantity at all ("Green beans", "olive oil").
   * The amount used is then an invention, and the estimate must say so rather than let a
   * made-up serving hide inside a confident-looking total.
   */
  quantified: boolean;
  basis: string;
  macros: Macros;
};

export type MealEstimate = {
  food_name: string;
  items: EstimatedItem[];
  totals: Macros;
  confidence: "high" | "medium" | "low";
  /** Foods that matched no plausible USDA record and are ABSENT from `totals`. */
  unmatched: string[];
  notes: string;
};

/**
 * Some USDA records carry no nutrient data at all — "Pasta, dry, enriched,
 * spaghetti" came back with 0 kcal AND 0 protein/carbs/fat, which would log a
 * zero-calorie plate of pasta. An empty record is not a valid answer; skip it.
 */
function isNutritionallyEmpty(m: {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}): boolean {
  return m.calories <= 0 && m.protein_g <= 0 && m.carbs_g <= 0 && m.fat_g <= 0;
}

type Prepared = {
  food: ParsedFood;
  qty: number;
  unit: string;
  quantified: boolean;
  /** Resolved with NO model call: pinned by the caller, or remembered from a previous meal. */
  knownId?: number;
  /** Whether knownId came from the memo (as opposed to a caller-pinned ingredient). */
  remembered: boolean;
  /** Plausible USDA candidates, when a selection is still needed. */
  candidates: { fdcId: number; description: string }[];
};

/**
 * Everything that can be decided about one food WITHOUT asking the model to choose.
 *
 * The quantity rules are unchanged and deliberately so — see the note below on why the number
 * comes from the text and not from the model. What is new is that a food already known to the
 * memo skips the USDA search entirely: there is nothing to choose between if the choice was
 * made on a previous meal.
 */
async function prepare(food: ParsedFood, cached: Map<string, CachedPick>): Promise<Prepared> {
  // THE QUANTITY COMES FROM THE TEXT, NOT THE MODEL.
  //
  // The model is asked to echo the fragment it read (`source`) and we lex the number out of
  // that ourselves. It is not trusted to repeat a number, because it demonstrably alters
  // them: "2 cups dry brown rice" came back as a cooked-rice match, and "about 6oz of
  // chicken" used to come back as qty=1 unit='medium'. A stated measurement is the user's
  // own data and no model should be able to round it.
  //
  // When the source states nothing ("Green beans"), the model's qty/unit is an invention.
  // We still estimate — a rough total beats no total — but the item is flagged unquantified
  // and the confidence below is capped accordingly.
  //
  // A STRUCTURED ingredient never went through the model at all: its qty/unit were read
  // straight out of `recipes.ingredients_json`. There is no prose to lex and nothing to
  // second-guess, so it is quantified by construction.
  const lexed = !food.structured && food.source ? lexQuantity(food.source) : null;
  const qty = lexed ? lexed.qty : food.qty;
  const unit = lexed ? lexed.unit : food.unit;
  const quantified = lexed !== null || food.structured === true;

  const base = { food, qty, unit, quantified };

  // Pinned record: skip the search AND the model's pick.
  if (food.fdcId != null) {
    return { ...base, knownId: food.fdcId, remembered: false, candidates: [] };
  }

  // Remembered from a previous meal: same shortcut, and the reason the second meal costs
  // neither a search nor a selection.
  const memo = cached.get(normalizeQuery(food.query));
  if (memo) {
    return { ...base, knownId: memo.fdcId, remembered: true, candidates: [] };
  }

  const searched = await searchFoods(food.query, 5);

  // Drop candidates that are not plausibly the food we asked for. USDA's search sometimes
  // returns nothing relevant, and the model then picks the least-bad of a bad set — "salt"
  // became "Syrups, table blends, pancake", which puts 20g of SYRUP into a zero-calorie
  // ingredient. No prompt fixes that: the right answer was never in the list.
  //
  // Matching NOTHING is a better outcome than matching syrup. Salt genuinely has no macros;
  // a bogus match invents some. The caller reports what went unmatched.
  const candidates = searched.filter((c) => isPlausibleMatch(food.query, c.description));
  return { ...base, remembered: false, candidates };
}

function buildItem(
  p: Prepared,
  detail: { fdcId: number; description: string; per100g: Macros },
  opts: { grams: number; exact: boolean; basis: string },
): EstimatedItem {
  return {
    input: (p.food.source ?? `${p.qty} ${p.unit} ${p.food.query}`).trim(),
    query: p.food.query,
    matched: detail.description,
    fdcId: detail.fdcId,
    qty: p.qty,
    unit: p.unit,
    grams: Math.round(opts.grams),
    exactPortion: opts.exact,
    quantified: p.quantified,
    basis: p.quantified ? opts.basis : `${opts.basis} — NO QUANTITY STATED, amount is a guess`,
    macros: macrosForGrams(detail.per100g, opts.grams),
  };
}

/**
 * Turn a prepared food plus the model's choice into an item.
 *
 * `idx` is the chosen candidate, or null for "no confident choice" — in which case we still
 * answer, from the top candidate, but nothing is written to the memo. Pinning a guess is how a
 * wrong food would become permanent.
 */
async function finalize(
  p: Prepared,
  idx: number | null,
  context?: string,
): Promise<EstimatedItem | null> {
  if (p.knownId != null) {
    const known = await getFood(p.knownId).catch(() => null);
    if (known && !isNutritionallyEmpty(known.per100g)) {
      const { grams, exact, basis } = gramsFor(p.qty, p.unit, known.portions);
      return buildItem(p, known, {
        grams,
        exact,
        basis: `${basis} — ${p.remembered ? "remembered USDA pick" : "pinned fdcId"}`,
      });
    }

    // A pinned or remembered id that 404s or carries no nutrition falls back to the normal
    // search rather than failing the ingredient — a stale pin should degrade, not break the
    // recipe. This path is rare, so it pays for its own selection call.
    const searched = await searchFoods(p.food.query, 5);
    const candidates = searched.filter((c) => isPlausibleMatch(p.food.query, c.description));
    if (candidates.length === 0) return null;
    p = { ...p, knownId: undefined, remembered: false, candidates };
    idx = await pickBestFood(p.food.query, candidates, context).catch(() => null);
  }

  if (p.candidates.length === 0) return null;

  // Try the chosen candidate first, then the rest in rank order, skipping any
  // record with no usable nutrition.
  const order = [idx ?? 0, ...p.candidates.map((_, i) => i).filter((i) => i !== (idx ?? 0))];

  for (const i of order) {
    const detail = await getFood(p.candidates[i].fdcId);
    if (isNutritionallyEmpty(detail.per100g)) continue;

    const { grams, exact, basis } = gramsFor(p.qty, p.unit, detail.portions);
    // Only "exact" if we both picked deliberately AND resolved a real portion.
    const deliberate = idx !== null && i === idx;

    // NOTHING IS MEMOISED HERE. A confident pick is not a correct pick.
    //
    // This used to write the memo whenever the model chose deliberately, on the reasoning that
    // a deliberate choice is a safe one. It is not: asked to match "oyster", the model picked
    // *Mushrooms, oyster, raw* — confidently, and exactly the "different food sharing a word"
    // trap its own prompt warns about. Memoising that pinned the mushroom permanently, and the
    // pin then SKIPS the model, so nothing could ever revisit it.
    //
    // The memo is now written from the meal-log route, against what the user actually accepted
    // after seeing it in the review step. `query` is carried on the item for that purpose.

    return buildItem(p, detail, { grams, exact: exact && deliberate, basis });
  }

  return null; // every candidate was empty — better to report nothing than zeros
}

/**
 * Resolve every food in a meal: memo lookup, then selection, then USDA detail.
 *
 * The selections run CONCURRENTLY, one call per food. That is measured, not assumed — the
 * first version of this batched all of them into a single call on the theory that a dozen
 * round trips were the cost. They are not. Fifteen selections, same server, same model:
 *
 *   one batched call ............ 48 s
 *   15 concurrent calls ......... 19 s
 *
 * The bottleneck is token GENERATION, not round trips. Batching serializes every answer into
 * one output stream, while separate calls decode across the server's four slots at once. So
 * the fan-out is the fast shape here, and it is also the shape whose accuracy is already
 * understood: one food, one list, one decision.
 *
 * The queueing that made this look slow was never in this file. It was a model server running
 * a single slot (jl-homelab #680), where these calls piled up behind the vision call and three
 * of them hit the client timeout.
 */
async function estimateAll(
  foods: ParsedFood[],
  context?: string,
): Promise<(EstimatedItem | null)[]> {
  const cached = await lookupPicks(foods.filter((f) => f.fdcId == null).map((f) => f.query));

  const prepared = await Promise.all(foods.map((f) => prepare(f, cached).catch(() => null)));

  const needPick = prepared
    .map((p, i) => ({ p, i }))
    .filter((x): x is { p: Prepared; i: number } => !!x.p && x.p.candidates.length > 1);

  const picks = await Promise.all(
    needPick.map((x) => pickBestFood(x.p.food.query, x.p.candidates, context).catch(() => null)),
  );

  const chosen = new Map<number, number | null>();
  needPick.forEach((x, k) => chosen.set(x.i, picks[k] ?? null));

  return Promise.all(
    prepared.map((p, i) => {
      if (!p) return null;
      // A single plausible candidate needs no model call, and choosing it IS deliberate.
      const idx = chosen.has(i) ? (chosen.get(i) ?? null) : p.candidates.length === 1 ? 0 : null;
      return finalize(p, idx, context).catch(() => null);
    }),
  );
}

function assemble(items: EstimatedItem[], label: string, unmatched: string[] = []): MealEstimate {
  const totals = items.reduce<Macros>((acc, i) => addMacros(acc, i.macros), { ...EMPTY_MACROS });

  // CONFIDENCE MUST MEASURE THE RIGHT THING.
  //
  // It used to reflect only whether gramsFor() found a USDA portion table. That is a fact
  // about USDA's data, not about whether the answer is right — so a recipe whose rice was
  // silently resolved as COOKED (a 3x carb error) came back "high", because USDA does
  // happen to publish a cup-portion for cooked rice. A wrong number wearing a confident
  // badge is worse than an honest "I guessed".
  //
  // So: any ingredient we had to invent an amount for makes "high" unreachable. You cannot
  // be highly confident in a total that contains a number nobody wrote down.
  const unquantified = items.filter((i) => !i.quantified);
  const assumedPortion = items.filter((i) => i.quantified && !i.exactPortion).length;

  let confidence: MealEstimate["confidence"];
  if (items.length === 0) confidence = "low";
  else if (unquantified.length)
    confidence = unquantified.length === items.length ? "low" : "medium";
  else if (assumedPortion === 0) confidence = "high";
  else confidence = assumedPortion < items.length ? "medium" : "low";

  const parts: string[] = [];
  if (unquantified.length) {
    // Name them. "Some portions were assumed" is unactionable; "green beans, olive oil had
    // no quantity" tells the user exactly which line to go and fix.
    parts.push(
      `${unquantified.length} ingredient(s) had NO stated quantity and were guessed: ` +
        `${unquantified.map((i) => i.input).join(", ")}. Add an amount to fix the total.`,
    );
  }
  if (unmatched.length) {
    // Name them. Some (salt, pepper) contribute nothing and their absence is harmless —
    // correct, even. Others are a real hole in the total. Only the user can tell which.
    parts.push(
      `No USDA match for: ${unmatched.join(", ")} — these contribute NOTHING to the total. ` +
        `Harmless for salt/pepper; a real gap for anything else.`,
    );
  }
  if (assumedPortion) {
    parts.push(`${assumedPortion} portion(s) used an assumed serving weight.`);
  }
  if (!parts.length) parts.push("Every amount was taken from your text; USDA supplied the grams.");

  return {
    food_name: label,
    items,
    totals: roundMacros(totals),
    confidence,
    unmatched,
    notes: parts.join(" "),
  };
}

/** Free-text: "2 eggs and toast" */
export async function estimateFromText(
  text: string,
  label?: string,
  mode: "meal" | "recipe" = "meal",
): Promise<MealEstimate> {
  const foods = await parseFoodText(text, mode);
  const settled = await estimateAll(foods, text);
  const items = settled.filter((i): i is EstimatedItem => i !== null);
  // An ingredient that matched nothing used to vanish silently. Carry it through so the
  // estimate can say what is missing from its own total.
  const unmatched = foods
    .filter((_, i) => settled[i] === null)
    .map((f) => f.source?.trim() || f.query);
  return assemble(items, label?.trim() || text.trim(), unmatched);
}

/**
 * Structured ingredients — the model-free path.
 *
 * `estimateFromText` exists to recover {food, amount} pairs from prose, and everything downstream
 * of it is damage control for a model that alters numbers (see parse.ts: a large egg read as 105 g
 * against a real ~50 g). `recipes.ingredients_json` already holds those pairs as data, so this
 * skips `parseFoodText` outright: no Ollama call, no lexer, no chance of a rounded amount.
 *
 * Rows with no quantity ("salt, to taste") are dropped rather than guessed at. In the prose path an
 * amount-less ingredient still gets an invented serving and caps the confidence; here the author
 * has explicitly said there is no amount, which is a statement, not an omission. Returning them as
 * `unmatched` would also be wrong — they matched fine, they just have no mass. They are reported
 * separately by the caller.
 */
export async function estimateFromStructured(
  foods: ParsedFood[],
  label: string,
): Promise<MealEstimate> {
  // No `context` argument: it exists to help the model disambiguate a USDA pick, and a structured
  // row either pins its record or carries a prep-qualified name that already does that job.
  const settled = await estimateAll(foods);
  const items = settled.filter((i): i is EstimatedItem => i !== null);
  const unmatched = foods
    .filter((_, i) => settled[i] === null)
    .map((f) => f.source?.trim() || f.query);
  return assemble(items, label.trim(), unmatched);
}

/**
 * Photo of a meal, optionally with the user's own description.
 *
 * The description is the highest-value input in the whole feature: it lets the
 * user supply the two things the model is worst at — WHAT the dish is ("beef
 * bolognese with parmesan") and HOW MUCH of it there is ("6oz") — whenever they
 * happen to know. Stated measurements are used verbatim; the image only fills the
 * gaps. With no description, it falls back to pure vision, as before.
 */
export async function estimateFromPhoto(
  base64Jpeg: string,
  opts?: { description?: string; label?: string },
): Promise<MealEstimate> {
  const description = opts?.description?.trim();
  const foods = await parseFoodPhoto(base64Jpeg, description);

  // The description also disambiguates USDA selection — it's what stops "a bowl of
  // oatmeal" resolving to "Bread, oatmeal".
  const settled = await estimateAll(foods, description);
  const items = settled.filter((i): i is EstimatedItem => i !== null);

  const name =
    opts?.label?.trim() ||
    description ||
    items.map((i) => i.matched.split(",")[0]).join(", ") ||
    "Meal";

  return assemble(items, name);
}
