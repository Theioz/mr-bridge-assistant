// Unit tests for the Anthropic backend's pure helpers and the provider switch.
//
// WHY THIS EXISTS
//
// The schemas sent to the model were written for Ollama, which accepts them as-is. Structured
// outputs on the Messages API reject an object without `additionalProperties: false`, so an
// unconverted schema is a 400 on every call — the whole nutrition pipeline down at once, which is
// exactly what happened silently at the self-host cutover (reference_mrbridge_ollama_network).

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";

import { llmProvider, mediaType, toStrictSchema } from "../lib/nutrition/llm-anthropic.ts";

describe("toStrictSchema", () => {
  it("closes every object, nested ones included", () => {
    const out = toStrictSchema({
      type: "object",
      properties: {
        items: {
          type: "array",
          items: { type: "object", properties: { query: { type: "string" } } },
        },
      },
      required: ["items"],
    }) as {
      additionalProperties: boolean;
      required: string[];
      properties: { items: { items: { additionalProperties: boolean } } };
    };
    assert.equal(out.additionalProperties, false);
    assert.equal(out.properties.items.items.additionalProperties, false);
    assert.deepEqual(out.required, ["items"]);
  });

  it("rewrites a union type array as anyOf", () => {
    const out = toStrictSchema({ type: ["number", "null"] }) as Record<string, unknown>;
    assert.equal(out.type, undefined);
    assert.deepEqual(out.anyOf, [{ type: "number" }, { type: "null" }]);
  });

  it("leaves non-object schemas and enums alone", () => {
    const out = toStrictSchema({ type: "string", enum: ["question", "adjust", "log"] });
    assert.deepEqual(out, { type: "string", enum: ["question", "adjust", "log"] });
  });

  it("does not mutate its input", () => {
    const input = { type: "object", properties: {} };
    toStrictSchema(input);
    assert.deepEqual(input, { type: "object", properties: {} });
  });
});

describe("mediaType", () => {
  it("reads the magic bytes of each supported format", () => {
    assert.equal(mediaType("/9j/4AAQSkZJRg"), "image/jpeg");
    assert.equal(mediaType("iVBORw0KGgoAAAA"), "image/png");
    assert.equal(mediaType("UklGRiQAAABXRUJQ"), "image/webp");
    assert.equal(mediaType("R0lGODlhAQAB"), "image/gif");
  });
});

describe("llmProvider", () => {
  const saved = { p: process.env.LLM_PROVIDER, k: process.env.ANTHROPIC_API_KEY };
  afterEach(() => {
    for (const [name, v] of [
      ["LLM_PROVIDER", saved.p],
      ["ANTHROPIC_API_KEY", saved.k],
    ] as const) {
      if (v === undefined) delete process.env[name];
      else process.env[name] = v;
    }
  });

  it("uses Anthropic when a key is present and nothing is forced", () => {
    delete process.env.LLM_PROVIDER;
    process.env.ANTHROPIC_API_KEY = "test";
    assert.equal(llmProvider(), "anthropic");
  });

  it("falls back to Ollama without a key", () => {
    delete process.env.LLM_PROVIDER;
    delete process.env.ANTHROPIC_API_KEY;
    assert.equal(llmProvider(), "ollama");
  });

  it("lets LLM_PROVIDER force Ollama even with a key", () => {
    process.env.LLM_PROVIDER = "Ollama";
    process.env.ANTHROPIC_API_KEY = "test";
    assert.equal(llmProvider(), "ollama");
  });

  it("throws on an unrecognised value instead of guessing", () => {
    process.env.LLM_PROVIDER = "claude";
    assert.throws(() => llmProvider(), /LLM_PROVIDER/);
  });
});
