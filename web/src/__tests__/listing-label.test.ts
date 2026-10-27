// Amazon Fresh listing labels: parsing and review (lib/nutrition/listing-label.ts).
// Run with: node --experimental-strip-types --test src/__tests__/listing-label.test.ts
// (from the web/ directory)

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  netWeightFromTitle,
  parseListingPanel,
  reviewListingLabel,
  type ListingPanel,
} from "../lib/nutrition/listing-label.ts";
import { KIMCHI_TEXT, SHRIMP_TEXT, panelText } from "./helpers/listing-panels.ts";

const ok = (text: string): ListingPanel => {
  const r = parseListingPanel(text);
  assert.equal(r.ok, true, JSON.stringify(r));
  return (r as { panel: ListingPanel }).panel;
};

describe("parseListingPanel", () => {
  it("reads the panel proper, not the summary strip before it", () => {
    const p = ok(SHRIMP_TEXT);
    assert.equal(p.servingSizeG, 85);
    assert.equal(p.servingLabel, "3 oz About 11 shrimp");
    assert.equal(p.servingsPerContainer, 1);
    assert.deepEqual(
      [p.calories, p.proteinG, p.carbsG, p.fatG, p.fiberG, p.sugarG, p.sodiumMg],
      [100, 19, 1, 1.5, 0, 0, 0],
    );
  });

  it("prefers Total Sugars over the Added Sugars line", () => {
    const p = ok(KIMCHI_TEXT);
    assert.equal(p.sugarG, 2);
    assert.equal(p.sodiumMg, 270);
  });

  it("refuses an empty element: the label is only a photo", () => {
    const r = parseListingPanel("   ");
    assert.equal(r.ok, false);
    assert.match((r as { reason: string }).reason, /only a photo/);
  });

  it("refuses a serving with no gram weight (generic produce: '1.0 cup')", () => {
    const r = parseListingPanel(
      "Nutrition information 1.0 servings per container Serving size 1.0 cup Amount per 1.0 cup " +
        "Calories 19 Total Fat 0.3g Total Carbohydrate 3.3g Protein 1.815g",
    );
    assert.equal(r.ok, false);
    assert.match((r as { reason: string }).reason, /no gram weight/);
  });

  it("refuses a panel missing a core macro rather than storing a zero", () => {
    const r = parseListingPanel(
      "Serving size 1 cup (84g) Amount per 1 cup (84g) Calories 30 Total Fat 0g Protein 1g",
    );
    assert.equal(r.ok, false);
    assert.match((r as { reason: string }).reason, /total carbohydrate/);
  });

  it("stores a 'less than' value at half its bound and says so", () => {
    const p = ok(
      panelText({
        servings: "5",
        serving: "1 cup (84g)",
        kcal: "30",
        fat: "0",
        carbs: "6",
        protein: "<1",
      }),
    );
    assert.equal(p.proteinG, 0.5);
    assert.deepEqual(p.lessThan, ["protein"]);
  });
});

describe("netWeightFromTitle", () => {
  it("reads oz, lb and g from listing titles", () => {
    assert.equal(
      netWeightFromTitle("Amazon Grocery, Medium Cooked Shrimp, 12 Oz (Previously…)"),
      340.19,
    );
    assert.equal(netWeightFromTitle("Birds Eye Pepper Stir Fry Vegetables, 14.4 OZ Bag"), 408.23);
    assert.equal(netWeightFromTitle("100% Pure Ground Beef, 93% Lean / 7% Fat, 1 Lb"), 453.59);
    assert.equal(netWeightFromTitle("CJ Gochujang 500g"), 500);
  });

  it("ignores fluid ounces and counts", () => {
    assert.equal(netWeightFromTitle("Waterloo Sparkling Water, 12 Fl Oz Cans (Pack of 12)"), null);
    assert.equal(netWeightFromTitle("Cage Free Large Brown Eggs, Grade AA, 18 Ct"), null);
  });
});

describe("reviewListingLabel", () => {
  it("repairs the shrimp listing: servings from net weight, 0 mg sodium on shrimp as unknown", () => {
    const r = reviewListingLabel(ok(SHRIMP_TEXT), { netWeightG: 340.19, animalProtein: true });
    assert.equal(r.ok, true);
    const { per100g, servingsPerContainer, flags } = (r as Extract<typeof r, { ok: true }>).review;
    assert.equal(servingsPerContainer, 4);
    assert.equal(per100g.calories_per_100g, 117.65);
    assert.equal(per100g.protein_per_100g, 22.35);
    assert.equal(per100g.sodium_mg_per_100g, null);
    assert.equal(flags.length, 2);
    assert.match(flags[0], /1 servings x 85 g = 85 g against a 340.19 g net weight/);
    assert.match(flags[1], /0 mg sodium on an animal protein/);
  });

  it("keeps a 0 mg sodium when the food is not an animal protein", () => {
    const p = ok(
      panelText({
        servings: "5",
        serving: "1 cup (84g)",
        kcal: "30",
        fat: "0",
        carbs: "6",
        protein: "1",
      }),
    );
    const r = reviewListingLabel(p, { netWeightG: 408.23 });
    const review = (r as Extract<typeof r, { ok: true }>).review;
    assert.equal(review.per100g.sodium_mg_per_100g, 0);
    assert.equal(review.servingsPerContainer, 5, "5 x 84 = 420 g is within 15% of 408 g");
    assert.deepEqual(review.flags, []);
  });

  it("refuses values that are not label-rounded — generic produce data", () => {
    const p = ok(
      panelText({
        servings: "1",
        serving: "1 apple (182g)",
        kcal: "95",
        fat: "0.31",
        carbs: "25",
        protein: "0.47",
      }),
    );
    const r = reviewListingLabel(p);
    assert.equal(r.ok, false);
    assert.match(
      (r as { reason: string }).reason,
      /not label-rounded \(protein 0.47, fat 0.31\)|not label-rounded/,
    );
    assert.match((r as { reason: string }).reason, /fdc_id/);
  });

  it("flags, but keeps, energy that is far off 4P + 4C + 9F", () => {
    const p = ok(
      panelText({
        servings: "4",
        serving: "1 bar (50g)",
        kcal: "200",
        fat: "2",
        carbs: "10",
        protein: "10",
      }),
    );
    const r = reviewListingLabel(p);
    const review = (r as Extract<typeof r, { ok: true }>).review;
    assert.equal(review.per100g.calories_per_100g, 400);
    assert.equal(review.flags.length, 1);
    assert.match(review.flags[0], /more than 20% off 4P\+4C\+9F = 98 kcal/);
  });
});
