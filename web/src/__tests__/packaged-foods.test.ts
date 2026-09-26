import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  labelToPer100g,
  macrosForGrams,
  macrosForServings,
  containerWeightG,
  labelGramsFor,
  labelStateConflict,
  parseServingLabel,
  parsePackagedFoodInput,
  toPackagedFoodWrite,
  panelFromRow,
  splitServingText,
  catalogFlags,
  PackagedFoodInputError,
  priceLabelServing,
} from "../lib/nutrition/packaged-foods.ts";
import type { PackagedFoodRow, LabelPanel } from "../lib/nutrition/packaged-foods.ts";

// The two real labels this table was built from, transcribed from photographs on 2026-09-03.
// They are used as fixtures deliberately: the arithmetic below is only worth anything if it
// reproduces panels that actually exist in the kitchen.
const BARILLA_TRICOLOR: LabelPanel = {
  servingSizeG: 56,
  calories: 200,
  proteinG: 7,
  carbsG: 42,
  fatG: 1,
  fiberG: 3,
  sugarG: 2,
  sodiumMg: 10,
};

const CLASSICO_SAUSAGE: LabelPanel = {
  servingSizeG: 125,
  calories: 60,
  proteinG: 2,
  carbsG: 9,
  fatG: 1.5,
  fiberG: 2,
  sugarG: 6,
  sodiumMg: 440,
};

const row = (panel: LabelPanel, extra: Partial<PackagedFoodRow> = {}): PackagedFoodRow => ({
  id: "00000000-0000-0000-0000-000000000000",
  brand: "Test",
  product: "Test",
  upc: null,
  serving_size_g: panel.servingSizeG,
  serving_label: null,
  servings_per_container: null,
  net_weight_g: null,
  prep_state: "as_sold",
  fdc_proxy_id: null,
  label_photographed_on: "2026-09-03",
  notes: null,
  ...labelToPer100g(panel),
  ...extra,
});

describe("labelToPer100g — the label's serving division happens exactly once", () => {
  it("converts the Barilla tri-color panel (56 g serving)", () => {
    const p = labelToPer100g(BARILLA_TRICOLOR);
    assert.equal(p.calories_per_100g, 357.14);
    assert.equal(p.protein_per_100g, 12.5);
    assert.equal(p.carbs_per_100g, 75);
    assert.equal(p.fat_per_100g, 1.79);
    assert.equal(p.fiber_per_100g, 5.36);
    assert.equal(p.sodium_mg_per_100g, 17.86);
  });

  it("converts the Classico panel (125 g serving) with no rounding loss at all", () => {
    // 125 g divides into 100 cleanly, so every value here is exact. Worth pinning separately
    // from the 56 g case so a regression in rounding cannot hide behind a ragged divisor.
    const p = labelToPer100g(CLASSICO_SAUSAGE);
    assert.equal(p.calories_per_100g, 48);
    assert.equal(p.protein_per_100g, 1.6);
    assert.equal(p.carbs_per_100g, 7.2);
    assert.equal(p.fat_per_100g, 1.2);
    assert.equal(p.fiber_per_100g, 1.6);
    assert.equal(p.sugar_per_100g, 4.8);
    assert.equal(p.sodium_mg_per_100g, 352);
  });

  it("keeps a missing optional nutrient null rather than turning it into zero", () => {
    // A panel that does not print fibre is UNKNOWN, not zero-fibre. Storing 0 would silently
    // pull a day's fibre total down and look like real data.
    const p = labelToPer100g({ servingSizeG: 50, calories: 100, proteinG: 5, carbsG: 10, fatG: 2 });
    assert.equal(p.fiber_per_100g, null);
    assert.equal(p.sugar_per_100g, null);
    assert.equal(p.sodium_mg_per_100g, null);
  });

  it("refuses a serving size that cannot be divided by", () => {
    for (const bad of [0, -56, Number.NaN]) {
      assert.throws(() => labelToPer100g({ ...BARILLA_TRICOLOR, servingSizeG: bad }), /> 0/);
    }
  });
});

describe("round trip — one serving of a stored row reproduces the printed panel", () => {
  // This is the invariant that matters. Storage is per-100 g, but the thing a person can
  // check against the box is the per-serving column, so the two must agree to the label's
  // own precision or the catalog is not auditable.
  it("reproduces the Barilla panel through a 56 g ragged divisor", () => {
    const m = macrosForServings(row(BARILLA_TRICOLOR), 1);
    assert.equal(m.calories, 200);
    assert.equal(m.protein_g, 7);
    assert.equal(m.carbs_g, 42);
    assert.equal(m.fat_g, 1);
    assert.equal(m.fiber_g, 3);
    assert.equal(m.sodium_mg, 10);
  });

  it("reproduces the Classico panel", () => {
    const m = macrosForServings(row(CLASSICO_SAUSAGE), 1);
    assert.equal(m.calories, 60);
    assert.equal(m.protein_g, 2);
    assert.equal(m.fat_g, 1.5);
    assert.equal(m.sodium_mg, 440);
  });
});

describe("macrosForGrams", () => {
  it("scales a whole 336 g box of pasta", () => {
    const m = macrosForGrams(row(BARILLA_TRICOLOR), 336);
    assert.equal(m.calories, 1199.99); // 6 x 200, modulo the stored 357.14
    assert.equal(m.protein_g, 42);
    assert.equal(m.fiber_g, 18.01);
  });

  it("treats an unknown nutrient as 0 when scaling, not as NaN", () => {
    // null means "the label did not say". It must not poison a sum — a NaN here would
    // propagate silently through a day total and render as a blank rather than an error.
    const m = macrosForGrams(
      row({ servingSizeG: 50, calories: 100, proteinG: 5, carbsG: 10, fatG: 2 }),
      100,
    );
    assert.equal(m.fiber_g, 0);
    assert.ok(Number.isFinite(m.sodium_mg));
  });

  it("refuses a negative weight", () => {
    assert.throws(() => macrosForGrams(row(BARILLA_TRICOLOR), -1), />= 0/);
  });
});

describe("containerWeightG — net weight beats reconstructing it from servings", () => {
  it("uses net_weight_g and says so", () => {
    const r = row(CLASSICO_SAUSAGE, { net_weight_g: 680, servings_per_container: 5 });
    assert.deepEqual(containerWeightG(r), { grams: 680, source: "net_weight" });
  });

  it("falls back to servings x serving_size, and that fallback is measurably light", () => {
    // The real Classico jar: "about 5 servings" of 125 g reconstructs to 625 g against a
    // true 680 g net weight — 8% short, most of a portion once a whole jar goes into a
    // four-portion batch. The source field exists so a caller can flag the number inferred.
    const r = row(CLASSICO_SAUSAGE, { servings_per_container: 5 });
    const got = containerWeightG(r);
    assert.deepEqual(got, { grams: 625, source: "servings" });
    assert.ok(Math.abs(625 - 680) / 680 > 0.07);
  });

  it("returns null when the container size is genuinely unknown", () => {
    assert.equal(containerWeightG(row(BARILLA_TRICOLOR)), null);
  });
});

// ── #722: pricing a recipe line off a label ─────────────────────────────────

const GOCHUJANG: LabelPanel = { servingSizeG: 6, calories: 10, proteinG: 0, carbsG: 2, fatG: 0 };

describe("parseServingLabel — the household measure printed beside the weight", () => {
  it("reads whole, fractional and trailing-word measures", () => {
    assert.deepEqual(parseServingLabel("1 tsp"), { qty: 1, unit: "tsp" });
    assert.deepEqual(parseServingLabel("1/2 cup"), { qty: 0.5, unit: "cup" });
    assert.deepEqual(parseServingLabel("3/4 cup frozen"), { qty: 0.75, unit: "cup" });
    assert.deepEqual(parseServingLabel("1 fillet"), { qty: 1, unit: "fillet" });
  });

  it("ignores a measure that is itself a weight, and labels with no amount", () => {
    assert.equal(parseServingLabel("2 oz"), null);
    assert.equal(parseServingLabel("about a cup"), null);
    assert.equal(parseServingLabel(null), null);
  });
});

describe("labelGramsFor — only figures read off the package", () => {
  const barilla = row(BARILLA_TRICOLOR, {
    prep_state: "dry",
    serving_label: "2 oz",
    servings_per_container: 6,
  });

  it("converts mass units exactly", () => {
    assert.equal(labelGramsFor(barilla, 336, "g")?.grams, 336);
    assert.ok(Math.abs(labelGramsFor(barilla, 12, "oz")!.grams - 340.19) < 0.01);
  });

  it("prices servings off the printed serving weight", () => {
    assert.equal(labelGramsFor(barilla, 2, "servings")?.grams, 112);
  });

  it("prices a spoon only when the label prints that spoon", () => {
    const goch = row(GOCHUJANG, { serving_label: "1 tsp" });
    assert.equal(labelGramsFor(goch, 3, "teaspoons")?.grams, 18);
    assert.equal(labelGramsFor(goch, 1, "tbsp"), null, "no tbsp on the label -> refused");
    assert.equal(labelGramsFor(barilla, 1, "cup"), null);
  });

  it("marks a container inferred from servings as NOT exact, and a net weight as exact", () => {
    const inferred = labelGramsFor(barilla, 1, "box")!;
    assert.equal(inferred.grams, 336);
    assert.equal(inferred.exact, false);
    assert.match(inferred.basis, /INFERRED/);

    const weighed = labelGramsFor(row(BARILLA_TRICOLOR, { net_weight_g: 340 }), 0.5, "box")!;
    assert.equal(weighed.grams, 170);
    assert.equal(weighed.exact, true);
  });

  it("refuses a container with no size, and nonsense quantities", () => {
    assert.equal(labelGramsFor(row(BARILLA_TRICOLOR), 1, "jar"), null);
    assert.equal(labelGramsFor(barilla, 0, "g"), null);
    assert.equal(labelGramsFor(barilla, Number.NaN, "g"), null);
  });
});

describe("labelStateConflict — a dry label never prices a plated weight", () => {
  const dry = row(BARILLA_TRICOLOR, { prep_state: "dry" });
  const asSold = row(CLASSICO_SAUSAGE);

  it("accepts a line that states the label's own state", () => {
    assert.equal(labelStateConflict(dry, "Barilla tri-color pasta, DRY (1 box)"), null);
    assert.equal(labelStateConflict(dry, "rotini, uncooked"), null);
  });

  it("refuses a dry label when the line says cooked, or says nothing", () => {
    assert.match(labelStateConflict(dry, "pasta, cooked")!, /says cooked/);
    assert.match(labelStateConflict(dry, "tri-color pasta")!, /say "dry"/);
    assert.match(labelStateConflict(dry, "pasta, dry then boiled")!, /also says cooked/);
  });

  it("lets an as-sold label through unqualified, but not when the line names a later state", () => {
    assert.equal(labelStateConflict(asSold, "Classico sausage sauce (half jar)"), null);
    assert.equal(labelStateConflict(asSold, "dried apricots"), null);
    assert.match(labelStateConflict(asSold, "ground beef, cooked")!, /as sold/);
    assert.match(labelStateConflict(asSold, "chickpeas, drained")!, /drained/);
  });
});

// ── #722: catalog capture ────────────────────────────────────────────────────

const barillaBody = {
  brand: " Barilla ",
  product: "Tri-Color Pasta",
  prep_state: "dry",
  serving_label: "2 oz",
  servings_per_container: 6,
  net_weight_g: "",
  label_photographed_on: "2026-09-03",
  panel: {
    servingSizeG: 56,
    calories: 200,
    proteinG: 7,
    carbsG: 42,
    fatG: 1,
    fiberG: 3,
    sugarG: 2,
    sodiumMg: 10,
  },
};

describe("parsePackagedFoodInput — reject, don't coerce", () => {
  it("accepts a real panel, trims text, and treats blanks as null", () => {
    const i = parsePackagedFoodInput(barillaBody);
    assert.equal(i.brand, "Barilla");
    assert.equal(i.net_weight_g, null);
    assert.equal(i.prep_state, "dry");
    assert.equal(i.panel.calories, 200);
  });

  it("divides the panel exactly once, matching labelToPer100g", () => {
    const w = toPackagedFoodWrite(parsePackagedFoodInput(barillaBody));
    assert.equal(w.calories_per_100g, 357.14);
    assert.equal(w.protein_per_100g, 12.5);
    assert.equal("panel" in w, false);
  });

  it("refuses a missing serving weight, a missing macro, a bad state and negative numbers", () => {
    const bad = (patch: Record<string, unknown>) =>
      assert.throws(
        () => parsePackagedFoodInput({ ...barillaBody, ...patch }),
        PackagedFoodInputError,
      );
    bad({ panel: { ...barillaBody.panel, servingSizeG: 0 } });
    bad({ panel: { ...barillaBody.panel, proteinG: null } });
    bad({ panel: { ...barillaBody.panel, fatG: -1 } });
    bad({ panel: { ...barillaBody.panel, calories: "two hundred" } });
    bad({ prep_state: "boiled" });
    bad({ brand: "  " });
    bad({ upc: "12ab" });
    bad({ label_photographed_on: "9/3/2026" });
  });
});

describe("panelFromRow — the edit form reads like the label", () => {
  it("reconstructs the printed Barilla panel from the stored per-100 g row", () => {
    const w = toPackagedFoodWrite(parsePackagedFoodInput(barillaBody));
    const p = panelFromRow({ ...row(BARILLA_TRICOLOR), ...w, label_photographed_on: "2026-09-03" });
    assert.deepEqual(
      [p.calories, p.proteinG, p.carbsG, p.fatG, p.fiberG, p.sugarG, p.sodiumMg],
      [200, 7, 42, 1, 3, 2, 10],
    );
  });
});

describe("splitServingText — grams only when the label prints them", () => {
  it("splits the household measure from the gram figure", () => {
    assert.deepEqual(splitServingText("2 oz (56g)"), { label: "2 oz", grams: 56 });
    assert.deepEqual(splitServingText("1 tsp (6 g)"), { label: "1 tsp", grams: 6 });
    assert.deepEqual(splitServingText("56g"), { label: null, grams: 56 });
  });

  it("returns null grams rather than converting a volume", () => {
    assert.deepEqual(splitServingText("1/2 cup"), { label: "1/2 cup", grams: null });
    assert.deepEqual(splitServingText(null), { label: null, grams: null });
  });
});

describe("catalogFlags — what a row is missing or due for", () => {
  it("flags an old label and a missing net weight, and says which container case applies", () => {
    const r = row(BARILLA_TRICOLOR, {
      label_photographed_on: "2025-01-01",
      servings_per_container: 6,
    });
    const f = catalogFlags(r, "2026-09-26");
    assert.equal(f.length, 2);
    assert.match(f[0], /633 days ago/);
    assert.match(f[1], /inferred from servings/);
    assert.match(catalogFlags(row(BARILLA_TRICOLOR), "2026-09-26")[0], /cannot be priced/);
  });

  it("is quiet for a fresh label with a net weight", () => {
    const r = row(BARILLA_TRICOLOR, { net_weight_g: 340, label_photographed_on: "2026-09-03" });
    assert.deepEqual(catalogFlags(r, "2026-09-26"), []);
  });
});

// ── #722: logging a meal off a label ─────────────────────────────────────────

describe("priceLabelServing — what the meal log writes", () => {
  const yogurt = row(
    { servingSizeG: 170, calories: 100, proteinG: 18, carbsG: 6, fatG: 0 },
    { serving_label: "3/4 cup", net_weight_g: 907 },
  );
  const pasta = row(BARILLA_TRICOLOR, { prep_state: "dry", serving_label: "2 oz" });

  it("prices an as-sold label by weight and rounds like meal_log stores it", () => {
    const p = priceLabelServing(yogurt, 250, "g", null);
    assert.ok(!("refused" in p));
    assert.equal(p.calories, 147); // integer column
    assert.equal(p.protein_g, 26.5);
    assert.equal(p.grams, 250);
  });

  it("prices the label's own measure and servings", () => {
    const cup = priceLabelServing(yogurt, 1.5, "cup", null);
    assert.ok(!("refused" in cup));
    assert.equal(cup.grams, 340); // 1.5 cup / (3/4 cup per 170 g)
    const two = priceLabelServing(yogurt, 2, "serving", null);
    assert.ok(!("refused" in two));
    assert.equal(two.calories, 200);
  });

  it("keeps an unprinted nutrient null, not zero", () => {
    const p = priceLabelServing(yogurt, 170, "g", null);
    assert.ok(!("refused" in p));
    assert.equal(p.fiber_g, null);
    assert.equal(p.sodium_mg, null);
  });

  it("refuses a dry label until the amount is confirmed dry", () => {
    const refused = priceLabelServing(pasta, 170, "g", null);
    assert.ok("refused" in refused);
    assert.match(refused.refused, /confirm the amount is dry/);
    const ok = priceLabelServing(pasta, 84, "g", "dry");
    assert.ok(!("refused" in ok));
    assert.equal(ok.calories, 300);
  });

  it("refuses a unit the label cannot price", () => {
    const p = priceLabelServing(yogurt, 1, "tbsp", null);
    assert.ok("refused" in p);
    assert.match(p.refused, /3\/4 cup/);
  });
});
