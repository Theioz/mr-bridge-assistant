// Unit tests for the cook-time inventory draw (lib/nutrition/inventory-draw.ts).
// Run with: node --experimental-strip-types --test src/__tests__/inventory-draw.test.ts
//
// WHY THIS EXISTS
//
// Auto-decrementing inventory was deferred for a year (#649) on one specific fear: a wrong
// decrement silently corrupts a count that nothing else in the app can contradict. A missing
// decrement leaves a number that is too high and stays visible; a wrong one looks exactly like
// a right one forever after.
//
// So the behaviour under test is mostly REFUSAL. Most of these cases assert that a line is
// skipped — that "Garlic" does not draw down "Garlic powder", that 250 g of black beans does
// not invent a can size, that a staple with an untracked amount is left alone. The draws that
// do happen are the narrow, checkable middle.
//
// The names and quantities are taken from the live library and the live kitchen as of
// 2026-08-26, not invented, because the matcher's whole job is to work on those exact strings.

import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  normalizeFoodName,
  gramsForIngredient,
  gramsToUnit,
  planDraw,
} from "../lib/nutrition/inventory-draw.ts";

const tokens = (s: string) => [...normalizeFoodName(s)].sort().join(" ");
const same = (a: string, b: string) => tokens(a) === tokens(b);

// ── Name normalization ──────────────────────────────────────────────────────

test("real recipe names and real stock names reduce to the same tokens", () => {
  // Left: how the ingredient line is written. Right: how the kitchen row is written.
  assert.ok(same("gochujang (3 tbsp)", "Gochujang (CJ Haechandle)"));
  assert.ok(same("Salmon, Atlantic, raw", "Salmon, Atlantic (MOWI) — frozen"));
  assert.ok(same("Edamame, shelled, frozen", "Edamame (shelled)"));
  assert.ok(same("Black beans, canned, drained", "Black beans (canned)"));
  assert.ok(same("Ground beef, 93/7, raw", "Ground beef, 93/7 — frozen"));
});

test("the grade survives normalization — 93/7 is not the same purchase as 80/20", () => {
  assert.ok(!same("Ground beef, 93/7, raw", "Ground beef, 80/20, raw"));
});

test("a narrower food does not match a broader one — the subset trap", () => {
  // This is the case that makes set EQUALITY the rule rather than subset matching. Under
  // subset matching {garlic} ⊂ {garlic, powder} and a recipe wanting fresh garlic would
  // quietly draw down the jar of powder.
  assert.ok(!same("Garlic, raw", "Garlic powder"));
  assert.ok(!same("Onion", "Onion soup mix"));
  assert.ok(!same("Black beans, canned", "Kidney beans, dark red organic (365)"));
});

test("brand and spoon parentheticals are dropped wholesale", () => {
  assert.equal(tokens("Gochujang (CJ Haechandle)"), "gochujang");
  assert.equal(tokens("gochujang (1 tbsp)"), "gochujang");
  assert.equal(tokens("Egg, whole, raw (1 large)"), "egg");
});

// ── Weights ─────────────────────────────────────────────────────────────────

test("gramsForIngredient converts every weight unit the library uses", () => {
  assert.equal(gramsForIngredient({ item: "x", quantity: 300, unit: "g" }), 300);
  assert.equal(gramsForIngredient({ item: "x", quantity: 1, unit: "kg" }), 1000);
  assert.equal(
    Math.round(gramsForIngredient({ item: "x", quantity: 8.5, unit: "oz" }) as number),
    241,
  );
  assert.equal(
    Math.round(gramsForIngredient({ item: "x", quantity: 1.25, unit: "lb" }) as number),
    567,
  );
});

test("a spoon-measured line reads the grams its author wrote into the label", () => {
  // The recipe invariants require the spoon line to carry its grams, so this reads a stored
  // value rather than deriving a density — which would be exactly the fabrication the
  // nutrition pipeline forbids.
  assert.equal(gramsForIngredient({ item: "avocado oil (27 g)", quantity: 2, unit: "tbsp" }), 27);
  assert.equal(gramsForIngredient({ item: "fish sauce (12 g)", quantity: 2, unit: "tsp" }), 12);
});

test("a line with neither a weight unit nor a labelled weight has NO weight", () => {
  assert.equal(gramsForIngredient({ item: "Salt, to taste", quantity: null, unit: null }), null);
  assert.equal(gramsForIngredient({ item: "Tortillas", quantity: 2, unit: "each" }), null);
});

test("gramsToUnit refuses count units rather than inventing a size", () => {
  assert.equal(gramsToUnit(250, "can"), null);
  assert.equal(gramsToUnit(250, "bottle"), null);
  assert.equal(gramsToUnit(250, "bunch"), null);
  assert.equal(gramsToUnit(250, "g"), 250);
  assert.equal(Math.round(gramsToUnit(453.592, "lb") as number), 1);
});

// ── planDraw ────────────────────────────────────────────────────────────────

interface FakeRecipe {
  id: string;
  name: string;
  typical_portions: number | null;
  ingredients_json: unknown[] | null;
}
interface FakeStock {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  location: string;
  expires_on: string | null;
  fdc_id: number | null;
}

/** Minimal stand-in for the two reads planDraw performs. */
function fakeDb(recipe: FakeRecipe | null, stock: FakeStock[]): SupabaseClient {
  return {
    from(table: string) {
      if (table === "recipes") {
        const chain = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () => ({ data: recipe, error: null }),
        };
        return chain;
      }
      const result = { data: stock, error: null };
      const chain = { select: () => chain, eq: async () => result };
      return chain;
    },
  } as unknown as SupabaseClient;
}

const GOCHUJANG_STOCK: FakeStock = {
  id: "stock-gochujang",
  name: "Gochujang (CJ Haechandle)",
  quantity: 465,
  unit: "g",
  location: "pantry",
  expires_on: null,
  fdc_id: null,
};

const BEANS_STOCK: FakeStock = {
  id: "stock-beans",
  name: "Black beans (canned)",
  quantity: 4,
  unit: "can",
  location: "pantry",
  expires_on: null,
  fdc_id: null,
};

const RICE_STAPLE: FakeStock = {
  id: "stock-rice",
  name: "Brown rice",
  quantity: null, // staple — on hand, amount untracked
  unit: null,
  location: "pantry",
  expires_on: null,
  fdc_id: null,
};

/** The real 4-portion Gochujang Chicken batch, trimmed to the lines under test. */
const GOCHUJANG_RECIPE: FakeRecipe = {
  id: "r1",
  name: "Gochujang Chicken + Shredded Brussels + Black Beans + Brown Rice",
  typical_portions: 4,
  ingredients_json: [
    { item: "gochujang (3 tbsp)", quantity: 60, unit: "g", fdc_id: 2113732 },
    { item: "Black beans, canned, drained", quantity: 250, unit: "g", fdc_id: 175188 },
    { item: "dry brown rice, long-grain", quantity: 150, unit: "g", fdc_id: 169703 },
    { item: "Chicken breast raw", quantity: 1149, unit: "g", fdc_id: 171077 },
  ],
};

test("a full batch draws the ingredient list exactly once", async () => {
  const db = fakeDb(GOCHUJANG_RECIPE, [GOCHUJANG_STOCK, BEANS_STOCK, RICE_STAPLE]);
  const plan = await planDraw(db, "u1", { recipeId: "r1", portionsCooked: 4 });

  assert.equal(plan.scale, 1);
  assert.equal(plan.draws.length, 1);
  const [draw] = plan.draws;
  assert.equal(draw.itemName, "Gochujang (CJ Haechandle)");
  assert.equal(draw.quantityApplied, 60);
  assert.equal(draw.quantityAfter, 405);
  assert.equal(draw.shortfallGrams, 0);
});

test("HALF a batch draws half the list — the ingredient list is the batch, not a serving", () => {
  // The bug this pins: `recipes.calories` is ONE SERVING but `ingredients_json` is the WHOLE
  // BATCH. Reading the list as per-serving and multiplying by portions would have drawn 240 g
  // of gochujang for a batch that used 60.
  return (async () => {
    const db = fakeDb(GOCHUJANG_RECIPE, [GOCHUJANG_STOCK]);
    const plan = await planDraw(db, "u1", { recipeId: "r1", portionsCooked: 2 });
    assert.equal(plan.scale, 0.5);
    assert.equal(plan.draws[0].quantityApplied, 30);
    assert.equal(plan.draws[0].quantityAfter, 435);
  })();
});

test("a count-unit row is skipped, never converted", async () => {
  const db = fakeDb(GOCHUJANG_RECIPE, [GOCHUJANG_STOCK, BEANS_STOCK, RICE_STAPLE]);
  const plan = await planDraw(db, "u1", { recipeId: "r1", portionsCooked: 4 });

  const beans = plan.skips.find((s) => s.ingredient.startsWith("Black beans"));
  assert.equal(beans?.reason, "unconvertible-unit");
  assert.match(beans?.detail ?? "", /no conversion from can/);
  // And the row is untouched in the plan.
  assert.ok(!plan.draws.some((d) => d.itemId === "stock-beans"));
});

test("a staple is skipped — an untracked amount must not become a tracked one", async () => {
  const oats: FakeStock = {
    id: "stock-oats",
    name: "Rolled oats",
    quantity: null, // staple
    unit: null,
    location: "pantry",
    expires_on: null,
    fdc_id: null,
  };
  const recipe: FakeRecipe = {
    id: "r-oats",
    name: "Oatmeal",
    typical_portions: 1,
    ingredients_json: [{ item: "Rolled oats, dry", quantity: 80, unit: "g", fdc_id: 169705 }],
  };
  const db = fakeDb(recipe, [oats]);
  const plan = await planDraw(db, "u1", { recipeId: "r-oats", portionsCooked: 1 });

  assert.equal(plan.draws.length, 0);
  assert.equal(plan.skips[0].reason, "staple");
  assert.match(plan.skips[0].detail, /staple/);
});

test("a varietal difference declines the match rather than assuming — long-grain vs plain", async () => {
  // "dry brown rice, long-grain" against a row called "Brown rice". `dry` is a state word and
  // is stripped, but `long grain` is a varietal distinction the way `93/7` is, and equality
  // refuses it. The line is REPORTED as unmatched — the outcome is a visible skip the user can
  // resolve by tagging the row's fdc_id, never a quiet draw against the wrong rice.
  const db = fakeDb(GOCHUJANG_RECIPE, [GOCHUJANG_STOCK, BEANS_STOCK, RICE_STAPLE]);
  const plan = await planDraw(db, "u1", { recipeId: "r1", portionsCooked: 4 });

  const rice = plan.skips.find((s) => s.ingredient.includes("brown rice"));
  assert.equal(rice?.reason, "no-match");
  assert.ok(!plan.draws.some((d) => d.itemId === "stock-rice"));
});

test("an ingredient the kitchen does not hold is reported, not silently dropped", async () => {
  const db = fakeDb(GOCHUJANG_RECIPE, [GOCHUJANG_STOCK, BEANS_STOCK, RICE_STAPLE]);
  const plan = await planDraw(db, "u1", { recipeId: "r1", portionsCooked: 4 });

  const chicken = plan.skips.find((s) => s.ingredient === "Chicken breast raw");
  assert.equal(chicken?.reason, "no-match");
  assert.equal(chicken?.grams, 1149);
  // Every line is accounted for exactly once: nothing vanishes between the two lists.
  assert.equal(plan.draws.length + plan.skips.length, 4);
});

test("fdc_id beats the name — it matches a row the name rule would decline", async () => {
  const tagged: FakeStock = {
    id: "stock-cj",
    name: "Hot pepper paste, Korean", // no token overlap with "gochujang (3 tbsp)"
    quantity: 465,
    unit: "g",
    location: "pantry",
    expires_on: null,
    fdc_id: 2113732,
  };
  const db = fakeDb(GOCHUJANG_RECIPE, [tagged]);
  const plan = await planDraw(db, "u1", { recipeId: "r1", portionsCooked: 4 });

  assert.equal(plan.draws.length, 1);
  assert.equal(plan.draws[0].matchMethod, "fdc_id");
  assert.equal(plan.draws[0].itemId, "stock-cj");
});

test("a draw is clamped at what the row holds, and the shortfall is stated", async () => {
  const nearlyEmpty = { ...GOCHUJANG_STOCK, quantity: 40 };
  const db = fakeDb(GOCHUJANG_RECIPE, [nearlyEmpty]);
  const plan = await planDraw(db, "u1", { recipeId: "r1", portionsCooked: 4 });

  const [draw] = plan.draws;
  assert.equal(draw.quantityApplied, 40); // not the 60 requested
  assert.equal(draw.quantityAfter, 0);
  assert.equal(draw.shortfallGrams, 20);
});

test("the fridge is drawn down before the freezer", async () => {
  const recipe: FakeRecipe = {
    id: "r2",
    name: "Salmon",
    typical_portions: 1,
    ingredients_json: [{ item: "Salmon, Atlantic, raw", quantity: 200, unit: "g", fdc_id: 175168 }],
  };
  const freezer: FakeStock = {
    id: "s-freezer",
    name: "Salmon, Atlantic (MOWI) — frozen",
    quantity: 340,
    unit: "g",
    location: "freezer",
    expires_on: null,
    fdc_id: null,
  };
  const fridge: FakeStock = {
    id: "s-fridge",
    name: "Salmon, Atlantic — fresh",
    quantity: 250,
    unit: "g",
    location: "fridge",
    expires_on: "2026-08-28",
    fdc_id: null,
  };
  // Freezer listed first, so an implementation that just took the first match would fail.
  const db = fakeDb(recipe, [freezer, fridge]);
  const plan = await planDraw(db, "u1", { recipeId: "r2", portionsCooked: 1 });

  assert.equal(plan.draws[0].itemId, "s-fridge");
  assert.equal(plan.draws[0].otherCandidates, 1);
});

test("two lines wanting the same row do not both spend the original quantity", async () => {
  // A marinade and a sauce both calling for gochujang. Planning each against the row's stored
  // 70 g would promise 120 g out of a row that holds 70.
  const recipe: FakeRecipe = {
    id: "r3",
    name: "Double gochujang",
    typical_portions: 1,
    ingredients_json: [
      { item: "gochujang (3 tbsp)", quantity: 60, unit: "g", fdc_id: 2113732 },
      { item: "gochujang (3 tbsp)", quantity: 60, unit: "g", fdc_id: 2113732 },
    ],
  };
  const db = fakeDb(recipe, [{ ...GOCHUJANG_STOCK, quantity: 70 }]);
  const plan = await planDraw(db, "u1", { recipeId: "r3", portionsCooked: 1 });

  assert.equal(plan.draws[0].quantityApplied, 60);
  assert.equal(plan.draws[1].quantityApplied, 10); // what was actually left
  assert.equal(plan.draws[1].shortfallGrams, 50);
  const total = plan.draws.reduce((sum, d) => sum + d.quantityApplied, 0);
  assert.equal(total, 70); // never more than the row held
});

test("a recipe with no ingredient list draws nothing and throws nothing", async () => {
  const bare: FakeRecipe = {
    id: "r4",
    name: "Avocado Toast",
    typical_portions: 1,
    ingredients_json: null,
  };
  const db = fakeDb(bare, [GOCHUJANG_STOCK]);
  const plan = await planDraw(db, "u1", { recipeId: "r4", portionsCooked: 1 });
  assert.equal(plan.draws.length, 0);
  assert.equal(plan.skips.length, 0);
});

test("a recipe with no typical_portions is treated as a single serving", async () => {
  const single: FakeRecipe = {
    ...GOCHUJANG_RECIPE,
    id: "r5",
    typical_portions: null,
  };
  const db = fakeDb(single, [GOCHUJANG_STOCK]);
  const plan = await planDraw(db, "u1", { recipeId: "r5", portionsCooked: 1 });
  assert.equal(plan.typicalPortions, 1);
  assert.equal(plan.scale, 1);
  assert.equal(plan.draws[0].quantityApplied, 60);
});
