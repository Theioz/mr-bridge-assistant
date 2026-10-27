import { tool, jsonSchema } from "ai";
import { todayString, daysAgoString, addDays } from "@/lib/timezone";
import type { ToolContext } from "./_context";
import { createCook, getLeftovers } from "@/lib/nutrition/cooks";
import { getGroceryList } from "@/lib/nutrition/grocery-list";
import { planMeals, pinGroceryProduct, type ListingLabelInput } from "./meal-actions.ts";
import { receiveGroceryOrder } from "@/lib/nutrition/grocery-receive";

/**
 * Meal tools.
 *
 * NOTE ON THE INVARIANT: no tool here accepts a macro number. The model chooses WHAT is
 * cooked and eaten; USDA FoodData Central decides what is in it. `log_cook` takes a recipe
 * or an ingredient list and a portion count — the macros are copied from the recipe (already
 * USDA-derived) or resolved through the USDA pipeline. There is nowhere for a model to
 * assert a calorie. `pin_grocery_product`'s `label` is no exception: it carries a listing's
 * panel TEXT, and the numbers are parsed from it server-side (lib/nutrition/listing-label.ts).
 *
 * Eating is still not a tool. The user confirms a meal in the UI (`POST /api/meals/eat`);
 * the model never records that food went in a mouth.
 */
export function buildMealsTools({ supabase, userId }: ToolContext) {
  return {
    get_recipes: tool({
      description:
        "Search saved recipes by ingredient, name, or tag. Omit query to return all. " +
        "Macros are for the WHOLE recipe as written, not a serving — divide by the portions " +
        "it gets split into. A recipe with macros_computed_at = null has never been resolved " +
        "and cannot be planned against a target until it is.",
      inputSchema: jsonSchema<{ query?: string }>({
        type: "object",
        properties: {
          query: { type: "string", description: "Ingredient, recipe name, or tag to search for." },
        },
      }),
      execute: async ({ query }) => {
        let req = supabase
          .from("recipes")
          .select(
            "id, name, cuisine, ingredients, instructions, tags, calories, protein_g, carbs_g, " +
              "fat_g, fiber_g, typical_portions, macros_confidence, macros_computed_at",
          );
        if (userId) req = req.eq("user_id", userId);
        if (query) {
          req = req.or(`name.ilike.%${query}%,ingredients.ilike.%${query}%`);
        }
        const { data, error } = await req.order("name");
        if (error) return { error: error.message };
        return data ?? [];
      },
    }),

    get_today_meals: tool({
      description:
        "Get all meals logged today. Call this before making any claim about what the user " +
        "has or hasn't eaten today.",
      inputSchema: jsonSchema<Record<string, never>>({
        type: "object",
        properties: {},
      }),
      execute: async () => {
        const today = todayString();
        let q = supabase
          .from("meal_log")
          .select(
            "meal_type, notes, portions, calories, protein_g, carbs_g, fat_g, recipes(name), cooks(name)",
          )
          .eq("date", today);
        if (userId) q = q.eq("user_id", userId);
        const { data } = await q;
        return data ?? [];
      },
    }),

    get_leftovers: tool({
      description:
        "What food already exists in the fridge — past cooks with portions left, oldest first. " +
        "CALL THIS FIRST when planning meals. Food that already exists costs no shopping and " +
        "no cooking; proposing a grocery run while a tray of turkey pasta goes off is the " +
        "fastest way to make a plan useless. Macros shown are for the whole cook — divide by " +
        "`portions` for one container.",
      inputSchema: jsonSchema<Record<string, never>>({
        type: "object",
        properties: {},
      }),
      execute: async () => {
        if (!userId) return { error: "No user context" };
        try {
          return await getLeftovers(supabase, userId);
        } catch (e) {
          return { error: (e as Error).message };
        }
      },
    }),

    log_cook: tool({
      description:
        "Record that the user COOKED something (not that they ate it). Give either a recipe_id " +
        "or an ingredients string for an ad-hoc cook, plus `portions` — how many containers it " +
        "was split into. Portions are eyeballed by the user and are the error bar on every " +
        "macro downstream; ask rather than guess. Macros are never supplied here: they are " +
        "copied from the recipe or resolved through USDA. A one-off dinner is simply portions=1.",
      inputSchema: jsonSchema<{
        portions: number;
        recipe_id?: string;
        name?: string;
        ingredients?: string;
        cooked_on?: string;
        notes?: string;
      }>({
        type: "object",
        properties: {
          portions: {
            type: "number",
            description: "How many containers/servings it was split into. A one-off meal is 1.",
          },
          recipe_id: {
            type: "string",
            description: "Recipe that was cooked, if it was a saved one.",
          },
          name: { type: "string", description: "Name of the dish (required if no recipe_id)." },
          ingredients: {
            type: "string",
            description:
              "Ingredients for an ad-hoc cook with no saved recipe. Resolved through USDA.",
          },
          cooked_on: { type: "string", description: "YYYY-MM-DD. Defaults to today." },
          notes: { type: "string" },
        },
        required: ["portions"],
      }),
      execute: async (input) => {
        if (!userId) return { error: "No user context" };
        try {
          const cook = await createCook(supabase, userId, {
            recipeId: input.recipe_id ?? null,
            name: input.name,
            ingredients: input.ingredients,
            portions: input.portions,
            cookedOn: input.cooked_on,
            notes: input.notes,
          });
          return cook;
        } catch (e) {
          return { error: (e as Error).message };
        }
      },
    }),

    get_meal_plan: tool({
      description:
        "Get planned meals for a date range (defaults to the next 7 days). A plan is a " +
        "proposal, not a record of what was eaten — compare against get_today_meals for that.",
      inputSchema: jsonSchema<{ start_date?: string; end_date?: string }>({
        type: "object",
        properties: {
          start_date: { type: "string", description: "YYYY-MM-DD. Defaults to today." },
          end_date: { type: "string", description: "YYYY-MM-DD. Defaults to 7 days out." },
        },
      }),
      execute: async ({ start_date, end_date }) => {
        if (!userId) return { error: "No user context" };
        const start = start_date ?? todayString();
        const end = end_date ?? addDays(start, 7);
        const { data, error } = await supabase
          .from("meal_plans")
          .select(
            "id, date, meal_type, portions, status, name, notes, is_cheat, " +
              "recipes(id, name, calories, protein_g, carbs_g, fat_g, typical_portions), " +
              "cooks(id, name, portions, portions_remaining, calories, protein_g, carbs_g, fat_g)",
          )
          .eq("user_id", userId)
          .gte("date", start)
          .lte("date", end)
          .order("date")
          .order("meal_type");
        if (error) return { error: error.message };
        return data ?? [];
      },
    }),

    plan_meals: tool({
      description:
        "Write planned meals. Every entry MUST be backed by either a `cook_id` (eat a portion " +
        "of food that already exists — prefer this, it needs no shopping) or a `recipe_id` " +
        "(cook this). A plan with neither is rejected — a meal without a recipe has no " +
        "instructions and no macros. For a meal out, plan the reusable 'Eating out' recipe " +
        "(look it up with get_recipes) and log the real macros afterward. `name` is only an " +
        "optional display label and never satisfies the requirement on its own. Re-planning " +
        "the same date+meal_type replaces it. Never pass macro numbers: there is no field for " +
        "them, because macros come from USDA, not from you.",
      inputSchema: jsonSchema<{
        meals: {
          date: string;
          meal_type: string;
          cook_id?: string;
          recipe_id?: string;
          name?: string;
          portions?: number;
          notes?: string;
          is_cheat?: boolean;
        }[];
      }>({
        type: "object",
        properties: {
          meals: {
            type: "array",
            items: {
              type: "object",
              properties: {
                date: { type: "string", description: "YYYY-MM-DD." },
                meal_type: {
                  type: "string",
                  enum: ["breakfast", "lunch", "dinner", "snack"],
                },
                cook_id: {
                  type: "string",
                  description: "Eat a portion of this existing cook (leftovers). Preferred.",
                },
                recipe_id: { type: "string", description: "Cook this recipe. Implies groceries." },
                name: {
                  type: "string",
                  description:
                    "Optional display label only. Does NOT satisfy the requirement — every " +
                    "meal still needs a cook_id or recipe_id (use the 'Eating out' recipe for meals out).",
                },
                portions: { type: "number", description: "Defaults to 1." },
                notes: { type: "string" },
                is_cheat: {
                  type: "boolean",
                  description:
                    "True for the week's budgeted cheat meal (profile cheat_meals_per_week, " +
                    "default 1). Defaults to false.",
                },
              },
              required: ["date", "meal_type"],
            },
          },
        },
        required: ["meals"],
      }),
      execute: async ({ meals }) => planMeals(supabase, userId, meals),
    }),

    get_meal_history: tool({
      description:
        "Meals actually eaten over the last N days, with whether each satisfied a plan. " +
        "Off-plan meals (meal_plan_id null) are normal and are the signal the next plan " +
        "should learn from — do not treat them as failures.",
      inputSchema: jsonSchema<{ days?: number }>({
        type: "object",
        properties: { days: { type: "number", description: "Days back. Defaults to 7." } },
      }),
      execute: async ({ days = 7 }) => {
        if (!userId) return { error: "No user context" };
        const { data, error } = await supabase
          .from("meal_log")
          .select(
            "date, meal_type, portions, calories, protein_g, carbs_g, fat_g, meal_plan_id, cooks(name)",
          )
          .eq("user_id", userId)
          .gte("date", daysAgoString(days))
          .order("date", { ascending: false });
        if (error) return { error: error.message };
        return data ?? [];
      },
    }),

    get_grocery_list: tool({
      description:
        "The grocery list for planned meals (#4): what the recipe-backed meal_plans in the " +
        "window need, minus what inventory_items already holds, rounded up to whole packs of " +
        "each food's PINNED Amazon Fresh product. Call this instead of adding up ingredients " +
        "yourself. Lines with `needsPin: true` have no product yet: search Fresh, let the user " +
        "choose, then pin_grocery_product. Products are matched by USDA id / label only, never " +
        "by name — do not substitute a similarly named product for an unpinned line. " +
        "`check-stock` means the kitchen has some in a unit with no weight: ask before buying.",
      inputSchema: jsonSchema<{ start?: string; end?: string }>({
        type: "object",
        properties: {
          start: { type: "string", description: "YYYY-MM-DD. Defaults to today." },
          end: { type: "string", description: "YYYY-MM-DD, inclusive. Defaults to start + 6." },
        },
      }),
      execute: async ({ start, end }) => {
        if (!userId) return { error: "No user context" };
        const from = start ?? todayString();
        try {
          return await getGroceryList(supabase, userId, {
            start: from,
            end: end ?? addDays(from, 6),
          });
        } catch (e) {
          return { error: (e as Error).message };
        }
      },
    }),

    receive_grocery_order: tool({
      description:
        "Put a DELIVERED Amazon Fresh order into the kitchen (inventory_items), after the user " +
        "says it arrived. Pass each product's ASIN and the number of packs received (read the " +
        "order's details page; never the cart, which is not a delivery). Products are matched to " +
        "their pins by ASIN only and stored in grams with the pin's USDA/label identity, so the " +
        "next 'Cooked it' draws them. Unpinned products are reported, not added. Pass order_id " +
        "(the Amazon order number) so receiving the same order twice adds nothing. location " +
        "(fridge/freezer/pantry/counter) defaults to where that food was last kept, else fridge.",
      inputSchema: jsonSchema<{
        order_id?: string;
        items: {
          asin: string;
          packs: number;
          location?: "fridge" | "freezer" | "pantry" | "counter";
          expires_on?: string;
        }[];
      }>({
        type: "object",
        properties: {
          order_id: { type: "string", description: "Amazon order number, for idempotency." },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                asin: { type: "string" },
                packs: { type: "number", description: "Whole packs received." },
                location: { type: "string", enum: ["fridge", "freezer", "pantry", "counter"] },
                expires_on: { type: "string", description: "YYYY-MM-DD, if printed." },
              },
              required: ["asin", "packs"],
            },
          },
        },
        required: ["items"],
      }),
      execute: async ({ order_id, items }) => {
        if (!userId) return { error: "No user context" };
        try {
          return await receiveGroceryOrder(supabase, userId, { items, orderId: order_id ?? null });
        } catch (e) {
          return { error: (e as Error).message };
        }
      },
    }),

    pin_grocery_product: tool({
      description:
        "Pin an Amazon Fresh product to a food, so future grocery lists buy exactly it. Identify " +
        "the food by `fdc_id` (USDA id, from the grocery-list line) or `packaged_food_id`. " +
        "Re-pinning a food REPLACES its product. Only pin a product the user chose or that was " +
        'already ordered — never a guess. Pack size comes from the listing ("14 oz" -> ' +
        'pack_quantity 14, pack_unit "oz"); omit it for count-sold produce like a head of ' +
        "cabbage. Volume units (fl oz) are not weights: omit them and say so in `notes`. " +
        "LABELS: for a packaged product, pass `label` with the listing's Nutrition Facts panel " +
        "TEXT exactly as the amazon-cart skill's read-nutrition.js returned it (`panel_text`) — " +
        "never type or edit numbers; the server parses and sanity-checks them, stores the panel " +
        "in the packaged_foods catalog and links it to the pin. A photographed catalog label is " +
        "never overwritten. Omit `label` for produce sold by weight or count, and when the " +
        "listing has no text panel (say the label needs a photo on delivery). Read `label` in " +
        "the result: created/updated/kept_photographed, or skipped/error with the reason.",
      inputSchema: jsonSchema<{
        asin: string;
        title: string;
        fdc_id?: number;
        packaged_food_id?: string;
        pack_quantity?: number;
        pack_unit?: string;
        price_usd?: number;
        fresh?: boolean;
        notes?: string;
        label?: ListingLabelInput;
      }>({
        type: "object",
        properties: {
          asin: { type: "string", description: "10-character Amazon ASIN." },
          title: { type: "string", description: "Listing title, as shown." },
          fdc_id: { type: "number" },
          packaged_food_id: { type: "string" },
          pack_quantity: { type: "number" },
          pack_unit: { type: "string", description: "g, kg, oz or lb." },
          price_usd: { type: "number", description: "Price seen on the listing." },
          fresh: { type: "boolean", description: "Sold through Amazon Fresh. Defaults true." },
          notes: { type: "string" },
          label: {
            type: "object",
            description:
              "The listing's Nutrition Facts panel, captured by read-nutrition.js. Text only.",
            properties: {
              brand: { type: "string", description: "Brand, from read-nutrition.js." },
              product: {
                type: "string",
                description: "Short product name (catalog key with brand), e.g. 'Classic Kimchi'.",
              },
              panel_text: {
                type: "string",
                description: "read-nutrition.js `panelText`, verbatim. Never edited by hand.",
              },
              prep_state: {
                type: "string",
                enum: ["as_sold", "dry", "cooked", "drained", "prepared"],
                description:
                  "Which weight the panel describes. as_sold unless the listing says dry " +
                  "(pasta, rice) or the food is sold cooked (cooked shrimp).",
              },
              animal_protein: {
                type: "boolean",
                description:
                  "Meat, fish, eggs or dairy. A printed 0 mg sodium is then stored as unknown.",
              },
            },
            required: ["brand", "product", "panel_text"],
          },
        },
        required: ["asin", "title"],
      }),
      execute: async (input) => pinGroceryProduct(supabase, userId, input),
    }),
  };
}
