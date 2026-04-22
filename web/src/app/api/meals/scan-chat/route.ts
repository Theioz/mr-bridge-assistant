// Scoped analyzer-chat endpoint (#303).
// Tool-enabled chat isolated to the Food Analyzer. Exposes one tool —
// log_meal_from_scan — that proposes a meal-log action card the user must
// confirm client-side. General chat (/api/chat) intentionally does NOT
// register this tool, so Bridge can only log meals from inside a scan.

import { anthropic } from "@ai-sdk/anthropic";
import { streamText, tool, jsonSchema, stepCountIs } from "ai";
import { todayString } from "@/lib/timezone";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 30;

type MealType = "breakfast" | "lunch" | "dinner" | "snack";

interface ScanItemInput {
  id: string;
  label: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  sugar_g: number | null;
}

interface ScanChatBody {
  messages: { role: "user" | "assistant"; content: string }[];
  scanItems: ScanItemInput[];
  mealType: MealType;
}

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

  const systemPrompt = `You are Mr. Bridge, helping the user review a food scan on the Meals → Scanner tab. Today's date is ${todayString()}.

Style: Direct, structured, high-density. No filler, no emojis.

Current scan items (${scanItems.length}):
${scanItems
  .map((i) => {
    const extras = [
      i.fiber_g !== null ? `${i.fiber_g}g fiber` : null,
      i.sugar_g !== null ? `${i.sugar_g}g sugar` : null,
    ]
      .filter(Boolean)
      .join(", ");
    const base = `- ${i.label}: ${Math.round(i.calories)} cal, ${Math.round(i.protein_g)}g P, ${Math.round(i.carbs_g)}g C, ${Math.round(i.fat_g)}g fat`;
    return extras ? `${base}, ${extras}` : base;
  })
  .join("\n")}
Default meal type: ${mealType}

You can log the scanned meal on the user's behalf by calling the log_meal_from_scan tool. Use it when the user expresses intent to log ("log it", "save this", "add this to today", etc.). You must NOT call the tool without an explicit log intent.

When the user asks you to adjust the macros before logging (e.g. "add 50g rice", "without the oil", "double the portion"), recompute the items' macros using conservative estimates from your food knowledge, then call log_meal_from_scan with the updated items array. Do not invent items the user didn't mention.

The tool does NOT write to the database — it returns a structured card the user must confirm. If the user only asks a question (not a log intent), answer normally without calling the tool.

Preserve fiber_g and sugar_g as null (not 0) when a food legitimately lacks that nutrient — e.g. butter has no fiber, plain meat has no sugar.`;

  const tools = {
    log_meal_from_scan: tool({
      description:
        "Propose a meal-log action card for the user to confirm. Returns a structured proposal — the DB write happens client-side only after the user taps Log on the card. Call this when the user expresses intent to log the current scan (optionally with adjustments to the macros or item list based on conversation).",
      inputSchema: jsonSchema<{
        items: {
          label: string;
          calories: number;
          protein_g: number;
          carbs_g: number;
          fat_g: number;
          fiber_g: number | null;
          sugar_g: number | null;
        }[];
        meal_type: MealType;
        notes?: string;
      }>({
        type: "object",
        required: ["items", "meal_type"],
        properties: {
          items: {
            type: "array",
            description:
              "The final item list to log — use the scan items as-is, or adjusted per conversation.",
            items: {
              type: "object",
              required: [
                "label",
                "calories",
                "protein_g",
                "carbs_g",
                "fat_g",
                "fiber_g",
                "sugar_g",
              ],
              properties: {
                label: { type: "string" },
                calories: { type: "number" },
                protein_g: { type: "number" },
                carbs_g: { type: "number" },
                fat_g: { type: "number" },
                fiber_g: { type: ["number", "null"] },
                sugar_g: { type: ["number", "null"] },
              },
            },
          },
          meal_type: {
            type: "string",
            enum: ["breakfast", "lunch", "dinner", "snack"],
          },
          notes: {
            type: "string",
            description:
              "Optional short label for the meal row (defaults to concatenated item names).",
          },
        },
      }),
      execute: async ({ items, meal_type, notes }) => {
        // No DB write — client renders this as a confirm card and POSTs to /api/meals/log
        // only after the user confirms. Returning the structured payload plus a kind tag
        // so the InlineMealChat client can discriminate text vs. action-card tool results.
        const totals = items.reduce(
          (acc, i) => ({
            calories: acc.calories + (i.calories ?? 0),
            protein_g: acc.protein_g + (i.protein_g ?? 0),
            carbs_g: acc.carbs_g + (i.carbs_g ?? 0),
            fat_g: acc.fat_g + (i.fat_g ?? 0),
            fiber_g: i.fiber_g !== null ? (acc.fiber_g ?? 0) + i.fiber_g : acc.fiber_g,
            sugar_g: i.sugar_g !== null ? (acc.sugar_g ?? 0) + i.sugar_g : acc.sugar_g,
          }),
          {
            calories: 0,
            protein_g: 0,
            carbs_g: 0,
            fat_g: 0,
            fiber_g: null as number | null,
            sugar_g: null as number | null,
          },
        );
        return {
          kind: "log_meal_proposal",
          items,
          meal_type,
          notes: notes ?? items.map((i) => i.label).join(", "),
          totals,
        };
      },
    }),
  };

  const result = streamText({
    model: anthropic("claude-haiku-4-5-20251001"),
    system: systemPrompt,
    messages,
    tools,
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}
