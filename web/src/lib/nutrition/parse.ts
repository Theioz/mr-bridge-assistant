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
  /**
   * The model's OWN reading of the quantity. Treated as a fallback only — `source` is
   * lexed in code and wins whenever it states a quantity, because the model demonstrably
   * alters numbers it is asked to repeat (see quantity.ts).
   */
  qty: number;
  unit: string;
  /**
   * The exact fragment of the user's text this food came from, verbatim. This is what the
   * quantity lexer reads, so the number that reaches USDA is the number the user wrote —
   * not the model's recollection of it.
   */
  source?: string;
  /**
   * Set when `qty`/`unit` came from structured data (`recipes.ingredients_json`) rather than from
   * prose. The whole lexer exists to recover a number the model may have altered; when the number
   * was never routed through a model there is nothing to recover, so the lexer is skipped and the
   * amount counts as quantified rather than guessed.
   */
  structured?: boolean;
  /**
   * A pinned USDA FoodData Central id. Present only on structured ingredients. Skips BOTH the
   * search and the model's selection step, which is what makes re-resolution deterministic —
   * USDA's top hit for "chicken breast, cooked" is breaded microwaved tenders (252 kcal vs ~165),
   * so leaving that choice to a search means the same recipe can drift month to month.
   */
  fdcId?: number | null;
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

/**
 * Identification runs on the SAME model as everything else.
 *
 * It briefly ran on qwen2.5vl:3b, on the reasoning that identifying a plate is a smaller job
 * than reading a label and that USDA supplies every number anyway, so a weaker identifier
 * cannot move a macro. Measured on a real photo — an oyster topped with uni, ikura, caviar and
 * a cured egg yolk — both models were wrong and the 3b was wronger: two of five components
 * against the 7b's three.
 *
 * The decisive part was not accuracy. The USDA selection calls use `model()`, so a split meant
 * BOTH models had to be resident, and on a node with no GPU and mmap disabled the second load
 * costs ~33 s of reading 6 GB off disk. It showed up as three ~175-token selections all
 * returning in 33.77 s, to the millisecond, because they were queued behind the same load. One
 * model for the whole pipeline is more accurate AND, end to end, faster.
 *
 * The env override stays, so a model can be swapped without a rebuild.
 */
function visionModel(): string {
  return process.env.OLLAMA_VISION_MODEL || model();
}

export type ChatMessage = {
  role: "system" | "user";
  content: string;
  /** base64 images, for the vision path */
  images?: string[];
};

/**
 * Context window for the VISION calls.
 *
 * Ollama defaults to 4096 tokens, and a photo does not fit in that. qwen2.5vl is loaded with
 * image_max_pixels = 3211264 and spends one token per 28x28 patch, so any photo at or above
 * ~3.2 MP becomes ~4100 image tokens BY ITSELF — more than the whole default context, before a
 * word of the prompt. Ollama answers 400 "request (4727 tokens) exceeds the available context
 * size (4096 tokens)", which surfaced to the user as a bare "local model failed (400)".
 *
 * It passed every small test image and failed every real phone photo, which is why it survived.
 *
 * 8192 leaves room for a full-resolution label (~4100 tokens) plus the prompt, with headroom to
 * spare. The KV cache for that is ~470 MB on a 28 GB node — cheap next to the 6 GB of weights.
 */
const VISION_NUM_CTX = 8192;

export type ChatOpts = {
  timeoutMs?: number;
  /** Override Ollama's 4096-token default. Required for images; see VISION_NUM_CTX. */
  numCtx?: number;
  /** Override the model for this call. Defaults to `model()`. */
  model?: string;
};

export async function chatJSON<T>(
  messages: ChatMessage[],
  schema: Record<string, unknown>,
  opts: ChatOpts = {},
): Promise<T> {
  const { timeoutMs = 120_000, numCtx } = opts;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${ollamaUrl()}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctl.signal,
      body: JSON.stringify({
        model: opts.model ?? model(),
        messages,
        stream: false,
        format: schema, // Ollama enforces the JSON schema on the output
        options: {
          temperature: 0, // deterministic: same meal -> same parse
          ...(numCtx ? { num_ctx: numCtx } : {}),
        },
      }),
    });
    if (!res.ok) {
      // Carry Ollama's own message through. Without it every failure read as an opaque
      // "local model failed (400)", and the actual cause (context overflow) was visible
      // only by reading the model server's logs on the node.
      const detail = await res.text().catch(() => "");
      throw new Error(
        `local model failed (${res.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`,
      );
    }
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
          source: { type: "string" },
        },
        required: ["query", "qty", "unit", "source"],
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
  "- source: the exact fragment of the input this food came from, COPIED VERBATIM.",
  "  Copy the characters; do not normalise, round, or re-word them. This is the only",
  "  field that is trusted for the quantity — qty/unit are a fallback.",
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
  'Output: [{"query":"egg, whole, raw","qty":2,"unit":"large","source":"2 eggs"},',
  '         {"query":"bread, white, toasted","qty":1,"unit":"slice","source":"toast"}]',
  "",
  'Input: "grilled chicken breast, about 6oz, with a cup of white rice"',
  'Output: [{"query":"chicken breast, roasted","qty":6,"unit":"oz","source":"about 6oz"},',
  '         {"query":"rice, white, cooked","qty":1,"unit":"cup","source":"a cup of white rice"}]',
  "",
  'Input: "a bowl of oatmeal with a banana"',
  'Output: [{"query":"oats, cooked","qty":1,"unit":"cup","source":"a bowl of oatmeal"},',
  '         {"query":"banana, raw","qty":1,"unit":"medium","source":"a banana"}]',
  "",
  'Input: "added some chicken"',
  'Output: [{"query":"chicken breast, roasted","qty":1,"unit":"serving","source":"some chicken"}]',
].join("\n");

/**
 * Recipes are a different domain and the meal prompt is actively wrong for them.
 *
 * A meal is a plate of COOKED food — "rice, white, cooked" is the right USDA entry, and
 * every example above teaches that. A recipe's ingredient list is a tray of RAW, DRY
 * ingredients. Fed the meal prompt, qwen2.5vl rewrote "2 cups dry brown rice" to
 * "rice, brown, cooked": ~90g of carbs instead of ~280g, a 3x error, reported as HIGH
 * confidence. It did the same to raw chicken breast (-> "roasted").
 *
 * So: the preparation state comes from the user's words, never the model's default.
 */
const PARSE_SYSTEM_RECIPE = [
  "Convert a RECIPE INGREDIENT LIST into a structured food list.",
  "",
  "These are RAW, UNCOOKED ingredients as bought and measured — not a plate of food.",
  "",
  "For each ingredient emit exactly:",
  "- query: a plain USDA-style ingredient name (e.g. 'rice, brown, long-grain, raw',",
  "  'chicken, breast, raw', 'pasta, dry, enriched').",
  "- qty: the NUMBER of units. Never null.",
  "- unit: the unit AS STATED.",
  "- source: the exact fragment of the input this ingredient came from, COPIED VERBATIM.",
  "",
  "RULES",
  "1. NEVER add 'cooked', 'roasted', 'boiled' or 'prepared' unless the input says so.",
  "   An ingredient list is raw/dry by default. Adding 'cooked' to rice or pasta changes",
  "   the answer by ~3x, because cooked grains are mostly water.",
  "2. Keep a stated weight or volume EXACTLY. It is the user's own measurement.",
  "3. Never estimate grams. Never output calories or macros — a database supplies those.",
  "4. If an ingredient has no stated quantity, still emit it with qty 1 and unit 'serving'.",
  "   Do not invent a plausible amount; the caller detects this and reports it.",
  "",
  "EXAMPLES",
  'Input: "3 lb chicken breast, 2 cups dry brown rice"',
  'Output: [{"query":"chicken, broiler, breast, raw","qty":3,"unit":"lb","source":"3 lb chicken breast"},',
  '         {"query":"rice, brown, long-grain, raw","qty":2,"unit":"cup","source":"2 cups dry brown rice"}]',
  "",
  'Input: "1.5 lb ground turkey, 2.5 cups pasta"',
  'Output: [{"query":"turkey, ground, raw","qty":1.5,"unit":"lb","source":"1.5 lb ground turkey"},',
  '         {"query":"pasta, dry, enriched","qty":2.5,"unit":"cup","source":"2.5 cups pasta"}]',
  "",
  'Input: "Green beans, olive oil + lemon"',
  'Output: [{"query":"green beans, raw","qty":1,"unit":"serving","source":"Green beans"},',
  '         {"query":"oil, olive","qty":1,"unit":"serving","source":"olive oil"},',
  '         {"query":"lemon, raw","qty":1,"unit":"serving","source":"lemon"}]',
].join("\n");

/**
 * "2 eggs and toast" -> [{query:'egg, whole, raw', qty:2, unit:'large', source:'2 eggs'}, ...]
 *
 * `mode` picks the domain. A recipe's ingredient list is raw and dry; a meal is cooked.
 * Using the meal prompt on a recipe silently triples the carbs of every grain — see
 * PARSE_SYSTEM_RECIPE.
 */
export async function parseFoodText(
  text: string,
  mode: "meal" | "recipe" = "meal",
): Promise<ParsedFood[]> {
  const out = await chatJSON<{ items: ParsedFood[] }>(
    [
      { role: "system", content: mode === "recipe" ? PARSE_SYSTEM_RECIPE : PARSE_SYSTEM },
      { role: "user", content: text },
    ],
    PARSE_SCHEMA,
  );
  return (out.items ?? []).filter((i) => i.query?.trim());
}

/**
 * The photo path gets its OWN system prompt, and a much shorter one.
 *
 * It used to send PARSE_SYSTEM — ~750 tokens written for TEXT, whose every worked example is a
 * typed sentence ("2 eggs and toast", "grilled chicken breast, about 6oz"). On a photo request
 * that is not merely wasted: it is ~15 s of CPU prompt-eval per photo spent teaching the model
 * to parse prose it was never given.
 *
 * `source` keeps its exact meaning — the fragment of the USER'S words this food came from,
 * which is what quantity.ts lexes. The difference is that a photo usually has no such words, so
 * the model is told to return "" rather than invent one. It previously filled the field with
 * things like "meal description" and "anywhere", and an invented source is worse than an empty
 * one: `estimateOne` lexes it, finds no number, and the item is honestly flagged unquantified
 * either way — but a plausible-looking source suggests the user said something they did not.
 */
const PARSE_SYSTEM_PHOTO = [
  "Identify the foods in a meal photo. One entry per distinct food.",
  "",
  "- query: a plain USDA-style ingredient name, e.g. 'chicken breast, roasted',",
  "  'rice, white, cooked', 'green beans, cooked'. No brands. Keep only adjectives that",
  "  change the food itself (raw/cooked/roasted); drop the rest. Use the name USDA files",
  "  the INGREDIENT under, not the dish name — USDA has no porridge called 'oatmeal',",
  "  it is 'oats, cooked'.",
  "- qty + unit: the portion, in a natural unit — qty=1 unit='cup', qty=6 unit='oz'.",
  "  Judge it against plate and utensil scale.",
  "- source: if the user's description states an amount for this food, copy that fragment",
  '  VERBATIM. If they did not, return "". Never invent one.',
  "",
  "Never output grams, calories or macros. A database supplies those.",
].join("\n");

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
      { role: "system", content: PARSE_SYSTEM_PHOTO },
      { role: "user", content: instruction, images: [base64Jpeg] },
    ],
    PARSE_SCHEMA,
    { timeoutMs: 180_000, numCtx: VISION_NUM_CTX, model: visionModel() },
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
  required: [
    "product_name",
    "serving_size",
    "calories",
    "protein_g",
    "carbs_g",
    "fat_g",
    "readable",
    "notes",
  ],
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
    { timeoutMs: 180_000, numCtx: VISION_NUM_CTX },
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
    // 90s, not 60s. A selection is ~190 tokens and 1.2s on an idle server, so a timeout here
    // never means "too hard" — it means the request was queued behind a photo. Three of them
    // timed out on one meal log, and a timed-out selection falls back to USDA's top hit, which
    // is the wrong-food outcome this call exists to prevent. Cheaper to wait than to guess.
    { timeoutMs: 90_000 },
  );

  const i = Math.trunc(out.index);
  if (!out.confident || i < 0 || i >= candidates.length) return null;
  return i;
}
