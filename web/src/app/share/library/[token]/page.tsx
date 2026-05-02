import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import type { BacklogItem, BacklogStatus, MediaType } from "@/lib/types";

type Props = { params: Promise<{ token: string }> };

const STATUS_LABELS: Record<string, string> = {
  backlog: "Queued",
  active: "Active",
  paused: "Paused",
  finished: "Finished",
  dropped: "Dropped",
};

const STATUS_COLORS: Record<string, string> = {
  backlog: "rgba(148,163,184,0.5)",
  active: "#6366f1",
  paused: "#f59e0b",
  finished: "#22c55e",
  dropped: "#ef4444",
};

const MEDIA_LABELS: Record<string, string> = {
  game: "Games",
  show: "Shows",
  movie: "Movies",
  book: "Books",
};

const STATUS_ORDER: BacklogStatus[] = ["active", "paused", "finished", "backlog", "dropped"];

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 9px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        color: "#fff",
        background: STATUS_COLORS[status] ?? "#666",
        whiteSpace: "nowrap",
      }}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function CoverThumb({ url, title }: { url: string | null; title: string }) {
  if (!url) {
    return (
      <div
        style={{
          width: 36,
          height: 52,
          borderRadius: 4,
          background: "#1e1e1e",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 14,
          color: "#555",
        }}
      >
        ?
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={title}
      width={36}
      height={52}
      style={{ borderRadius: 4, objectFit: "cover", flexShrink: 0 }}
    />
  );
}

export default async function ShareLibraryPage({ params }: Props) {
  const { token } = await params;

  const supabase = createServiceClient();

  // Resolve user from share token
  const { data: profileRow } = await supabase
    .from("profile")
    .select("user_id, value")
    .eq("key", "library_share_token")
    .eq("value", token)
    .maybeSingle();

  if (!profileRow) notFound();

  const userId = profileRow.user_id as string;

  // Fetch all items + display name in parallel
  const [{ data: items }, { data: nameRow }] = await Promise.all([
    supabase
      .from("backlog_items")
      .select("*")
      .eq("user_id", userId)
      .order("priority", { ascending: true })
      .order("created_at", { ascending: false }),
    supabase.from("profile").select("value").eq("user_id", userId).eq("key", "name").maybeSingle(),
  ]);

  const allItems = (items ?? []) as BacklogItem[];
  const displayName = (nameRow?.value as string | null) ?? null;

  const byType: Record<string, BacklogItem[]> = { game: [], show: [], movie: [], book: [] };
  for (const item of allItems) {
    if (byType[item.media_type]) byType[item.media_type].push(item);
  }

  const totalFinished = allItems.filter((i) => i.status === "finished").length;
  const totalActive = allItems.filter((i) => i.status === "active").length;

  const tabs: MediaType[] = (["game", "show", "movie", "book"] as MediaType[]).filter(
    (t) => byType[t].length > 0,
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f0f0f",
        color: "#e5e5e5",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          borderBottom: "1px solid #1f1f1f",
          padding: "32px 24px 24px",
          maxWidth: 860,
          margin: "0 auto",
        }}
      >
        <p
          style={{
            fontSize: 12,
            color: "#555",
            marginBottom: 8,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Media Library
        </p>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: "0 0 6px" }}>
          {displayName ? `${displayName}'s Library` : "Library"}
        </h1>
        <p style={{ fontSize: 14, color: "#888", margin: 0 }}>
          {allItems.length} titles tracked
          {totalFinished > 0 && ` · ${totalFinished} finished`}
          {totalActive > 0 && ` · ${totalActive} active`}
        </p>
      </div>

      {/* Sections by media type */}
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "0 24px 60px" }}>
        {tabs.map((type) => {
          const typeItems = [...byType[type]].sort((a, b) => {
            const ai = STATUS_ORDER.indexOf(a.status as BacklogStatus);
            const bi = STATUS_ORDER.indexOf(b.status as BacklogStatus);
            if (ai !== bi) return ai - bi;
            return (b.rating ?? 0) - (a.rating ?? 0);
          });

          return (
            <section key={type} style={{ marginTop: 40 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 10,
                  marginBottom: 16,
                  borderBottom: "1px solid #1f1f1f",
                  paddingBottom: 10,
                }}
              >
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{MEDIA_LABELS[type]}</h2>
                <span style={{ fontSize: 13, color: "#555" }}>{typeItems.length}</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {typeItems.map((item) => {
                  const meta = item.metadata as Record<string, unknown> | null;
                  const playedOn = type === "game" ? (meta?.played_on as string | null) : null;

                  return (
                    <div
                      key={item.id}
                      style={{
                        display: "flex",
                        gap: 14,
                        padding: "10px 0",
                        borderBottom: "1px solid #1a1a1a",
                        alignItems: "center",
                      }}
                    >
                      <CoverThumb url={item.cover_url} title={item.title} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p
                          style={{
                            margin: 0,
                            fontSize: 14,
                            fontWeight: 600,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {item.title}
                        </p>
                        {(item.creator || item.release_date || playedOn) && (
                          <p style={{ margin: "2px 0 0", fontSize: 12, color: "#777" }}>
                            {item.creator}
                            {item.release_date ? ` · ${item.release_date.slice(0, 4)}` : ""}
                            {playedOn ? ` · ${playedOn}` : ""}
                          </p>
                        )}
                      </div>
                      <div
                        style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}
                      >
                        {item.rating != null && (
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#6366f1" }}>
                            {Number(item.rating).toFixed(1)}
                          </span>
                        )}
                        <StatusBadge status={item.status} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}

        {allItems.length === 0 && (
          <p style={{ marginTop: 60, textAlign: "center", color: "#555", fontSize: 14 }}>
            No items in this library yet.
          </p>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          borderTop: "1px solid #1a1a1a",
          padding: "20px 24px",
          textAlign: "center",
          fontSize: 12,
          color: "#444",
        }}
      >
        Tracked with{" "}
        <a
          href="https://github.com/Theioz/mr-bridge-assistant"
          style={{ color: "#555", textDecoration: "underline" }}
        >
          Mr. Bridge
        </a>
      </div>
    </div>
  );
}
