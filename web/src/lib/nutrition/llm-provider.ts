/**
 * Dependency-free half of the model client: which backend to use, and the request-shaping helpers
 * the Anthropic path needs. Kept apart from llm-anthropic.ts so the unit tests, which run with no
 * `npm install` (python-tests.yml), can import it without the SDK.
 */
/**
 * Which backend `chatJSON` uses. `LLM_PROVIDER` wins when set; otherwise Anthropic whenever an
 * API key is present, so adding the key is the whole switch and removing it falls back to the
 * local model. An unrecognised value throws rather than quietly picking one — a typo here would
 * otherwise send every call to whichever backend the default happens to be.
 */
export function llmProvider(): "anthropic" | "ollama" {
  const p = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (p === "anthropic" || p === "ollama") return p;
  if (p) throw new Error(`LLM_PROVIDER must be 'anthropic' or 'ollama', got '${p}'`);
  return process.env.ANTHROPIC_API_KEY ? "anthropic" : "ollama";
}

export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

/**
 * Ollama takes bare base64 and sniffs the format itself; the Messages API needs the media type
 * stated, and rejects a mismatch. The food path always re-encodes to JPEG, but the label path can
 * forward the original upload (PNG/WebP straight from a screenshot), so read the magic bytes
 * rather than assume.
 */
export function mediaType(b64: string): ImageMediaType {
  if (b64.startsWith("iVBORw0KGgo")) return "image/png";
  if (b64.startsWith("UklGR")) return "image/webp";
  if (b64.startsWith("R0lGOD")) return "image/gif";
  return "image/jpeg";
}

/**
 * Structured outputs need `additionalProperties: false` on every object, which none of the
 * Ollama-era schemas declare. Union `type` arrays (`["number", "null"]`) are rewritten as
 * `anyOf`, the form the structured-outputs docs list as supported.
 */
export function toStrictSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toStrictSchema);
  if (!node || typeof node !== "object") return node;

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    out[k] = toStrictSchema(v);
  }
  if (Array.isArray(out.type)) {
    const types = out.type as string[];
    delete out.type;
    out.anyOf = types.map((t) => ({ type: t }));
  }
  if (out.type === "object") out.additionalProperties = false;
  return out;
}
