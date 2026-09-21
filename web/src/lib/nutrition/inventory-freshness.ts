// Freshness classification for inventory rows — extracted from InventoryPanel so it can be
// unit-tested. The panel renders it; this module decides it.
//
// WHY THIS EXISTS
//
// The "Use soon" strip is a do-something-now list. On 2026-09-21 it showed 16 items, of which
// 14 were rows at 0 g kept only for their notes — food eaten or thrown out weeks earlier. Zero
// items on it were real. The cause was that the classifier looked only at `expires_on` and
// never at `quantity`, and the urgent test (`days <= USE_SOON_DAYS`) has no lower bound, so a
// spent row 50 days past its date scored urgent forever.
//
// That is the failure shape this codebase keeps hitting: a signal that cannot distinguish
// "nothing to do" from "act now". A triage list that is 87% tombstones is worse than no
// triage list, because the two real rows are invisible in it.

// An item this close to (or past) its date is what the next cook should spend first.
export const USE_SOON_DAYS = 3;

export type Freshness = "urgent" | "fine" | "stable" | "frozen" | "spent";

/** The fields freshness depends on — a structural subset, so both row shapes satisfy it. */
export interface FreshnessInput {
  quantity: number | null;
  location: string;
  expires_on: string | null;
}

/** Whole days from today to `dateStr`; negative once the date has passed. */
export function daysUntil(dateStr: string, today: Date = new Date()): number {
  const then = new Date(`${dateStr}T00:00:00`);
  const now = new Date(today);
  now.setHours(0, 0, 0, 0);
  return Math.round((then.getTime() - now.getTime()) / 86_400_000);
}

// A row at exactly 0 is a spent record kept for its notes — the food is gone. It must never be
// called urgent, however far past its date it is. A NULL quantity is the opposite case: an
// untracked staple (rice, oil) that is ASSUMED ON HAND, so only an explicit 0 counts as spent.
// Getting that backwards would hide every staple from the kitchen.
export function isSpent(item: FreshnessInput): boolean {
  return item.quantity !== null && Number(item.quantity) === 0;
}

// Spent rows are inert; frozen items don't expire on a fridge clock; a dated fridge/counter item
// is urgent inside the window and fine outside it; an undated staple is simply stable.
export function freshnessOf(
  item: FreshnessInput,
  today: Date = new Date(),
): { kind: Freshness; days: number | null } {
  if (isSpent(item)) return { kind: "spent", days: null };
  if (item.location === "freezer") return { kind: "frozen", days: null };
  if (item.expires_on) {
    const d = daysUntil(item.expires_on, today);
    return { kind: d <= USE_SOON_DAYS ? "urgent" : "fine", days: d };
  }
  return { kind: "stable", days: null };
}

/** Rows for the "Use soon" strip, soonest first. Spent rows can never appear here. */
export function useSoonItems<T extends FreshnessInput>(items: T[], today: Date = new Date()): T[] {
  return items
    .filter((i) => freshnessOf(i, today).kind === "urgent")
    .sort(
      (a, b) => daysUntil(a.expires_on as string, today) - daysUntil(b.expires_on as string, today),
    );
}

export function daysText(d: number): string {
  if (d < 0) return "expired";
  if (d === 0) return "today";
  return `${d}d`;
}
