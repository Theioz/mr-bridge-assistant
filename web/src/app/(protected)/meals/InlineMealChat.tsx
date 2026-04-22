"use client";

import { useEffect, useRef, useState } from "react";
import { Send, X, CheckCircle, Loader2 } from "lucide-react";
import type { MealType, ScanItem } from "./FoodPhotoAnalyzer";

interface Props {
  initialContext: string;
  scanItems: ScanItem[];
  defaultMealType: MealType;
  onLoggedViaChat: () => void;
  onClose: () => void;
}

interface ProposalItem {
  label: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  sugar_g: number | null;
}

interface LogMealProposal {
  kind: "log_meal_proposal";
  items: ProposalItem[];
  meal_type: MealType;
  notes: string;
  totals: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    fiber_g: number | null;
    sugar_g: number | null;
  };
}

type ChatMessage =
  | { role: "user"; kind: "text"; content: string }
  | { role: "assistant"; kind: "text"; content: string }
  | {
      role: "assistant";
      kind: "proposal";
      proposal: LogMealProposal;
      status: "pending" | "logging" | "logged" | "cancelled";
    };

const inputStyle = {
  background: "var(--color-bg)",
  border: "1px solid var(--color-border)",
  color: "var(--color-text)",
  outline: "none",
  fontSize: 16,
  borderRadius: 8,
  padding: "10px 12px",
  width: "100%",
  WebkitAppearance: "none" as const,
} as const;

function round(n: number, digits = 0): number {
  const m = 10 ** digits;
  return Math.round(n * m) / m;
}
function dashOr(n: number | null, digits = 1): string {
  return n === null ? "—" : String(round(n, digits));
}

export default function InlineMealChat({
  initialContext,
  scanItems,
  defaultMealType,
  onLoggedViaChat,
  onClose,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(text: string) {
    if (!text.trim() || isLoading) return;

    const userMsg: ChatMessage = { role: "user", kind: "text", content: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setIsLoading(true);

    // Prepend nutrition context to the first user message only (API-side).
    const textHistory: { role: "user" | "assistant"; content: string }[] = [];
    let firstUserAugmented = false;
    for (const m of next) {
      if (m.kind !== "text") continue;
      if (!firstUserAugmented && m.role === "user") {
        textHistory.push({ role: "user", content: `${initialContext}\n\n${m.content}` });
        firstUserAugmented = true;
      } else {
        textHistory.push({ role: m.role, content: m.content });
      }
    }

    try {
      const res = await fetch("/api/meals/scan-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: textHistory,
          scanItems: scanItems.map((i) => ({
            id: i.id,
            label: i.label,
            calories: i.calories,
            protein_g: i.protein_g,
            carbs_g: i.carbs_g,
            fat_g: i.fat_g,
            fiber_g: i.fiber_g,
            sugar_g: i.sugar_g,
          })),
          mealType: defaultMealType,
        }),
      });
      if (!res.ok || !res.body) throw new Error("Request failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      let textMessageIndex: number | null = null;
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Process complete lines; the last partial line stays in buffer.
        let nl = buffer.indexOf("\n");
        while (nl !== -1) {
          const line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          nl = buffer.indexOf("\n");
          if (!line) continue;

          // AI SDK data-protocol prefixes:
          //   0:"..."    → text token
          //   a:{...}    → tool result (our action card)
          if (line.startsWith("0:")) {
            try {
              const token = JSON.parse(line.slice(2));
              assistantText += token;
              setMessages((prev) => {
                if (textMessageIndex === null) {
                  textMessageIndex = prev.length;
                  return [...prev, { role: "assistant", kind: "text", content: assistantText }];
                }
                const copy = prev.slice();
                copy[textMessageIndex] = {
                  role: "assistant",
                  kind: "text",
                  content: assistantText,
                };
                return copy;
              });
            } catch {
              // ignore malformed chunks
            }
          } else if (line.startsWith("a:")) {
            try {
              const payload = JSON.parse(line.slice(2)) as {
                toolCallId?: string;
                result?: unknown;
              };
              const result = payload.result as { kind?: string } | undefined;
              if (result?.kind === "log_meal_proposal") {
                const proposal = result as unknown as LogMealProposal;
                setMessages((prev) => [
                  ...prev,
                  { role: "assistant", kind: "proposal", proposal, status: "pending" },
                ]);
                textMessageIndex = null; // any subsequent text opens a new message
                assistantText = "";
              }
            } catch {
              // ignore malformed tool-result chunks
            }
          }
          // Other prefixes (f:, e:, d:, 9:, 2:, ...) are intentionally ignored.
        }
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", kind: "text", content: "Something went wrong. Try again." },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  async function confirmProposal(index: number) {
    setMessages((prev) => {
      const copy = prev.slice();
      const m = copy[index];
      if (m.kind === "proposal") copy[index] = { ...m, status: "logging" };
      return copy;
    });
    const msg = messages[index];
    if (!msg || msg.kind !== "proposal") return;
    const p = msg.proposal;
    try {
      const res = await fetch("/api/meals/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meal_type: p.meal_type,
          notes: p.notes,
          calories: Math.round(p.totals.calories),
          protein_g: round(p.totals.protein_g, 1),
          carbs_g: round(p.totals.carbs_g, 1),
          fat_g: round(p.totals.fat_g, 1),
          fiber_g: p.totals.fiber_g === null ? null : round(p.totals.fiber_g, 1),
          sugar_g: p.totals.sugar_g === null ? null : round(p.totals.sugar_g, 1),
          source: "scanner",
        }),
      });
      if (!res.ok) throw new Error("log failed");
      setMessages((prev) => {
        const copy = prev.slice();
        const m = copy[index];
        if (m.kind === "proposal") copy[index] = { ...m, status: "logged" };
        return copy;
      });
      // Let the user see "Logged ✓" briefly, then clear scans on the parent.
      setTimeout(onLoggedViaChat, 800);
    } catch {
      setMessages((prev) => {
        const copy = prev.slice();
        const m = copy[index];
        if (m.kind === "proposal") copy[index] = { ...m, status: "pending" };
        return [
          ...copy,
          { role: "assistant", kind: "text", content: "Couldn't log that — try again." },
        ];
      });
    }
  }

  function cancelProposal(index: number) {
    setMessages((prev) => {
      const copy = prev.slice();
      const m = copy[index];
      if (m.kind === "proposal") copy[index] = { ...m, status: "cancelled" };
      return copy;
    });
  }

  return (
    <div
      className="rounded-xl overflow-hidden flex flex-col"
      style={{
        border: "1px solid var(--color-border)",
        background: "var(--color-surface)",
        maxHeight: 420,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)" }}>
          Mr. Bridge
        </span>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--color-text-muted)",
            padding: 4,
          }}
        >
          <X size={15} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ minHeight: 140 }}>
        {messages.length === 0 && (
          <p style={{ fontSize: 13, color: "var(--color-text-muted)", textAlign: "center" }}>
            Ask about your scan, or say &ldquo;log it&rdquo; to save.
          </p>
        )}
        {messages.map((m, i) => {
          if (m.kind === "text") {
            return (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className="rounded-2xl px-3 py-2"
                  style={{
                    fontSize: 13,
                    maxWidth: "85%",
                    background: m.role === "user" ? "var(--color-primary)" : "var(--color-bg)",
                    color: m.role === "user" ? "var(--color-text-on-cta)" : "var(--color-text)",
                    border: m.role === "assistant" ? "1px solid var(--color-border)" : "none",
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.5,
                  }}
                >
                  {m.content || (isLoading && m.role === "assistant" ? "…" : "")}
                </div>
              </div>
            );
          }
          // Proposal card (action card)
          const p = m.proposal;
          const status = m.status;
          return (
            <div key={i} className="flex justify-start">
              <div
                className="flex flex-col"
                style={{
                  width: "100%",
                  maxWidth: "100%",
                  background: "var(--color-bg)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 12,
                  padding: "var(--space-3)",
                  gap: "var(--space-2)",
                }}
              >
                <div
                  className="flex items-center justify-between"
                  style={{
                    fontSize: 12,
                    color: "var(--color-text-muted)",
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  <span>Log proposal · {p.meal_type}</span>
                  {status === "logged" && (
                    <span
                      className="flex items-center"
                      style={{
                        gap: 4,
                        color: "var(--color-positive)",
                        textTransform: "none",
                        letterSpacing: 0,
                      }}
                    >
                      <CheckCircle size={13} />
                      Logged
                    </span>
                  )}
                  {status === "cancelled" && (
                    <span
                      style={{
                        color: "var(--color-text-faint)",
                        textTransform: "none",
                        letterSpacing: 0,
                      }}
                    >
                      Cancelled
                    </span>
                  )}
                </div>
                <div className="flex flex-col" style={{ gap: 2 }}>
                  {p.items.map((it, idx) => (
                    <div
                      key={idx}
                      className="flex items-baseline"
                      style={{ gap: "var(--space-2)", fontSize: 13, color: "var(--color-text)" }}
                    >
                      <span style={{ flex: 1, minWidth: 0, wordBreak: "break-word" }}>
                        {it.label}
                      </span>
                      <span
                        className="tnum"
                        style={{ fontSize: 12, color: "var(--color-text-muted)" }}
                      >
                        {Math.round(it.calories)} cal · P{Math.round(it.protein_g)} · C
                        {Math.round(it.carbs_g)} · F{Math.round(it.fat_g)}
                      </span>
                    </div>
                  ))}
                </div>
                <div
                  className="tnum"
                  style={{
                    fontSize: 12,
                    color: "var(--color-text)",
                    paddingTop: "var(--space-2)",
                    borderTop: "1px solid var(--color-border)",
                  }}
                >
                  <strong>Total:</strong> {Math.round(p.totals.calories)} cal ·{" "}
                  {Math.round(p.totals.protein_g)}g P · {Math.round(p.totals.carbs_g)}g C ·{" "}
                  {Math.round(p.totals.fat_g)}g F
                  {(p.totals.fiber_g !== null || p.totals.sugar_g !== null) && (
                    <div style={{ color: "var(--color-text-muted)", marginTop: 2 }}>
                      Fiber {dashOr(p.totals.fiber_g)}g · Sugar {dashOr(p.totals.sugar_g)}g
                    </div>
                  )}
                </div>
                {status === "pending" && (
                  <div
                    className="flex"
                    style={{ gap: "var(--space-2)", marginTop: "var(--space-1)" }}
                  >
                    <button
                      onClick={() => confirmProposal(i)}
                      className="transition-opacity active:opacity-70"
                      style={{
                        background: "var(--color-primary)",
                        color: "var(--color-text-on-cta)",
                        border: "none",
                        borderRadius: 8,
                        padding: "8px 14px",
                        fontSize: 13,
                        fontWeight: 500,
                        cursor: "pointer",
                        flex: 1,
                      }}
                    >
                      Log
                    </button>
                    <button
                      onClick={() => cancelProposal(i)}
                      className="transition-opacity active:opacity-70"
                      style={{
                        background: "transparent",
                        color: "var(--color-text-muted)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 8,
                        padding: "8px 14px",
                        fontSize: 13,
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
                {status === "logging" && (
                  <div
                    className="flex items-center"
                    style={{ gap: 6, fontSize: 12, color: "var(--color-text-muted)" }}
                  >
                    <Loader2 size={13} className="animate-spin" />
                    Logging…
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        className="flex gap-2 px-3 pb-3 pt-2"
        style={{ borderTop: "1px solid var(--color-border)" }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage(input);
            }
          }}
          placeholder='Ask, or say "log it"…'
          disabled={isLoading}
          style={{ ...inputStyle, flex: 1, fontSize: 14 }}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={isLoading || !input.trim()}
          style={{
            background: "var(--color-primary)",
            color: "var(--color-text-on-cta)",
            border: "none",
            borderRadius: 10,
            padding: "10px 13px",
            cursor: "pointer",
            opacity: isLoading || !input.trim() ? 0.4 : 1,
            flexShrink: 0,
          }}
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
