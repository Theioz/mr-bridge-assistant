export default function Loading() {
  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Message area */}
      <div className="flex-1 flex items-center justify-center">
        <span style={{ fontSize: "var(--t-meta)", color: "var(--color-text-faint)" }}>
          Loading conversation…
        </span>
      </div>
      {/* Input bar */}
      <div className="skeleton" style={{ height: 44, width: "100%", borderRadius: "var(--r-2)" }} />
    </div>
  );
}
