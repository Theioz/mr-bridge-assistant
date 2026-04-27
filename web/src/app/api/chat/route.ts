import { anthropic } from "@ai-sdk/anthropic";
import { createGroq } from "@ai-sdk/groq";
import { USER_TZ } from "@/lib/timezone";
import { buildProactivityContext } from "@/lib/chat/proactivity-context";
import { ToolLoopAgent, wrapLanguageModel, stepCountIs, convertToModelMessages } from "ai";
import type { UIMessage, ModelMessage } from "ai";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import type { ToolContext } from "@/lib/tools/_context";
import { selectModel, extractTextFromParts } from "@/lib/chat/select-model";
import { buildSystemValue } from "@/lib/chat/system-prompt";
import { buildChatTools } from "@/lib/chat/build-tools";
import {
  extractCompletedSteps,
  computeCacheMetrics,
  synthesizeFallbackSummary,
  effectiveTokensForQuota,
} from "@/lib/chat/synthesis";
import { retryOnOverload, tokenBudgetExceeds } from "@/lib/chat/middleware";
import {
  fetchUserProfile,
  loadContextMessages,
  upsertSession,
  persistUserMessage,
  recordTurnQuota,
  persistAssistantMessage,
} from "@/lib/chat/persist";

// Lambda runtime ceiling. A wall-clock timer trips turnAbort at TURN_DEADLINE_MS
// so onFinish always runs and persists a fallback assistant message before
// Vercel's hard kill — the silent-stall path #319 hit when the previous 60s
// ceiling let the Lambda die mid-stream.
export const maxDuration = 90;
const TURN_DEADLINE_MS = 80_000;
// #519: emitted as a stream text part before abort so the client always sees
// readable text rather than an error state on timeout.
const DEADLINE_MESSAGE =
  "I ran out of time mid-task. Here's what I completed — use the Continue button to pick up where I left off.";

// Removes assistant messages whose tool_use blocks have no matching tool_result
// anywhere in the message array. This happens when the deadline fires mid-tool-call:
// the model emits tool_use, but results never arrive before abort. Sending that
// malformed history to Anthropic causes a 400 "tool_use without tool_result".
//
// Previous implementation only scanned the immediately-following message for results,
// missing orphans when multiple tool-calls are interleaved or when the result message
// is absent entirely. This version builds a global result-ID set first so every orphan
// is caught regardless of position.
//
// Also handles both SDK format (type: "tool-call") and Anthropic wire format
// (type: "tool_use") so DB-stored parts in either encoding are caught.
type AnyPart = { type: string; [k: string]: unknown };

function getToolCallId(p: AnyPart): string {
  // SDK ModelMessage: toolCallId; Anthropic wire: id or tool_use_id
  return String(p.toolCallId ?? p.id ?? p.tool_use_id ?? "");
}

function isToolCallPart(p: AnyPart): boolean {
  return p.type === "tool-call" || p.type === "tool_use";
}

function isToolResultPart(p: AnyPart): boolean {
  return p.type === "tool-result" || p.type === "tool_result";
}

function sanitizeIncompleteToolCalls(messages: ModelMessage[], sessionId?: string): ModelMessage[] {
  // Pass 1: collect every tool-result ID across the entire message array.
  const allResultIds = new Set<string>();
  for (const msg of messages) {
    if (Array.isArray(msg.content)) {
      for (const p of msg.content as AnyPart[]) {
        if (isToolResultPart(p)) {
          const id = getToolCallId(p);
          if (id) allResultIds.add(id);
        }
      }
    }
  }

  // Pass 2: strip any assistant tool-call that has no matching result anywhere.
  const out: ModelMessage[] = [];
  let i = 0;
  while (i < messages.length) {
    const msg = messages[i];
    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      const parts = msg.content as AnyPart[];
      const toolCalls = parts.filter(isToolCallPart);
      if (toolCalls.length > 0) {
        const orphaned = toolCalls.filter((c) => {
          const id = getToolCallId(c);
          return !id || !allResultIds.has(id);
        });
        if (orphaned.length > 0) {
          const orphanIds = orphaned.map((c) => getToolCallId(c) || "?").join(",");
          console.log(
            `[chat] sanitize: dropping ${orphaned.length}/${toolCalls.length} orphaned tool-call(s)` +
              ` ids=${orphanIds} msg[${i}] session=${sessionId ?? "?"}`,
          );
          // Keep non-tool-call parts and any tool-calls that DO have results.
          const matchedIds = new Set(
            toolCalls
              .filter((c) => {
                const id = getToolCallId(c);
                return id && allResultIds.has(id);
              })
              .map(getToolCallId),
          );
          const stripped = parts.filter((p) => {
            if (!isToolCallPart(p)) return true;
            const id = getToolCallId(p);
            return id && matchedIds.has(id);
          });
          if (stripped.length > 0)
            out.push({ ...msg, content: stripped } as unknown as ModelMessage);
          // If ALL tool-calls were orphaned, skip the immediately following tool message
          // (it would also be orphaned — no point sending empty results to Anthropic).
          if (orphaned.length === toolCalls.length && messages[i + 1]?.role === "tool") i++;
          i++;
          continue;
        }
      }
    }
    out.push(msg);
    i++;
  }
  return out;
}

export async function POST(req: Request) {
  const {
    messages,
    sessionId,
    model: modelOverride,
  } = (await req.json()) as {
    messages: UIMessage[];
    sessionId?: string;
    model?: "haiku" | "sonnet" | "auto";
  };
  console.log("[chat] sessionId:", sessionId, "messages:", messages.length);

  // Resolve the authenticated user (needed for per-user data scoping)
  const serverClient = await createClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  const userId = user.id;
  const demoUserId = process.env.DEMO_USER_ID ?? null;
  const isDemo = !!(demoUserId && userId === demoUserId);

  const supabase = createServiceClient();

  // #457: per-tenant daily rate limit. Atomic check + increment before any
  // expensive work (message persist, context load, streaming). Fail open on
  // DB error so a Supabase hiccup never blocks paying users.
  const quotaKind = isDemo ? "demo" : "chat";
  const { data: quotaResult, error: quotaError } = await supabase.rpc("check_and_increment_quota", {
    p_user_id: userId,
    p_kind: quotaKind,
  });
  if (quotaError) {
    console.error("[chat] quota check error — failing open:", quotaError);
  } else if (quotaResult && !(quotaResult as { allowed: boolean }).allowed) {
    const { resets_at } = quotaResult as { allowed: boolean; resets_at: string };
    return new Response(JSON.stringify({ error: "daily_quota_exhausted", resets_at }), {
      status: 429,
      headers: { "content-type": "application/json" },
    });
  }

  const { userName, proactivityEnabled } = await fetchUserProfile(supabase, userId);
  const contextModelMessages = await loadContextMessages(supabase, sessionId);

  // Persist the session and user message immediately — before streaming starts.
  // This ensures messages survive stream errors, timeouts, or aborts (fix for issue #132).
  const lastUserMessage = messages[messages.length - 1];
  const userMessageContent = lastUserMessage ? extractTextFromParts(lastUserMessage) : "";
  await persistUserMessage(supabase, {
    sessionId,
    userId,
    content: userMessageContent,
    parts: lastUserMessage?.parts,
  });

  const userLabel = userName ?? (isDemo ? "Demo User" : "the user");
  const _now = new Date();
  const _dayName = _now.toLocaleDateString("en-US", { weekday: "long", timeZone: USER_TZ });
  const _dateStr = _now.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: USER_TZ,
  });
  const todayFull = `${_dayName}, ${_dateStr}`;

  // Fetch proactivity signals for non-demo users who have the feature enabled.
  const proactivityBlock =
    !isDemo && proactivityEnabled ? await buildProactivityContext(userId, supabase) : "";

  const systemValue = buildSystemValue({
    isDemo,
    userLabel,
    todayFull,
    proactivityBlock,
    userName,
  });

  // Pre-sanitize UIMessages: strip tool-invocation parts without a completed output.
  // ToolLoopAgent emits "dynamic-tool" parts (NOT "tool-<name>") at runtime, so we
  // check both shapes. Valid completion states: "output-available" | "output-error".
  // "input-streaming" / "input-available" mean the deadline fired before results
  // arrived — including them causes Anthropic 400 "tool_use without tool_result".
  const sanitizedUIMessages = messages.map((msg) => {
    if (msg.role !== "assistant") return msg;
    const safeParts = msg.parts.filter((part) => {
      const p = part as { type?: string; state?: string };
      const t = p.type ?? "";
      const isToolPart = t.startsWith("tool-") || t === "dynamic-tool";
      if (isToolPart) {
        return p.state === "output-available" || p.state === "output-error";
      }
      return true;
    });
    if (safeParts.length === msg.parts.length) return msg;
    console.log(
      `[chat] sanitized ${msg.parts.length - safeParts.length} incomplete tool part(s) from assistant message session=${sessionId}`,
    );
    return { ...msg, parts: safeParts };
  });
  // ignoreIncompleteToolCalls strips any remaining input-streaming / input-available
  // tool parts the UIMessage sanitizer might have missed (defense-in-depth).
  const incomingModelMessages = await convertToModelMessages(sanitizedUIMessages, {
    ignoreIncompleteToolCalls: true,
  });

  const toolContext: ToolContext = { supabase, userId, isDemo, sessionId };
  const tools = buildChatTools(toolContext, isDemo);

  // Select model: demo → Groq Llama (free tier); real user → Anthropic tier selection
  let selectedModel;
  let modelTier: "haiku" | "sonnet" | null = null;
  if (isDemo) {
    const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });
    selectedModel = groq("llama-3.3-70b-versatile");
    console.log(`[chat] model=groq/llama-3.3-70b-versatile (demo) session=${sessionId}`);
  } else {
    modelTier = selectModel(messages, modelOverride);
    const lastMsg = messages[messages.length - 1];
    const lastMsgPreview = lastMsg ? extractTextFromParts(lastMsg).slice(0, 80) : "";
    console.log(`[chat] model=${modelTier} session=${sessionId} msg="${lastMsgPreview}"`);
    selectedModel = wrapLanguageModel({
      model: anthropic(modelTier === "haiku" ? "claude-haiku-4-5-20251001" : "claude-sonnet-4-6"),
      middleware: retryOnOverload,
    });
  }

  // #339: Anthropic extended thinking on the Sonnet path, behind ENABLE_THINKING
  // for an A/B measurement run. Adaptive mode: the model decides per-turn
  // whether reasoning is warranted. Reasoning is session-only — sendReasoning:false
  // on the stream response keeps reasoning bytes off the wire.
  const thinkingEnabled = modelTier === "sonnet" && process.env.ENABLE_THINKING === "1";

  // Per-turn safeguards (issues #223 + #319): raise step cap from 12→20 so
  // multi-step calendar/task flows can finish their summary, bound cost with a
  // token budget, and bound wall-time with TURN_DEADLINE_MS so onFinish ALWAYS
  // runs before Vercel's maxDuration kill.
  const MAX_STEPS = 20;
  const TOKEN_BUDGET = 150_000;
  const turnStartedAt = Date.now();
  let deadlineExceeded = false;
  const turnAbort = new AbortController();
  const deadlineTimer = setTimeout(() => {
    deadlineExceeded = true;
    console.warn(
      `[chat] turn deadline exceeded session=${sessionId} ms=${TURN_DEADLINE_MS} — aborting turn so onFinish can run`,
    );
    turnAbort.abort();
  }, TURN_DEADLINE_MS);

  // Turn-complete sentinel state (#319) — hoisted so toUIMessageStreamResponse's
  // messageMetadata callback can emit them as metadata on the assistant message.
  // v5 replaced StreamData's side-channel with per-message metadata.
  let synthesized = false;
  let hadFailures = false;
  let hitStepCap = false;
  // #342: stash the canonical text-to-persist (from agent.onFinish) so the
  // outer toUIMessageStreamResponse.onFinish can write it alongside the
  // structured `parts` it receives from the SDK as `responseMessage.parts`.
  let contentToPersist = "";

  const agent = new ToolLoopAgent({
    model: selectedModel,
    instructions: systemValue,
    tools,
    ...(thinkingEnabled && {
      providerOptions: {
        anthropic: { thinking: { type: "adaptive" } },
      },
    }),
    stopWhen: [stepCountIs(MAX_STEPS), tokenBudgetExceeds(TOKEN_BUDGET)],
    // Per-request tool factories already close over { supabase, userId,
    // isDemo, sessionId } via `toolContext` above; prepareCall runs per
    // invoke so future callers could swap tools at call time without
    // reconstructing the agent. Passthrough today satisfies #350's contract
    // that tools wire through prepareCall.
    //
    // Step-limit warning: when >= 15 steps have been used this turn, inject
    // a countdown into instructions so the model stops and hands off rather
    // than running silently into the cap.
    prepareCall: async (args) => {
      const used = (args as { messages?: unknown[] }).messages?.length
        ? Math.floor(((args as { messages: unknown[] }).messages.length - 1) / 2)
        : 0;
      if (used >= MAX_STEPS - 5) {
        const remaining = MAX_STEPS - used;
        // args.instructions may be a SystemEntry[] (for real users with cacheControl).
        // Template-literal interpolation would stringify the array as "[object Object],..."
        // which silently wipes the system prompt. Extract plain text first.
        const instructionsText =
          typeof args.instructions === "string"
            ? args.instructions
            : Array.isArray(args.instructions)
              ? (args.instructions as Array<{ content?: string }>)
                  .map((b) => b.content ?? "")
                  .join("\n\n")
              : String(args.instructions ?? "");
        return {
          ...args,
          instructions:
            instructionsText +
            `\n\n⚠ STEP LIMIT: You have used approximately ${used} of ${MAX_STEPS} steps this turn — roughly ${remaining} remaining. ` +
            `Do NOT start any new work. Finish only the current action, then stop and summarize for the user: what was completed this turn and what work remains unfinished. End with "Use the Continue button to pick up where I left off."`,
        };
      }
      return args;
    },
    onFinish: async ({ text, steps, finishReason, totalUsage, warnings }) => {
      clearTimeout(deadlineTimer);

      const stepCount = steps?.length ?? 0;
      hitStepCap = stepCount >= MAX_STEPS;
      const cumulativeTokens = (steps ?? []).reduce(
        (acc, s) => acc + (s.usage?.inputTokens ?? 0) + (s.usage?.outputTokens ?? 0),
        0,
      );
      const budgetExceeded = cumulativeTokens > TOKEN_BUDGET;
      const durationMs = Date.now() - turnStartedAt;

      // #340 prompt-cache accounting. Sum across steps because totalUsage
      // aggregation of inputTokenDetails is provider-dependent; stepping
      // manually matches what the SDK's telemetry does and is robust to
      // null-filled detail objects on non-Anthropic providers (Groq).
      const {
        cacheReadTokens,
        cacheWriteTokens,
        noCacheTokens,
        reasoningParts,
        reasoningChars,
        allWarnings,
      } = computeCacheMetrics(steps ?? [], warnings);

      // #457: record actual billing-weighted token cost post-stream.
      // Demo path uses Groq (free) — skip.
      if (!isDemo) {
        const delta = effectiveTokensForQuota({
          outputTokens: totalUsage?.outputTokens,
          cacheReadTokens,
          cacheWriteTokens,
          noCacheTokens,
        });
        await recordTurnQuota(supabase, userId, delta);
      }

      // Pair up tool calls with their results so the synthesizer can tell
      // "tool ran and succeeded" from "tool ran and failed".
      const completedSteps = extractCompletedSteps(steps ?? []);
      hadFailures = completedSteps.filter((s) => !s.ok).length > 0;

      // Determine what to persist. Three cases:
      //   1. Model produced text → persist as-is (normal path).
      //   2. Empty text + tool calls ran → synthesize from steps + results.
      //   3. Empty text + nothing ran → persist a visible error so the user
      //      isn't left in silence.
      // #342: assigns the closure-level `contentToPersist` so the outer
      // toUIMessageStreamResponse.onFinish (which holds responseMessage.parts)
      // writes both columns in one insert.
      contentToPersist = text.trim();
      if (!contentToPersist) {
        if (deadlineExceeded) {
          // #519: transform will have injected DEADLINE_MESSAGE as stream text;
          // use the same string so the content column matches what the client saw.
          contentToPersist = DEADLINE_MESSAGE;
        } else {
          contentToPersist = synthesizeFallbackSummary(completedSteps, {
            hitStepCap,
            budgetExceeded,
            aborted: false,
          });
          synthesized = true;
        }
      }

      console.log(
        `[chat] turn complete session=${sessionId} steps=${stepCount}/${MAX_STEPS} ` +
          `tokens=${cumulativeTokens} durationMs=${durationMs} finishReason=${finishReason} ` +
          `hitStepCap=${hitStepCap} budgetExceeded=${budgetExceeded} deadlineExceeded=${deadlineExceeded} ` +
          `synthesized=${synthesized} toolFailures=${completedSteps.filter((s) => !s.ok).length}/${completedSteps.length}`,
      );

      // #340: structured per-turn cache-usage log. `isDemo` on Groq reports no
      // cache details; warnings surface any Anthropic wire-limit issue (e.g.
      // "cacheControl breakpoint limit") so silent degradation doesn't hide.
      console.log(
        `[chat] cache session=${sessionId} isDemo=${isDemo} ` +
          `inputTokens=${totalUsage?.inputTokens ?? 0} outputTokens=${totalUsage?.outputTokens ?? 0} ` +
          `cacheRead=${cacheReadTokens} cacheWrite=${cacheWriteTokens} noCache=${noCacheTokens} ` +
          `reasoningParts=${reasoningParts} reasoningChars=${reasoningChars} thinkingEnabled=${thinkingEnabled} ` +
          `warnings=${allWarnings.length === 0 ? "[]" : JSON.stringify(allWarnings)}`,
      );

      // #342: assistant-message persistence moved to
      // toUIMessageStreamResponse.onFinish so we can write both `content`
      // (preview snapshot — this string) and `parts` (structured assistant
      // message from the SDK).
    },
  });

  const safeIncomingMessages = sanitizeIncompleteToolCalls(incomingModelMessages, sessionId);
  const result = await agent.stream({
    messages: [...contextModelMessages, ...safeIncomingMessages],
    abortSignal: turnAbort.signal,
    // #519: intercept error/abort parts caused by the deadline and replace them
    // with a readable text block so the client always gets a chat bubble.
    experimental_transform: () => {
      let activeTextId: string | null = null;
      let deadlineTextInjected = false;
      return new TransformStream({
        transform(chunk, controller) {
          if (chunk.type === "text-start") activeTextId = chunk.id;
          else if (chunk.type === "text-end") activeTextId = null;

          if (
            (chunk.type === "error" || chunk.type === "abort") &&
            deadlineExceeded &&
            !deadlineTextInjected
          ) {
            deadlineTextInjected = true;
            if (activeTextId !== null) {
              controller.enqueue({ type: "text-end" as const, id: activeTextId });
              activeTextId = null;
            }
            const id = "deadline-0";
            controller.enqueue({ type: "text-start" as const, id });
            controller.enqueue({ type: "text-delta" as const, id, text: DEADLINE_MESSAGE });
            controller.enqueue({ type: "text-end" as const, id });
            return;
          }

          controller.enqueue(chunk);
        },
      });
    },
  });

  // v5: emit the turn-complete sentinel (#319) as message metadata stamped on
  // the finish part. Client reads message.metadata.turnComplete to distinguish
  // a clean turn end from a Lambda kill mid-stream.
  return result.toUIMessageStreamResponse({
    // #342: pass the incoming UIMessages so the SDK runs in persistence mode
    // and stamps a stable id on the response message; `responseMessage.parts`
    // arriving in onFinish below is the canonical structured assistant
    // message we persist.
    originalMessages: messages,
    // #339: backend-only — even if thinking is enabled, reasoning parts must
    // not cross the wire. Defaults to true otherwise.
    sendReasoning: false,
    messageMetadata: ({ part }) => {
      if (part.type === "finish") {
        return {
          turnComplete: { synthesized, hadFailures, deadlineExceeded, hitStepCap },
        };
      }
    },
    onFinish: async ({ responseMessage }) => {
      if (!sessionId || !userId) return;
      try {
        await upsertSession(supabase, { sessionId, userId });
        // #342: dual-write — `content` is the preview snapshot (text or #319
        // synthesized fallback); `parts` is the structured assistant message
        // for round-trip rendering. Reasoning parts are stripped — #339 owns
        // reasoning persistence; this keeps it ephemeral, matching the
        // sendReasoning:false posture above.
        await persistAssistantMessage(supabase, {
          sessionId,
          userId,
          content: contentToPersist,
          parts: responseMessage.parts.filter((p) => p.type !== "reasoning"),
        });
      } catch (persistErr) {
        console.error("[chat] onFinish persist error:", persistErr);
      }
    },
    onError: (error) => {
      // #519: deadline aborts are handled by the transform — suppress here so
      // the client never sees an error state from our own turnAbort signal.
      if (error instanceof Error && error.name === "AbortError" && turnAbort.signal.aborted) {
        console.warn("[chat] deadline abort — stream closed cleanly");
        return "";
      }
      console.error("[chat] stream error:", JSON.stringify(error));
      return "An error occurred.";
    },
  });
}
