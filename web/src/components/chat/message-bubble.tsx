import type { Message } from "ai";

interface Props {
  message: Message;
}

export default function MessageBubble({ message }: Props) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-neutral-700 text-neutral-100 rounded-br-sm"
            : "bg-neutral-900 text-neutral-200 rounded-bl-sm border border-neutral-800"
        }`}
      >
        {message.content}
      </div>
    </div>
  );
}
