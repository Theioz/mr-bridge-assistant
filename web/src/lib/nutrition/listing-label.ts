import { labelToPer100g, type LabelPanel, type Per100g } from "./packaged-foods.ts";

/**
 * Amazon Fresh listing labels: the Nutrition Facts panel a product page carries as text.
 *
 * Most Fresh product pages hold the full panel in hidden markup
 * (`#updatedAlmNutritionalInformation_feature_div`). Reading it at pin time means a product
 * arrives with label macros instead of waiting for someone to photograph the box. But a listing
 * is not a label. It is data Amazon keyed in, the page says "packaging may vary", and it is
 * measurably wrong sometimes: on 2026-10-26 the cooked-shrimp listing claimed "1.0 servings per
 * container" for a 12 oz bag, and 0 mg sodium and cholesterol for shrimp. So this module parses
 * the raw panel TEXT server-side, never numbers a model typed, and reviews it before anything is
 * written. A photographed label always outranks a listing (see `pinGroceryProduct`).
 */

/** A listing panel as printed on the page, per SERVING. */
export interface ListingPanel {
  servingsPerContainer: number | null;
  servingLabel: string | null;
  servingSizeG: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
  /** Fields the page printed as "less than" (`<1g`), stored at half the bound. */
  lessThan: string[];
}

export type ListingParse = { ok: true; panel: ListingPanel } | { ok: false; reason: string };

/** What `reviewListingLabel` decided: the values to store, and why any of them changed. */
export interface ListingReview {
  per100g: Per100g;
  servingsPerContainer: number | null;
  flags: string[];
}

export type ListingVerdict = { ok: true; review: ListingReview } | { ok: false; reason: string };

const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const round1 = (n: number) => Math.round(n * 10) / 10;

/** A printed amount: "19", "1.5", "<1". A "less than" value is stored at half its bound. */
function amount(raw: string | undefined): { value: number; lessThan: boolean } | null {
  if (raw == null) return null;
  const m = raw.match(/^(<\s*)?([\d,]*\.?\d+)$/);
  if (!m) return null;
  const n = Number(m[2].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return m[1] ? { value: n / 2, lessThan: true } : { value: n, lessThan: false };
}

/**
 * Parse the panel's text (the element's `textContent`, whitespace and all).
 *
 * The block holds a summary strip ("100 Calories 19g Protein …") BEFORE the real panel, in a
 * different word order, so every nutrient is read from the text after "Amount per" — the panel
 * proper. A panel with no gram weight on its serving ("1.0 cup", "1.0 apple (medium)") is refused:
 * those are generic produce entries, and a cup has no weight anyone measured.
 */
export function parseListingPanel(text: string): ListingParse {
  const t = squash(text ?? "");
  if (!t)
    return { ok: false, reason: "no nutrition panel on this listing (label is only a photo)" };

  const at = t.search(/Amount per/i);
  if (at < 0) return { ok: false, reason: "panel text has no 'Amount per' section" };
  const body = t.slice(at);

  const serving = t.match(/Serving size (.+?) Amount per/i)?.[1]?.trim() ?? null;
  const grams =
    serving?.match(/\(\s*([\d.]+)\s*g\s*\)/i)?.[1] ?? serving?.match(/^([\d.]+)\s*g\b/i)?.[1];
  const servingSizeG = grams == null ? NaN : Number(grams);
  if (!Number.isFinite(servingSizeG) || servingSizeG <= 0) {
    return { ok: false, reason: `serving "${serving ?? "?"}" has no gram weight` };
  }

  const lessThan: string[] = [];
  const read = (name: string, re: RegExp) => {
    const a = amount(body.match(re)?.[1]);
    if (a?.lessThan) lessThan.push(name);
    return a?.value ?? null;
  };
  const calories = read("calories", /Calories\s+(<?\s*[\d,.]+)/i);
  const fatG = read("fat", /Total Fat\s+(<?\s*[\d.]+)\s*g/i);
  const carbsG = read("carbs", /Total Carbohydrate\s+(<?\s*[\d.]+)\s*g/i);
  const proteinG = read("protein", /Protein\s+(<?\s*[\d.]+)\s*g/i);
  const missing = [
    ["calories", calories],
    ["total fat", fatG],
    ["total carbohydrate", carbsG],
    ["protein", proteinG],
  ].filter(([, v]) => v == null);
  if (missing.length) {
    return { ok: false, reason: `panel is missing ${missing.map(([n]) => n).join(", ")}` };
  }

  const spc = t.match(/(?:about\s+)?([\d.]+) servings per container/i)?.[1];
  return {
    ok: true,
    panel: {
      servingsPerContainer: spc == null ? null : Number(spc),
      servingLabel: serving?.replace(/\s*\(\s*[\d.]+\s*g\s*\)/i, "").trim() || null,
      servingSizeG,
      calories: calories as number,
      proteinG: proteinG as number,
      carbsG: carbsG as number,
      fatG: fatG as number,
      fiberG: read("fiber", /Dietary Fiber\s+(<?\s*[\d.]+)\s*g/i),
      sugarG:
        read("sugars", /Total Sugars\s+(<?\s*[\d.]+)\s*g/i) ??
        read("sugars", /(?<!Added )Sugars\s+(<?\s*[\d.]+)\s*g/i),
      sodiumMg: read("sodium", /Sodium\s+(<?\s*[\d.]+)\s*mg/i),
      lessThan,
    },
  };
}

const UNIT_G: Record<string, number> = {
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  oz: 28.3495,
  ounce: 28.3495,
  ounces: 28.3495,
  lb: 453.592,
  lbs: 453.592,
  pound: 453.592,
  pounds: 453.592,
};

/**
 * Net weight from a listing title ("Medium Cooked Shrimp, 12 Oz", "14.4 OZ Bag", "1 Lb").
 * Fluid ounces are volume and are skipped; a title with no weight returns null.
 */
export function netWeightFromTitle(title: string): number | null {
  const re = /([\d.]+)\s*(kg|g|grams?|oz|ounces?|lbs?|pounds?)\b(?!\s*\.?\s*(?:fl|fluid))/gi;
  for (const m of title.matchAll(re)) {
    const before = title.slice(0, m.index).trimEnd();
    if (/\bfl\.?$/i.test(before)) continue;
    const n = Number(m[1]);
    const f = UNIT_G[m[2].toLowerCase()];
    if (Number.isFinite(n) && n > 0 && f) return Math.round(n * f * 100) / 100;
  }
  return null;
}

/** FDA rounding puts every printed macro on a 0.5 step; generic produce data does not. */
const labelRounded = (v: number) => Math.abs(v * 2 - Math.round(v * 2)) < 1e-9;

/**
 * Decide what a parsed listing may store. Refuses generic produce data outright; otherwise keeps
 * the panel and repairs only what the page demonstrably got wrong, saying so in `flags`.
 *
 * - Servings x serving size more than 15% off the net weight: the servings count is the wrong
 *   figure (the shrimp's "1.0" for a 12 oz bag), so it is recomputed from the net weight.
 * - Energy more than 20% off 4P + 4C + 9F: flagged, not changed. Fibre and sugar alcohols move
 *   energy legitimately; the panel is still the best number available.
 * - 0 mg sodium on an animal protein: stored as unknown (null), not as a confident zero.
 */
export function reviewListingLabel(
  panel: ListingPanel,
  opts: { netWeightG?: number | null; animalProtein?: boolean } = {},
): ListingVerdict {
  const odd = (
    [
      ["calories", panel.calories],
      ["protein", panel.proteinG],
      ["carbs", panel.carbsG],
      ["fat", panel.fatG],
    ] as const
  ).filter(([, v]) => !labelRounded(v));
  if (odd.length) {
    return {
      ok: false,
      reason:
        `values are not label-rounded (${odd.map(([n, v]) => `${n} ${v}`).join(", ")}): this ` +
        "is generic produce data, not a package label — pin the food by fdc_id instead",
    };
  }

  const flags: string[] = panel.lessThan.map((n) => `${n} printed as "less than", stored at half`);
  let servings = panel.servingsPerContainer;
  const net = opts.netWeightG ?? null;
  if (net != null && net > 0) {
    const implied = servings == null ? null : servings * panel.servingSizeG;
    if (implied == null || Math.abs(implied - net) / net > 0.15) {
      const fixed = round1(net / panel.servingSizeG);
      flags.push(
        servings == null
          ? `no servings count on the listing; ${fixed} derived from the ${net} g net weight`
          : `listing says ${servings} servings x ${panel.servingSizeG} g = ${round1(implied as number)} g ` +
              `against a ${net} g net weight; servings recomputed to ${fixed}`,
      );
      servings = fixed;
    }
  }

  const atwater = 4 * panel.proteinG + 4 * panel.carbsG + 9 * panel.fatG;
  if (panel.calories >= 20 && Math.abs(panel.calories - atwater) / panel.calories > 0.2) {
    flags.push(
      `energy ${panel.calories} kcal is more than 20% off 4P+4C+9F = ${round1(atwater)} kcal`,
    );
  }

  let sodiumMg = panel.sodiumMg;
  if (opts.animalProtein && sodiumMg === 0) {
    flags.push("0 mg sodium on an animal protein is not credible; stored as unknown");
    sodiumMg = null;
  }

  const labelPanel: LabelPanel = {
    servingSizeG: panel.servingSizeG,
    calories: panel.calories,
    proteinG: panel.proteinG,
    carbsG: panel.carbsG,
    fatG: panel.fatG,
    fiberG: panel.fiberG,
    sugarG: panel.sugarG,
    sodiumMg,
  };
  return {
    ok: true,
    review: { per100g: labelToPer100g(labelPanel), servingsPerContainer: servings, flags },
  };
}
