import Link from "next/link";
import type { BacklogItem } from "@/lib/types";
import { STATUS_COLORS, STATUS_LABELS } from "../shared";

// ── Cover grid ────────────────────────────────────────────────────────────────

function CoverCard({ item, showType }: { item: BacklogItem; showType?: boolean }) {
  return (
    <Link
      href={`/library/${item.id}`}
      style={{ textDecoration: "none", color: "inherit", display: "block" }}
    >
      <div
        className="card-lift"
        style={{
          position: "relative",
          borderRadius: "var(--r-2)",
          overflow: "hidden",
          aspectRatio: "2/3",
          background: "var(--color-surface-raised)",
          border: "1px solid var(--rule-soft)",
          transition:
            "transform var(--motion-fast) var(--ease-out-quart), box-shadow var(--motion-fast) var(--ease-out-quart)",
        }}
      >
        {item.cover_url ? (
          <img
            src={item.cover_url}
            alt={item.title}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
              color: "var(--color-text-muted)",
            }}
          >
            ?
          </div>
        )}

        {/* Status dot */}
        <span
          role="img"
          aria-label={STATUS_LABELS[item.status] ?? item.status}
          title={STATUS_LABELS[item.status] ?? item.status}
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: STATUS_COLORS[item.status] ?? "var(--color-text-faint)",
            boxShadow: "0 0 0 2px rgba(0,0,0,0.6)",
          }}
        />

        {/* Type badge — only on All tab */}
        {showType && (
          <span
            style={{
              position: "absolute",
              top: 6,
              left: 6,
              fontSize: 9,
              fontWeight: 700,
              background: "rgba(0,0,0,0.75)",
              color: "var(--color-primary)",
              borderRadius: 4,
              padding: "2px 5px",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {item.media_type}
          </span>
        )}

        {/* Title overlay at bottom */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            padding: "20px 8px 8px",
            background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 11,
              fontWeight: 600,
              color: "#fff",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              lineHeight: 1.3,
            }}
          >
            {item.title}
          </p>
          {item.release_date && (
            <p style={{ margin: "1px 0 0", fontSize: 10, color: "rgba(255,255,255,0.55)" }}>
              {item.release_date.slice(0, 4)}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function CoverGrid({
  items,
  showType,
}: {
  items: BacklogItem[];
  showType?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
        gap: 10,
      }}
    >
      {items.map((item) => (
        <CoverCard key={item.id} item={item} showType={showType} />
      ))}
    </div>
  );
}
