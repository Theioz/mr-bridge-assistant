import { Plane } from "lucide-react";

function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * One slim line while a "Stay at …" calendar event covers today (lib/travel/stay.ts).
 * `until` is the last day the stay covers — for a hotel booking, check-out day.
 */
export default function TravelNote({ city, until }: { city: string; until: string }) {
  return (
    <p
      className="flex items-center"
      style={{
        gap: "var(--space-2)",
        margin: 0,
        fontSize: "var(--t-meta)",
        color: "var(--color-text-muted)",
      }}
    >
      <Plane size={14} aria-hidden style={{ color: "var(--color-text-faint)", flexShrink: 0 }} />
      <span>
        Traveling — <span style={{ color: "var(--color-text)" }}>{city}</span> until{" "}
        {shortDate(until)}
      </span>
    </p>
  );
}
