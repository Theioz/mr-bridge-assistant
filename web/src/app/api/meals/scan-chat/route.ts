import { createClient } from "@/lib/supabase/server";
import { chatJSON } from "@/lib/nutrition/parse";
import { estimateFromText } from "@/lib/nutrition/estimate";
import { todayString } from "@/lib/timezone";

/**
 * Conversational adjustment of a food scan before logging. Was the last Anthropic
 * call site (#609); now the local model + USDA, like every other meals path.
 *
 * WHAT CHANGED, AND WHY IT MATTERS
 *
 * The old prompt said, verbatim:
 *
 *   "recompute the items' macros using conservative estimates from your food knowledge"
 *
 * i.e. the model INVENTED the numbers — the exact thing we designed out of every other
 * meals route. So "add 50g rice" produced whatever calories the model happened to recall.
 *
 * Now the model does only what it is reliable at: read the user's intent and name the
 * foods. Every macro that ends up on the card is computed by USDA FoodData Central
 * through the same pipeline as logging. A suggestion's numbers therefore agree with what
 * you'd get if you actually ate it — which was never guaranteed before.
 *
 * Also: no streaming, and no tool-calling. The old route streamed the AI SDK data
 * protocol and exposed one tool; the client hand-parsed `0:` / `a:` prefixes. Tool-calling
 * on a 7B local model is precisely the fragile thing this migration was escaping. A single
 * structured response is deterministic and the client got simpler, not harder.
 */

type MealType = "breakfast" | "lunch" | "dinner" | "snack";

type ScanItemInput = {
  id?: string;
  label: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  sugar_g: number | null;
  user_context?: string | null;
};

interface ScanChatBody {
  messages: { role: "user" | "assistant"; content: string }[];
  scanItems: ScanItemInput[];
  mealType: MealType;
}

/** What the model is allowed to decide. Note: no macros anywhere in here. */
const INTENT_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    intent: { type: "string", enum: ["question", "adjust", "log"] },
    additions: { type: "string" },
    removals: { type: "array", items: { type: "string" } },
    scale: { type: ["number", "null"] },
  },
  required: ["reply", "intent", "additions", "removals"],
};

type Intent = {
  reply: string;
  intent: "question" | "adjust" | "log";
  /** Free text of foods to ADD, e.g. "50g white rice". Fed to the USDA pipeline. */
  additions: string;
  /** Labels of scanned items to drop. */
  removals: string[];
  /** Multiply the whole meal, e.g. 2 for "double it". */
  scale?: number | null;
};

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: ScanChatBody;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { messages, scanItems, mealType } = body;
  if (!Array.isArray(scanItems)) {
    return Response.json({ error: "scanItems is required" }, { status: 400 });
  }

  const scanSummary = scanItems
    .map(
      (i) =>
        `- ${i.label}: ${Math.round(i.calories)} cal, ${Math.round(i.protein_g)}g P, ` +
        `${Math.round(i.carbs_g)}g C, ${Math.round(i.fat_g)}g fat`,
    )
    .join("\n");

  const system = [
    `You are helping review a food scan. Today is ${todayString()}.`,
    "",
    "Current scanned items:",
    scanSummary || "(none)",
    "",
    "Decide what the user wants and reply briefly. Direct, no filler, no emojis.",
    "",
    "- intent='question' — they asked something. Answer it in `reply`. Change nothing.",
    "- intent='adjust'   — they want the meal changed before logging.",
    "- intent='log'      — they explicitly want it logged ('log it', 'save this').",
    "",
    "For an adjustment, express it as DATA, not as recomputed numbers:",
    "  additions: free text of foods to ADD, with quantities — e.g. '50g white rice'.",
    "             Empty string if nothing is being added.",
    "  removals:  labels of scanned items to REMOVE (match the labels above).",
    "  scale:     a multiplier for the whole meal ('double it' -> 2). null otherwise.",
    "",
    "CRITICAL: never output calories, protein, carbs or fat. You are not being asked for",
    "nutrition — a database computes it from your `additions` text. Numbers you invent",
    "would be wrong.",
  ].join("\n");

  const convo = (messages ?? [])
    .slice(-6)
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  try {
    const out = await chatJSON<Intent>(
      [
        { role: "system", content: system },
        { role: "user", content: convo || "(no message)" },
      ],
      INTENT_SCHEMA,
      90_000,
    );

    // A question changes nothing.
    if (out.intent === "question") {
      return Response.json({ reply: out.reply, card: null });
    }

    // --- apply the adjustment, with USDA doing every calculation -------------
    let items = scanItems.map((i) => ({ ...i }));

    if (out.removals?.length) {
      const drop = out.removals.map((r) => r.toLowerCase().trim());
      items = items.filter(
        (i) =>
          !drop.some((d) => i.label.toLowerCase().includes(d) || d.includes(i.label.toLowerCase())),
      );
    }

    if (out.additions?.trim()) {
      // The added food is priced by USDA, exactly as if it had been typed into the
      // meal log — not by whatever the model remembers about rice.
      const est = await estimateFromText(out.additions.trim());
      for (const it of est.items) {
        items.push({
          label: `${it.matched} (${it.grams}g)`,
          calories: Math.round(it.macros.calories),
          protein_g: Math.round(it.macros.protein_g * 10) / 10,
          carbs_g: Math.round(it.macros.carbs_g * 10) / 10,
          fat_g: Math.round(it.macros.fat_g * 10) / 10,
          fiber_g: Math.round(it.macros.fiber_g * 10) / 10,
          sugar_g: Math.round(it.macros.sugar_g * 10) / 10,
        });
      }
    }

    const scale = typeof out.scale === "number" && out.scale > 0 ? out.scale : 1;
    if (scale !== 1) {
      items = items.map((i) => ({
        ...i,
        calories: Math.round(i.calories * scale),
        protein_g: Math.round(i.protein_g * scale * 10) / 10,
        carbs_g: Math.round(i.carbs_g * scale * 10) / 10,
        fat_g: Math.round(i.fat_g * scale * 10) / 10,
        // null means "this food legitimately has none" — scaling must not turn that into 0.
        fiber_g: i.fiber_g === null ? null : Math.round(i.fiber_g * scale * 10) / 10,
        sugar_g: i.sugar_g === null ? null : Math.round(i.sugar_g * scale * 10) / 10,
      }));
    }

    // Totals are SUMMED from the items, never asked of the model. Keep null when a
    // food legitimately has no fiber/sugar (butter, plain meat) rather than coercing
    // to 0 — the original contract was explicit about this and it is still right.
    const sum = (pick: (i: (typeof items)[number]) => number | null): number | null => {
      const vals = items.map(pick);
      if (vals.every((v) => v === null)) return null;
      return Math.round(vals.reduce<number>((a, v) => a + (v ?? 0), 0) * 10) / 10;
    };

    const totals = {
      calories: Math.round(items.reduce((a, i) => a + i.calories, 0)),
      protein_g: sum((i) => i.protein_g) ?? 0,
      carbs_g: sum((i) => i.carbs_g) ?? 0,
      fat_g: sum((i) => i.fat_g) ?? 0,
      fiber_g: sum((i) => i.fiber_g),
      sugar_g: sum((i) => i.sugar_g),
    };

    // The card is a PROPOSAL. Nothing is written here — the client POSTs to
    // /api/meals/log only after the user confirms. Same contract as before.
    return Response.json({
      reply: out.reply,
      card: {
        kind: "log_meal_proposal" as const,
        items,
        meal_type: mealType,
        notes: out.additions?.trim() ? "Added items priced from USDA data." : "",
        user_context: scanItems.find((i) => i.user_context)?.user_context ?? null,
        totals,
      },
    });
  } catch (err) {
    console.error("[meals/scan-chat] failed:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Request failed" },
      { status: 500 },
    );
  }
}
