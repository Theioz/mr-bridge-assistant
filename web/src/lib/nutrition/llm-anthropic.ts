/**
 * Anthropic backend for `chatJSON` (parse.ts). Same contract as the Ollama path — messages in,
 * schema-validated JSON out — so no caller changes when the provider does.
 *
 * Why it exists: on compute-core (no GPU) a photo took minutes of CPU prompt-eval on qwen2.5vl:7b
 * and still misidentified mixed plates. Claude does identification, label OCR and the USDA picks
 * in seconds. The division of labour is UNCHANGED: the model names foods, reads quantities and
 * picks from a candidate list; USDA FoodData Central still supplies every gram and calorie.
 *
 * Selected by `llmProvider()` (llm-provider.ts). Ollama stays deployed as the fallback.
 */
import Anthropic from "@anthropic-ai/sdk";

import { mediaType, toStrictSchema } from "./llm-provider";
import type { ChatMessage, ChatOpts } from "./parse";

let client: Anthropic | null = null;

function anthropic(): Anthropic {
  // Reads ANTHROPIC_API_KEY from the environment. Constructed lazily so an Ollama-only deploy
  // never needs the key.
  client ??= new Anthropic();
  return client;
}

function model(): string {
  return process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
}

export async function anthropicChatJSON<T>(
  messages: ChatMessage[],
  schema: Record<string, unknown>,
  opts: ChatOpts,
): Promise<T> {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");

  const turns: Anthropic.Beta.BetaMessageParam[] = messages
    .filter((m) => m.role === "user")
    .map((m) => ({
      role: "user",
      content: [
        ...(m.images ?? []).map(
          (data): Anthropic.Beta.BetaImageBlockParam => ({
            type: "image",
            source: { type: "base64", media_type: mediaType(data), data },
          }),
        ),
        { type: "text", text: m.content },
      ],
    }));

  // Effort is the depth control on this model (thinking can't be switched off). Reading a plate
  // or a label earns medium; parsing a sentence or picking one line from a USDA list does not.
  const hasImage = messages.some((m) => m.images?.length);
  const effort = opts.effort ?? (hasImage ? "medium" : "low");

  const res = await anthropic().beta.messages.create(
    {
      model: model(),
      max_tokens: 16000,
      ...(system ? { system } : {}),
      messages: turns,
      output_config: {
        effort,
        format: { type: "json_schema", schema: toStrictSchema(schema) as Record<string, unknown> },
      },
      // On a safety decline the API re-runs the request on a fallback model inside the same call,
      // routed by refusal category. A food photo should never trip one; this is cheap insurance.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    },
    { timeout: opts.timeoutMs ?? 60_000 },
  );

  if (res.stop_reason === "refusal") {
    throw new Error(
      `Claude declined the request${res.stop_details?.category ? ` (${res.stop_details.category})` : ""}`,
    );
  }
  if (res.stop_reason === "max_tokens") {
    throw new Error("Claude's response was cut off (max_tokens) before the JSON was complete");
  }

  const text = res.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("Claude returned no text block");
  return JSON.parse(text.text) as T;
}
