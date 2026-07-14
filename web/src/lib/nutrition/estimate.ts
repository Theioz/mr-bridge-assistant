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
  macrosForGrams,
  roundMacros,
  searchFoods,
  type Macros,
} from "./fdc";
import { parseFoodPhoto, parseFoodText, pickBestFood, type ParsedFood } from "./parse";
import { lexQuantity } from "./quantity";

export type EstimatedItem = {
  /** What the user said / the model saw. */
  input: string;
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

async function estimateOne(food: ParsedFood, context?: string): Promise<EstimatedItem | null> {
  const candidates = await searchFoods(food.query, 5);
  if (candidates.length === 0) return null;

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
  const lexed = food.source ? lexQuantity(food.source) : null;
  const qty = lexed ? lexed.qty : food.qty;
  const unit = lexed ? lexed.unit : food.unit;
  const quantified = lexed !== null;

  // Never blind-trust candidates[0] — USDA's top hit for "chicken breast, cooked"
  // is breaded microwaved tenders (252 kcal vs ~165 for plain).
  let idx: number | null = null;
  try {
    idx = await pickBestFood(food.query, candidates, context);
  } catch {
    idx = null; // model unavailable -> fall through to first hit, flagged low-confidence
  }

  // Try the chosen candidate first, then the rest in rank order, skipping any
  // record with no usable nutrition.
  const order = [idx ?? 0, ...candidates.map((_, i) => i).filter((i) => i !== (idx ?? 0))];

  for (const i of order) {
    const detail = await getFood(candidates[i].fdcId);
    if (isNutritionallyEmpty(detail.per100g)) continue;

    const { grams, exact, basis } = gramsFor(qty, unit, detail.portions);
    return {
      input: (food.source ?? `${qty} ${unit} ${food.query}`).trim(),
      matched: detail.description,
      fdcId: detail.fdcId,
      qty,
      unit,
      grams: Math.round(grams),
      // Only "exact" if we both picked deliberately AND resolved a real portion.
      exactPortion: exact && idx !== null && i === idx,
      quantified,
      basis: quantified ? basis : `${basis} — NO QUANTITY STATED, amount is a guess`,
      macros: macrosForGrams(detail.per100g, grams),
    };
  }

  return null; // every candidate was empty — better to report nothing than zeros
}

function assemble(items: EstimatedItem[], label: string): MealEstimate {
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
  if (assumedPortion) {
    parts.push(`${assumedPortion} portion(s) used an assumed serving weight.`);
  }
  if (!parts.length) parts.push("Every amount was taken from your text; USDA supplied the grams.");

  return {
    food_name: label,
    items,
    totals: roundMacros(totals),
    confidence,
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
  const settled = await Promise.all(foods.map((f) => estimateOne(f, text).catch(() => null)));
  const items = settled.filter((i): i is EstimatedItem => i !== null);
  return assemble(items, label?.trim() || text.trim());
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
  const settled = await Promise.all(
    foods.map((f) => estimateOne(f, description).catch(() => null)),
  );
  const items = settled.filter((i): i is EstimatedItem => i !== null);

  const name =
    opts?.label?.trim() ||
    description ||
    items.map((i) => i.matched.split(",")[0]).join(", ") ||
    "Meal";

  return assemble(items, name);
}
