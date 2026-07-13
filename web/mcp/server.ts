#!/usr/bin/env -S npx tsx
/**
 * Mr Bridge MCP server — the replacement for the in-app /chat page (#476).
 *
 * This exposes the SAME 30 tools the chat had, to Claude Code / the Claude app,
 * over your existing subscription. No Anthropic API key, no metered billing.
 *
 * It is deliberately a thin ADAPTER, not a rewrite. `src/lib/tools/*` already
 * defines every tool as an AI SDK `tool()` with a plain JSON Schema (`jsonSchema()`)
 * and an async `execute()` — which is, structurally, already an MCP tool. Wrapping
 * them means the tools keep ONE implementation: fix a bug once and both the app and
 * Claude Code get it. Rewriting them would have created two copies to drift apart.
 *
 * It also inherits none of the chat route's bug class. There is no 90s Lambda
 * deadline to beat, no streaming wire format, and no message history to reconstruct
 * — so the orphaned `tool_use`/`tool_result` 400s, the fabricated "I ran out of
 * time" message and the Continue button all simply cease to exist. Those were
 * artifacts of running a tool loop inside a serverless function, not of the tools.
 *
 * Run:  npx tsx web/mcp/server.ts        (see .mcp.json)
 * Env:  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OWNER_USER_ID
 *       (+ ENCRYPTION_KEY / GOOGLE_* for the gmail + calendar tools)
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";

import { buildChatTools } from "../src/lib/tools/build";
import type { ToolContext } from "../src/lib/tools/_context";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OWNER_USER_ID = process.env.OWNER_USER_ID;

if (!SUPABASE_URL || !SERVICE_KEY || !OWNER_USER_ID) {
  console.error(
    "[mr-bridge-mcp] missing env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OWNER_USER_ID",
  );
  process.exit(1);
}

// Service-role client: the tools scope by explicit user_id filters rather than RLS
// (same contract as the old chat route — see lib/tools/_context.ts).
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const context: ToolContext = {
  supabase,
  userId: OWNER_USER_ID,
  isDemo: false, // this server is the owner's own tooling; never the demo account
};

const tools = buildChatTools(context);

/**
 * AI SDK's `jsonSchema()` stores the raw schema on `.jsonSchema`. Zod-based tools
 * would need conversion, but every tool here is already plain JSON Schema — which
 * is exactly what MCP wants.
 */
type AiTool = {
  description?: string;
  inputSchema?: { jsonSchema?: Record<string, unknown> } | Record<string, unknown>;
  execute?: (args: Record<string, unknown>) => Promise<unknown>;
};

function schemaOf(t: AiTool): Record<string, unknown> {
  const raw = (t.inputSchema as { jsonSchema?: Record<string, unknown> })?.jsonSchema;
  return raw ?? (t.inputSchema as Record<string, unknown>) ?? { type: "object", properties: {} };
}

const entries = Object.entries(tools as Record<string, AiTool>).filter(([, t]) => t.execute);

const server = new Server({ name: "mr-bridge", version: "1.0.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: entries.map(([name, t]) => ({
    name,
    description: t.description ?? name,
    inputSchema: schemaOf(t),
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  const entry = entries.find(([n]) => n === name);
  if (!entry) {
    return {
      isError: true,
      content: [{ type: "text" as const, text: `unknown tool: ${name}` }],
    };
  }

  try {
    const result = await entry[1].execute!((args ?? {}) as Record<string, unknown>);

    // The tools already return a verified {ok,error} contract for mutations
    // (lib/tools/_contract.ts) — surface a failure AS a failure rather than letting
    // it read as success. This is the same reason the contract exists: the chat used
    // to say "Done — event created" when the Google API had actually errored.
    const failed =
      result !== null &&
      typeof result === "object" &&
      "ok" in (result as Record<string, unknown>) &&
      (result as { ok: unknown }).ok === false;

    return {
      isError: failed,
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  } catch (e) {
    return {
      isError: true,
      content: [
        { type: "text" as const, text: `${name} failed: ${e instanceof Error ? e.message : e}` },
      ],
    };
  }
});

async function main() {
  await server.connect(new StdioServerTransport());
  // stderr, not stdout — stdout is the JSON-RPC channel and any stray byte on it
  // corrupts the protocol.
  console.error(`[mr-bridge-mcp] ready — ${entries.length} tools`);
}

main().catch((e) => {
  console.error("[mr-bridge-mcp] fatal:", e);
  process.exit(1);
});
