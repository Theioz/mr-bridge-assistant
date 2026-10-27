// Contract tests for the plan_meals and pin_grocery_product MCP tools (#4, #761).
// Run with: node --experimental-strip-types --test src/__tests__/meal-tools.test.ts
// (from the web/ directory)
//
// WHY THIS EXISTS
//
// These are the two meal tools a model calls to commit money and cooking: a plan entry with
// no recipe or cook has no instructions and no macros, and a pin decides which product the
// grocery list buys forever after. The tool wrappers in lib/tools/meals.ts delegate to
// lib/tools/meal-actions.ts, which these tests run against an in-memory database.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { pinGroceryProduct, planMeals } from "../lib/tools/meal-actions.ts";
import { FakeSupabase, type Row } from "./helpers/fake-supabase.ts";
import { KIMCHI_TEXT, SHRIMP_TEXT, panelText } from "./helpers/listing-panels.ts";

const USER = "user-1";
const ASIN = "B07COD0001";

describe("pin_grocery_product", () => {
  it("rejects a value that is not a 10-character ASIN, writing nothing", async () => {
    const db = new FakeSupabase();
    for (const asin of ["B07COD", "B07COD00012", "B07-COD-001", ""]) {
      const res = await pinGroceryProduct(db.client, USER, { asin, title: "Cod" });
      assert.match((res as { error: string }).error, /is not an ASIN/, asin);
    }
    assert.equal(db.calls.length, 0);
  });

  it("normalizes a lower-case, padded ASIN", async () => {
    const db = new FakeSupabase();
    const res = await pinGroceryProduct(db.client, USER, {
      asin: "  b07cod0001 ",
      title: "Cod",
      fdc_id: 175174,
    });
    assert.equal((res as { pinned: Row }).pinned.asin, ASIN);
    assert.equal((res as { url: string }).url, `https://www.amazon.com/dp/${ASIN}?fpw=alm`);
  });

  it("requires a food identity: fdc_id or packaged_food_id", async () => {
    const db = new FakeSupabase();
    const res = await pinGroceryProduct(db.client, USER, { asin: ASIN, title: "Cod" });
    assert.deepEqual(res, { error: "Pin to a food: pass fdc_id or packaged_food_id" });
    assert.equal(db.calls.length, 0);
  });

  it("accepts fdc_id 0 as an identity (a null check, not a truthiness check)", async () => {
    const db = new FakeSupabase();
    const res = await pinGroceryProduct(db.client, USER, { asin: ASIN, title: "X", fdc_id: 0 });
    assert.equal("error" in res, false);
  });

  it("converts the pack size to grams (14 oz → 396.89 g)", async () => {
    const db = new FakeSupabase();
    await pinGroceryProduct(db.client, USER, {
      asin: ASIN,
      title: "Cod, 14 oz",
      fdc_id: 175174,
      pack_quantity: 14,
      pack_unit: "oz",
      price_usd: 10.99,
    });
    const [row] = db.table("grocery_products");
    assert.equal(row.pack_grams, 396.89);
    assert.equal(row.price_cents, 1099);
    assert.ok(row.price_seen_at);
    assert.equal(row.fresh, true, "defaults to Fresh");
  });

  it("rejects a volume or unknown pack unit rather than guessing grams", async () => {
    const db = new FakeSupabase();
    const res = await pinGroceryProduct(db.client, USER, {
      asin: ASIN,
      title: "Milk",
      fdc_id: 1,
      pack_quantity: 64,
      pack_unit: "fl oz",
    });
    assert.match((res as { error: string }).error, /not a weight unit/);
    assert.equal(db.table("grocery_products").length, 0);
  });

  it("leaves pack_grams null for count-sold produce", async () => {
    const db = new FakeSupabase();
    await pinGroceryProduct(db.client, USER, { asin: ASIN, title: "Cabbage", fdc_id: 2 });
    assert.equal(db.table("grocery_products")[0].pack_grams, null);
  });

  it("re-pinning a food replaces its product, scoped to that food and user", async () => {
    const db = new FakeSupabase({
      grocery_products: [
        { user_id: USER, asin: "B000OLD001", title: "Old cod", fdc_id: 175174 },
        { user_id: USER, asin: "B000TOFU01", title: "Tofu", fdc_id: 172475 },
        { user_id: "someone-else", asin: "B000OTHER1", title: "Their cod", fdc_id: 175174 },
      ],
    });

    const res = await pinGroceryProduct(db.client, USER, {
      asin: ASIN,
      title: "New cod",
      fdc_id: 175174,
    });

    assert.deepEqual((res as { replaced: Row[] }).replaced, [
      { asin: "B000OLD001", title: "Old cod" },
    ]);
    const mine = db
      .table("grocery_products")
      .filter((r) => r.user_id === USER)
      .map((r) => [r.asin, r.fdc_id]);
    assert.deepEqual(mine.sort(), [
      ["B000TOFU01", 172475],
      [ASIN, 175174],
    ]);
    assert.ok(
      db.table("grocery_products").some((r) => r.asin === "B000OTHER1"),
      "another user's pin is untouched",
    );
  });

  it("re-pinning the same ASIN updates it in place", async () => {
    const db = new FakeSupabase({
      grocery_products: [{ user_id: USER, asin: ASIN, title: "Cod", fdc_id: 175174 }],
    });
    const res = await pinGroceryProduct(db.client, USER, {
      asin: ASIN,
      title: "Cod (new title)",
      fdc_id: 175174,
      pack_quantity: 1,
      pack_unit: "lb",
    });
    assert.deepEqual((res as { replaced: Row[] }).replaced, []);
    const rows = db.table("grocery_products");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].title, "Cod (new title)");
    assert.equal(rows[0].pack_grams, 453.59);
  });

  it("identifies by packaged_food_id when given", async () => {
    const db = new FakeSupabase({
      grocery_products: [
        { user_id: USER, asin: "B000OLD001", title: "Old bar", packaged_food_id: "pf-1" },
      ],
    });
    await pinGroceryProduct(db.client, USER, {
      asin: ASIN,
      title: "Bar",
      packaged_food_id: "pf-1",
    });
    assert.deepEqual(
      db.table("grocery_products").map((r) => r.asin),
      [ASIN],
    );
  });

  it("returns a database error instead of throwing", async () => {
    const db = new FakeSupabase();
    db.failures.set("grocery_products:upsert", "unique violation");
    const res = await pinGroceryProduct(db.client, USER, { asin: ASIN, title: "X", fdc_id: 1 });
    assert.deepEqual(res, { error: "unique violation" });
  });
});

describe("pin_grocery_product with a listing label", () => {
  const SHRIMP = "B07ZS3ZTCC";
  const SHRIMP_TITLE = "Amazon Grocery, Medium Cooked Shrimp, 12 Oz";
  const shrimpLabel = {
    brand: "Amazon Grocery",
    product: "Medium Cooked Shrimp",
    panel_text: SHRIMP_TEXT,
    prep_state: "cooked" as const,
    animal_protein: true,
  };
  type Pinned = { pinned: Row; label: Row; replaced: Row[] };

  it("stores the parsed panel in packaged_foods and links the pin to it", async () => {
    const db = new FakeSupabase();
    const res = (await pinGroceryProduct(db.client, USER, {
      asin: SHRIMP,
      title: SHRIMP_TITLE,
      label: shrimpLabel,
    })) as Pinned;

    assert.equal(res.label.status, "created");
    const [food] = db.table("packaged_foods");
    assert.equal(res.pinned.packaged_food_id, food.id, "the pin carries the label");
    assert.equal(food.user_id, USER);
    assert.equal(food.brand, "Amazon Grocery");
    assert.equal(food.prep_state, "cooked");
    assert.equal(food.serving_size_g, 85);
    assert.equal(food.net_weight_g, 340.19, "net weight read from the title");
    assert.equal(food.servings_per_container, 4, "the listing's 1.0 servings is repaired");
    assert.equal(food.calories_per_100g, 117.65);
    assert.equal(food.protein_per_100g, 22.35);
    assert.equal(food.sodium_mg_per_100g, null, "0 mg sodium on shrimp is stored as unknown");
    assert.ok(food.label_photographed_on, "the required date column is filled");
    const meta = food.metadata as Row;
    assert.equal(meta.source, "amazon_listing");
    assert.equal(meta.asin, SHRIMP);
    assert.equal(meta.photographed, false);
    assert.equal((meta.per_serving_as_listed as Row).sodium_mg, 0, "what the page said is kept");
    assert.match(String(meta.panel_text), /^Nutrition information/, "audit trail");
    assert.equal((res.label.flags as string[]).length, 2);
  });

  it("never overwrites a photographed label: links it and leaves it alone", async () => {
    const db = new FakeSupabase({
      packaged_foods: [
        {
          id: "pf-photo",
          user_id: USER,
          brand: "amazon grocery ",
          product: "Medium Cooked Shrimp",
          calories_per_100g: 99,
          metadata: {},
        },
      ],
    });
    const res = (await pinGroceryProduct(db.client, USER, {
      asin: SHRIMP,
      title: SHRIMP_TITLE,
      label: shrimpLabel,
    })) as Pinned;
    assert.equal(res.label.status, "kept_photographed");
    assert.equal(res.pinned.packaged_food_id, "pf-photo");
    assert.equal(db.table("packaged_foods").length, 1);
    assert.equal(db.table("packaged_foods")[0].calories_per_100g, 99);
  });

  it("refreshes its own earlier capture of the same ASIN in place", async () => {
    const at = "2026-10-20T10:00:00.000Z";
    const db = new FakeSupabase({
      packaged_foods: [
        {
          id: "pf-listing",
          user_id: USER,
          brand: "Amazon Grocery",
          product: "Shrimp (old name)",
          calories_per_100g: 50,
          updated_at: at,
          metadata: { source: "amazon_listing", asin: SHRIMP, captured_at: at },
        },
      ],
    });
    const res = (await pinGroceryProduct(db.client, USER, {
      asin: SHRIMP,
      title: SHRIMP_TITLE,
      label: shrimpLabel,
    })) as Pinned;
    assert.equal(res.label.status, "updated");
    assert.equal(res.label.packaged_food_id, "pf-listing");
    assert.equal(db.table("packaged_foods").length, 1);
    assert.equal(db.table("packaged_foods")[0].calories_per_100g, 117.65);
  });

  it("treats a capture edited afterwards in the Catalog tab as a person's label", async () => {
    const db = new FakeSupabase({
      packaged_foods: [
        {
          id: "pf-edited",
          user_id: USER,
          brand: "Amazon Grocery",
          product: "Medium Cooked Shrimp",
          calories_per_100g: 105,
          updated_at: "2026-10-30T09:00:00.000Z",
          metadata: {
            source: "amazon_listing",
            asin: SHRIMP,
            captured_at: "2026-10-26T10:00:00.000Z",
          },
        },
      ],
    });
    const res = (await pinGroceryProduct(db.client, USER, {
      asin: SHRIMP,
      title: SHRIMP_TITLE,
      label: shrimpLabel,
    })) as Pinned;
    assert.equal(res.label.status, "kept_photographed");
    assert.equal(db.table("packaged_foods")[0].calories_per_100g, 105);
  });

  it("a photo-only listing still pins by fdc_id and reports why no label was stored", async () => {
    const db = new FakeSupabase();
    const res = (await pinGroceryProduct(db.client, USER, {
      asin: ASIN,
      title: "Just Bare Chicken Thighs, 1.25 LB",
      fdc_id: 173627,
      label: { brand: "Just Bare", product: "Chicken Thighs", panel_text: "" },
    })) as Pinned;
    assert.equal(res.label.status, "skipped");
    assert.match(String(res.label.reason), /only a photo/);
    assert.equal(res.pinned.fdc_id, 173627);
    assert.equal(db.table("packaged_foods").length, 0);
  });

  it("with no fdc_id and no usable panel, refuses and writes nothing", async () => {
    const db = new FakeSupabase();
    const res = await pinGroceryProduct(db.client, USER, {
      asin: ASIN,
      title: "Apples, 3 lb",
      label: {
        brand: "Amazon Grocery",
        product: "Honeycrisp Apples",
        panel_text: panelText({
          servings: "1",
          serving: "1 apple (182g)",
          kcal: "95",
          fat: "0.31",
          carbs: "25",
          protein: "0.47",
        }),
      },
    });
    assert.match(
      (res as { error: string }).error,
      /listing label not usable: values are not label-rounded/,
    );
    assert.equal(db.table("grocery_products").length, 0);
    assert.equal(db.table("packaged_foods").length, 0);
  });

  it("an explicit packaged_food_id wins over the listing", async () => {
    const db = new FakeSupabase();
    const res = (await pinGroceryProduct(db.client, USER, {
      asin: "B098PVNV18",
      title: "Cleveland Kitchen Classic Kimchi, 16 oz",
      packaged_food_id: "pf-chosen",
      label: { brand: "Cleveland Kitchen", product: "Classic Kimchi", panel_text: KIMCHI_TEXT },
    })) as Pinned;
    assert.equal(res.label.status, "skipped");
    assert.equal(res.pinned.packaged_food_id, "pf-chosen");
    assert.equal(db.table("packaged_foods").length, 0);
  });

  it("re-pinning without a label keeps the label link the pin already has", async () => {
    const db = new FakeSupabase({
      grocery_products: [
        { user_id: USER, asin: ASIN, title: "Beef", fdc_id: 173110, packaged_food_id: "pf-beef" },
      ],
    });
    await pinGroceryProduct(db.client, USER, {
      asin: ASIN,
      title: "Beef",
      fdc_id: 173110,
      price_usd: 8.19,
    });
    const [row] = db.table("grocery_products");
    assert.equal(row.packaged_food_id, "pf-beef");
    assert.equal(row.price_cents, 819);
  });

  it("a pin with both identities replaces rivals on either one", async () => {
    const db = new FakeSupabase({
      grocery_products: [
        { user_id: USER, asin: "B000FDC001", title: "Old by fdc", fdc_id: 175180 },
      ],
    });
    const res = (await pinGroceryProduct(db.client, USER, {
      asin: SHRIMP,
      title: SHRIMP_TITLE,
      fdc_id: 175180,
      label: shrimpLabel,
    })) as Pinned;
    assert.deepEqual(res.replaced, [{ asin: "B000FDC001", title: "Old by fdc" }]);
    assert.deepEqual(
      db.table("grocery_products").map((r) => [r.asin, r.fdc_id, r.packaged_food_id]),
      [[SHRIMP, 175180, db.table("packaged_foods")[0].id]],
    );
  });
});

describe("plan_meals", () => {
  it("rejects an entry with neither cook_id nor recipe_id, writing nothing", async () => {
    const db = new FakeSupabase();
    const res = await planMeals(db.client, USER, [
      { date: "2026-10-12", meal_type: "lunch", recipe_id: "r1" },
      { date: "2026-10-12", meal_type: "dinner", name: "Takeout" },
    ]);
    assert.match((res as { error: string }).error, /^2026-10-12 dinner: every planned meal must/);
    assert.equal(db.calls.length, 0, "a bad entry rejects the whole batch");
  });

  it("rejects an entry with both cook_id and recipe_id", async () => {
    const db = new FakeSupabase();
    const res = await planMeals(db.client, USER, [
      { date: "2026-10-12", meal_type: "lunch", recipe_id: "r1", cook_id: "c1" },
    ]);
    assert.match((res as { error: string }).error, /cook_id OR recipe_id, not both/);
    assert.equal(db.calls.length, 0);
  });

  it("writes valid entries, and re-planning a date+meal_type replaces it", async () => {
    const db = new FakeSupabase({
      meal_plans: [
        {
          id: "p-old",
          user_id: USER,
          date: "2026-10-12",
          meal_type: "dinner",
          recipe_id: "r-old",
          status: "planned",
        },
      ],
    });
    const res = await planMeals(db.client, USER, [
      { date: "2026-10-12", meal_type: "dinner", cook_id: "c1" },
      { date: "2026-10-13", meal_type: "lunch", recipe_id: "r2", portions: 2 },
    ]);

    assert.equal((res as { planned: number }).planned, 2);
    const rows = db.table("meal_plans");
    assert.equal(rows.length, 2);
    const dinner = rows.find((r) => r.meal_type === "dinner")!;
    assert.equal(dinner.id, "p-old");
    assert.equal(dinner.cook_id, "c1");
    assert.equal(dinner.recipe_id, null);
    assert.equal(dinner.portions, 1, "portions default to 1");
    assert.equal(rows.find((r) => r.meal_type === "lunch")!.portions, 2);
  });

  it("requires a user context", async () => {
    const db = new FakeSupabase();
    assert.deepEqual(await planMeals(db.client, "", []), { error: "No user context" });
    assert.deepEqual(await pinGroceryProduct(db.client, "", { asin: ASIN, title: "X" }), {
      error: "No user context",
    });
  });
});
