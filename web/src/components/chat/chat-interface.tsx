"use client";

import { useChat } from "ai/react";
import { useEffect, useRef } from "react";
import { Send } from "lucide-react";
import MessageBubble from "./message-bubble";
import ToolStatusBar from "./tool-status-bar";
import type { Message } from "ai";

interface Props {
  sessionId: string;
  initialMessages: Message[];
}

export default function ChatInterface({ sessionId, initialMessages }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  const { messages, input, handleInputChange, handleSubmit, isLoading, error, reload } = useChat({
    api: "/api/chat",
    body: { sessionId },
    initialMessages,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex flex-col h-[calc(100dvh-8rem)]">
      <div className="flex-1 overflow-y-auto space-y-3 py-4">
        {messages.length === 0 && (
          <p className="text-center text-sm text-neutral-600 mt-8">
            Ask Mr. Bridge anything.
          </p>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        <ToolStatusBar messages={messages} isLoading={isLoading} />
        {isLoading && messages[messages.length - 1]?.role === "user" && (
          <div className="flex justify-start">
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl rounded-bl-sm px-4 py-2.5">
              <span className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-neutral-500 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-neutral-500 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-neutral-500 rounded-full animate-bounce [animation-delay:300ms]" />
              </span>
            </div>
          </div>
        )}
        {error && !isLoading && (
          <div className="flex justify-start">
            <div className="bg-neutral-900 border border-red-900 rounded-2xl rounded-bl-sm px-4 py-2.5 flex items-center gap-3">
              <span className="text-sm text-red-400">
                {error.message?.includes("overloaded") ? "API overloaded — try again." : "Error — try again."}
              </span>
              <button
                onClick={() => reload()}
                className="text-xs text-neutral-400 hover:text-neutral-200 underline underline-offset-2"
              >
                Retry
              </button>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 py-3 border-t border-neutral-800">
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="Ask Mr. Bridge..."
          className="flex-1 bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-2.5 text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-neutral-500"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="bg-blue-500 text-white rounded-xl px-3.5 py-2.5 disabled:opacity-30 hover:bg-blue-400 transition-colors"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
