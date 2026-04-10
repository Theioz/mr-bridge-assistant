import Link from "next/link";
import type { ChatMessage } from "@/lib/types";

interface Props {
  message: ChatMessage | null;
}

export default function RecentChat({ message }: Props) {
  return (
    <Link href="/chat" className="block bg-neutral-900 rounded-xl p-4 border border-neutral-800 hover:border-neutral-700 transition-colors">
      <p className="text-xs text-neutral-500 uppercase tracking-wide mb-3">Recent chat</p>
      {message ? (
        <div>
          <p className="text-xs text-neutral-500 mb-1 capitalize">{message.role}</p>
          <p className="text-sm text-neutral-300 line-clamp-3">{message.content}</p>
          <p className="text-xs text-neutral-600 mt-2">
            {new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
      ) : (
        <p className="text-sm text-neutral-600">No messages yet</p>
      )}
    </Link>
  );
}
