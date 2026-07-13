/**
 * Local model client (Ollama on compute-core) for the two jobs a small model IS
 * reliable at:
 *
 *   1. parseFoodText()  — "2 eggs and toast" -> [{query, qty, unit}, ...]
 *   2. pickBestFood()   — choose the right USDA hit from a candidate list
 *
 * It is deliberately NOT asked for grams or macros. Measured benchmarks on
 * qwen2.5vl:7b: it called a large egg 105g (real ~50g) and a cup of cooked rice
 * 284g (real ~158g) — both ~2x heavy, which would roughly double those macros.
 * Weight conversion is USDA's job (`fdc.ts: gramsFor`), nutrition is USDA's job.
 *
 * Selection matters as much as parsing: USDA's top hit for "chicken breast,
 * cooked" is "Chicken breast tenders, breaded, cooked, microwaved" (252 kcal,
 * 17.6g carbs vs ~165/0 for plain). Models are reliable at *picking* from a list
 * even when they are unreliable at recalling facts — so we search, then let it
 * choose.
 */

export type ParsedFood = {
  /** Plain USDA-style food name, e.g. "egg, whole, raw". */
  query: string;
  qty: number;
  unit: string;
};

function ollamaUrl(): string {
  // Cross-node: the app (compute-core) reaches Ollama on the same host. LAN IP,
  // never a *.jl-infra-lab.com vhost — those resolve to Surface's tailnet IP,
  // which the node has no route to (ADR 0016 §2).
  return process.env.OLLAMA_URL || "http://127.0.0.1:11434";
}

function model(): string {
  return process.env.OLLAMA_MODEL || "qwen2.5vl:7b";
}

type ChatMessage = {
  role: "system" | "user";
  content: string;
  /** base64 images, for the vision path */
  images?: string[];
};

async function chatJSON<T>(
  messages: ChatMessage[],
  schema: Record<string, unknown>,
  timeoutMs = 120_000,
): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${ollamaUrl()}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctl.signal,
      body: JSON.stringify({
        model: model(),
        messages,
        stream: false,
        format: schema, // Ollama enforces the JSON schema on the output
        options: { temperature: 0 }, // deterministic: same meal -> same parse
      }),
    });
    if (!res.ok) throw new Error(`local model failed (${res.status})`);
    const json = (await res.json()) as { message?: { content?: string } };
    const content = json.message?.content ?? "";
    return JSON.parse(content) as T;
  } finally {
    clearTimeout(timer);
  }
}

const PARSE_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          query: { type: "string" },
          qty: { type: "number" },
          unit: { type: "string" },
        },
        required: ["query", "qty", "unit"],
      },
    },
  },
  required: ["items"],
};

// Instructions alone were not enough: told only in prose to keep stated weights,
// the model still turned "about 6oz of chicken" into qty=1 unit='medium'. Worked
// examples fix it — small models copy patterns far more reliably than they follow
// rules.
const PARSE_SYSTEM = [
  "Convert a meal description into a structured food list.",
  "",
  "For each food emit exactly:",
  "- query: a plain USDA-style food name (e.g. 'egg, whole, raw', 'rice, white, cooked',",
  "  'chicken breast, roasted'). No brands. Keep only adjectives that change the food",
  "  itself (raw/cooked/roasted/toasted); drop the rest.",
  "- qty: the NUMBER of units. Never null.",
  "- unit: the unit AS STATED by the user.",
  "",
  "RULES",
  "1. If the user states a weight or volume, keep it EXACTLY. Never replace a stated",
  "   measurement with 'medium' or 'serving' — it is the user's own data.",
  "2. If a food is countable, use its natural unit ('large', 'slice', 'each').",
  "3. Only use unit='serving' when the user gave no quantity at all.",
  "4. Never estimate grams. Never output calories or macros — a database supplies those.",
  "",
  "The `query` must be the name USDA uses for the INGREDIENT, not the colloquial dish",
  "name. This matters: searching USDA for 'oatmeal' returns only oatmeal BREAD and",
  "oatmeal COOKIES — the porridge is filed under 'oats, cooked'. Use the ingredient.",
  "",
  "EXAMPLES",
  'Input: "2 eggs and toast"',
  'Output: [{"query":"egg, whole, raw","qty":2,"unit":"large"},',
  '         {"query":"bread, white, toasted","qty":1,"unit":"slice"}]',
  "",
  'Input: "grilled chicken breast, about 6oz, with a cup of white rice"',
  'Output: [{"query":"chicken breast, roasted","qty":6,"unit":"oz"},',
  '         {"query":"rice, white, cooked","qty":1,"unit":"cup"}]',
  "",
  'Input: "a bowl of oatmeal with a banana"',
  'Output: [{"query":"oats, cooked","qty":1,"unit":"cup"},',
  '         {"query":"banana, raw","qty":1,"unit":"medium"}]',
  "",
  'Input: "added some chicken"',
  'Output: [{"query":"chicken breast, roasted","qty":1,"unit":"serving"}]',
].join("\n");

/** "2 eggs and toast" -> [{query:'egg, whole, raw', qty:2, unit:'each'}, ...] */
export async function parseFoodText(text: string): Promise<ParsedFood[]> {
  const out = await chatJSON<{ items: ParsedFood[] }>(
    [
      { role: "system", content: PARSE_SYSTEM },
      { role: "user", content: text },
    ],
    PARSE_SCHEMA,
  );
  return (out.items ?? []).filter((i) => i.query?.trim());
}

/**
 * Parse a meal photo, optionally guided by what the user says it is.
 *
 * Portion estimation from pixels is the weakest thing a local VLM does — so the
 * user's own words are treated as AUTHORITATIVE and the image is only used to
 * fill the gaps:
 *
 *   - "6oz beef bolognese"      -> the 6oz wins outright; no visual guessing.
 *   - "beef bolognese with parmesan" -> identification is settled by the text
 *      (the model no longer has to guess whether that's bolognese or chili);
 *      only the portion is estimated from the image.
 *   - no description            -> everything comes from the image, as before.
 *
 * This is why the description box matters: it lets the user hand the model the
 * two things it is worst at (what the dish is, how much of it there is) whenever
 * they happen to know them.
 */
export async function parseFoodPhoto(
  base64Jpeg: string,
  description?: string,
): Promise<ParsedFood[]> {
  const desc = description?.trim();

  const instruction = desc
    ? [
        "Identify the foods in this meal photo.",
        "",
        `The user describes it as: "${desc}"`,
        "",
        "THE USER'S DESCRIPTION IS AUTHORITATIVE:",
        "- If they state a quantity or weight, use it EXACTLY. Do not re-estimate it from",
        "  the image. A stated measurement always beats a visual guess.",
        "- If they name the dish or its ingredients, trust that over what you think you see.",
        "- Use the image only to fill gaps: foods they did not mention, and portions they",
        "  did not state (estimate those from plate/utensil scale).",
      ].join("\n")
    : [
        "List every distinct food visible in this meal photo.",
        "Estimate each portion from visual cues (plate size, utensils) using a natural",
        "unit — e.g. qty=1 unit='cup', qty=6 unit='oz'.",
      ].join("\n");

  const out = await chatJSON<{ items: ParsedFood[] }>(
    [
      { role: "system", content: PARSE_SYSTEM },
      { role: "user", content: instruction, images: [base64Jpeg] },
    ],
    PARSE_SCHEMA,
    180_000, // vision is slower than text
  );
  return (out.items ?? []).filter((i) => i.query?.trim());
}

const LABEL_SCHEMA = {
  type: "object",
  properties: {
    product_name: { type: "string" },
    serving_size: { type: "string" },
    servings_per_container: { type: ["number", "null"] },
    calories: { type: "number" },
    protein_g: { type: "number" },
    carbs_g: { type: "number" },
    fat_g: { type: "number" },
    fiber_g: { type: ["number", "null"] },
    sugar_g: { type: ["number", "null"] },
    sodium_mg: { type: ["number", "null"] },
    readable: { type: "boolean" },
    notes: { type: "string" },
  },
  required: ["product_name", "serving_size", "calories", "protein_g", "carbs_g", "fat_g", "readable", "notes"],
};

export type LabelReading = {
  product_name: string;
  serving_size: string;
  servings_per_container: number | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
  readable: boolean;
  notes: string;
};

/**
 * Read a printed nutrition label.
 *
 * This one needs no USDA lookup and no estimation at all — the manufacturer has
 * already done the measuring. It is pure OCR: transcribe the printed numbers.
 * That makes it the most reliable path in the whole meals feature, and the model
 * is explicitly told not to "help" by inferring anything.
 */
export async function readNutritionLabel(base64Jpeg: string): Promise<LabelReading> {
  return chatJSON<LabelReading>(
    [
      {
        role: "system",
        content: [
          "You transcribe printed Nutrition Facts labels. This is a READING task, not an",
          "estimation task.",
          "",
          "- Report the values EXACTLY as printed, per serving. Do not round, convert, or",
          "  'correct' them.",
          "- If a value is not printed or is unreadable, return null for it. Never guess.",
          "- Set readable=false if the label is blurred, cropped or obscured, and say so in",
          "  notes. A wrong number is far worse than an admitted gap.",
        ].join("\n"),
      },
      {
        role: "user",
        content: "Transcribe this Nutrition Facts label.",
        images: [base64Jpeg],
      },
    ],
    LABEL_SCHEMA,
    180_000,
  );
}

const PICK_SCHEMA = {
  type: "object",
  properties: { index: { type: "number" }, confident: { type: "boolean" } },
  required: ["index", "confident"],
};

/**
 * Choose the best USDA match for what the user actually meant.
 *
 * Returns the index into `candidates`, or null if the model isn't confident —
 * in which case the caller should fall back to the first candidate and mark the
 * estimate low-confidence rather than silently logging a wrong food.
 */
export async function pickBestFood(
  wanted: string,
  candidates: { description: string }[],
  /** The full meal description. Without it the selector can't tell "a bowl of
   *  oatmeal" (porridge) from USDA's "Bread, oatmeal" — a different food that
   *  merely shares a word. */
  context?: string,
): Promise<number | null> {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return 0;

  const list = candidates.map((c, i) => `${i}. ${c.description}`).join("\n");
  const out = await chatJSON<{ index: number; confident: boolean }>(
    [
      {
        role: "system",
        content: [
          "Pick the USDA entry for the food the user actually ate.",
          "",
          "- Reject entries that are a DIFFERENT food merely sharing a word.",
          "  'Bread, oatmeal' is bread, not oatmeal. 'Egg bread' is bread, not egg.",
          "- Prefer plain, unprepared forms over breaded / fried / canned / deli /",
          "  fat-free variants unless the user explicitly asked for them.",
          "- Reply with the index. Set confident=false if none is a good match.",
        ].join("\n"),
      },
      {
        role: "user",
        content:
          (context ? `Full meal: "${context}"\n` : "") +
          `Food to match: "${wanted}"\n\nCandidates:\n${list}`,
      },
    ],
    PICK_SCHEMA,
    60_000,
  );

  const i = Math.trunc(out.index);
  if (!out.confident || i < 0 || i >= candidates.length) return null;
  return i;
}
