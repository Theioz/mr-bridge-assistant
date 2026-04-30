import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import type { BacklogItem } from "@/lib/types";

type Props = { params: Promise<{ token: string }> };

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    backlog: "var(--color-text-muted)",
    active: "var(--color-primary)",
    paused: "#f59e0b",
    finished: "#22c55e",
    dropped: "#ef4444",
  };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        textTransform: "capitalize",
        color: "#fff",
        background: colors[status] ?? "var(--color-text-muted)",
      }}
    >
      {status}
    </span>
  );
}

export default async function ShareBacklogPage({ params }: Props) {
  const { token } = await params;

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("backlog_items")
    .select("*")
    .eq("share_token", token)
    .maybeSingle();

  if (!data) notFound();

  const item = data as BacklogItem;

  const typeLabel: Record<string, string> = {
    game: "Game",
    show: "TV Show",
    movie: "Movie",
    book: "Book",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--color-bg, #0f0f0f)",
        color: "var(--color-text, #e5e5e5)",
        padding: "40px 20px",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        {/* Header */}
        <p style={{ fontSize: 13, color: "var(--color-text-muted, #888)", marginBottom: 24 }}>
          Shared via Mr. Bridge — {typeLabel[item.media_type] ?? item.media_type}
        </p>

        <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
          {/* Cover */}
          {item.cover_url && (
            <img
              src={item.cover_url}
              alt={item.title}
              width={100}
              height={150}
              style={{ borderRadius: 6, objectFit: "cover", flexShrink: 0 }}
            />
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px" }}>{item.title}</h1>
            {item.creator && (
              <p
                style={{ fontSize: 14, color: "var(--color-text-muted, #888)", margin: "0 0 8px" }}
              >
                {item.creator}
                {item.release_date && ` · ${item.release_date.slice(0, 4)}`}
              </p>
            )}
            <StatusBadge status={item.status} />

            {item.rating != null && (
              <p style={{ marginTop: 12, fontSize: 20, fontWeight: 700 }}>
                {item.rating.toFixed(1)}{" "}
                <span style={{ fontSize: 14, color: "var(--color-text-muted, #888)" }}>/ 10</span>
              </p>
            )}
          </div>
        </div>

        {item.description && (
          <p
            style={{
              marginTop: 20,
              fontSize: 14,
              lineHeight: 1.6,
              color: "var(--color-text-secondary, #bbb)",
            }}
          >
            {item.description}
          </p>
        )}

        {item.review && (
          <div
            style={{
              marginTop: 24,
              padding: "16px",
              borderLeft: "3px solid var(--color-primary, #6366f1)",
              background: "var(--color-bg-2, #1a1a1a)",
              borderRadius: "0 6px 6px 0",
            }}
          >
            <p
              style={{
                fontSize: 12,
                fontWeight: 600,
                marginBottom: 6,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "var(--color-text-muted, #888)",
              }}
            >
              Review
            </p>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{item.review}</p>
          </div>
        )}

        <p style={{ marginTop: 40, fontSize: 12, color: "var(--color-text-muted, #888)" }}>
          Tracked with{" "}
          <a
            href="https://github.com/Theioz/mr-bridge-assistant"
            style={{ color: "inherit", textDecoration: "underline" }}
          >
            Mr. Bridge
          </a>
        </p>
      </div>
    </div>
  );
}
