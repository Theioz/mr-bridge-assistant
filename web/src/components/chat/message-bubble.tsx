import type { Message } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  message: Message;
}

export default function MessageBubble({ message }: Props) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "bg-neutral-700 text-neutral-100 rounded-br-sm whitespace-pre-wrap"
            : "bg-neutral-900 text-neutral-200 rounded-bl-sm border border-neutral-800"
        }`}
      >
        {isUser ? (
          message.content
        ) : (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
              strong: ({ children }) => <strong className="font-semibold text-neutral-100">{children}</strong>,
              em: ({ children }) => <em className="italic text-neutral-300">{children}</em>,
              h1: ({ children }) => <h1 className="text-base font-semibold text-neutral-100 mt-3 mb-1 first:mt-0">{children}</h1>,
              h2: ({ children }) => <h2 className="text-sm font-semibold text-neutral-100 mt-3 mb-1 first:mt-0">{children}</h2>,
              h3: ({ children }) => <h3 className="text-sm font-medium text-neutral-300 mt-2 mb-1 first:mt-0">{children}</h3>,
              ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5 text-neutral-300">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-0.5 text-neutral-300">{children}</ol>,
              li: ({ children }) => <li className="leading-relaxed">{children}</li>,
              code: ({ children, className }) => {
                const isBlock = className?.includes("language-");
                return isBlock ? (
                  <code className="block bg-neutral-800 rounded-lg px-3 py-2 my-2 text-xs text-neutral-300 overflow-x-auto whitespace-pre">{children}</code>
                ) : (
                  <code className="bg-neutral-800 rounded px-1 py-0.5 text-xs text-neutral-300">{children}</code>
                );
              },
              pre: ({ children }) => <pre className="my-2">{children}</pre>,
              table: ({ children }) => (
                <div className="overflow-x-auto my-2">
                  <table className="w-full text-xs border-collapse">{children}</table>
                </div>
              ),
              thead: ({ children }) => <thead>{children}</thead>,
              tbody: ({ children }) => <tbody>{children}</tbody>,
              tr: ({ children }) => <tr className="border-b border-neutral-700/50">{children}</tr>,
              th: ({ children }) => <th className="text-left px-3 py-1.5 font-medium text-neutral-400 border-b border-neutral-700">{children}</th>,
              td: ({ children }) => <td className="px-3 py-1.5 text-neutral-300">{children}</td>,
              hr: () => <hr className="border-neutral-700 my-3" />,
              blockquote: ({ children }) => <blockquote className="border-l-2 border-neutral-600 pl-3 text-neutral-400 italic my-2">{children}</blockquote>,
            }}
          >
            {message.content}
          </ReactMarkdown>
        )}
      </div>
    </div>
  );
}
