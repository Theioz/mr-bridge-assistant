// Workout dedup — THE single implementation.
//
// Deliberately a LEAF MODULE with zero imports. Two reasons:
//
//  1. It can be unit-tested on Node's built-in runner with no dependencies and no module
//     aliasing (see web/src/__tests__/google-health-dedupe.test.ts). Importing it from
//     google-health.ts instead would drag in the Supabase client and `@/`-aliased modules,
//     which the bare `node --experimental-strip-types --test` resolver cannot load.
//  2. Until 2026-08-05 this rule existed TWICE — once here in TypeScript and once in
//     scripts/sync-google-health.py. They drifted and both carried the same bug; fixing
//     the Python copy (#656) read as fixing the system while the nightly cron, which runs
//     the TypeScript path, kept writing duplicates until #657. The Python syncs were then
//     deleted and this became the only implementation. Keep it that way: if dedup needs
//     changing, it changes HERE, once.

/** A workout row already stored in `workout_sessions`. */
export interface StoredWorkout {
  id: string;
  date: string;
  start_time: string | null;
  activity: string;
  avg_hr: number | null;
  duration_mins: number | null;
}

/** ±5 min. Two starts closer together than this on one date are the same session. */
export const OVERLAP_MINS = 5;

/**
 * How much of a zoneless row's own duration must overlap a known session before it is judged
 * a coarse copy of it. Half is deliberately loose: the copies do not agree with their twin on
 * start OR duration, so a stricter ratio would miss them (2026-09-01 overlaps 79%, and the
 * 2026-09-08 pair 92%), while a looser one starts eating short genuine walks that merely
 * brush a longer session's tail.
 */
export const PHANTOM_OVERLAP_RATIO = 0.5;

/** "13:12:00" → minutes past midnight. Null for a missing or unparseable time. */
export function timeToMins(t: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

/** A row's `metadata.hr_zones`, or undefined when the row carries no metadata at all. */
function hrZonesOf(row: Record<string, unknown>): unknown {
  const meta = row.metadata;
  if (meta == null || typeof meta !== "object") return undefined;
  return (meta as { hr_zones?: unknown }).hr_zones;
}

/**
 * True for a row that explicitly reports NO heart-rate zones.
 *
 * This is the signature of a Google Health writer that never held the HR sensor. A row with no
 * `metadata` key at all is NOT judged here — absence of the field is not evidence of absent
 * zones, and the exact-key and ±5 min passes still apply to it.
 */
function isZoneless(row: Record<string, unknown>): boolean {
  const zones = hrZonesOf(row);
  return zones !== undefined && !zones;
}

/** Positive minutes of wall-clock overlap between two [start, start+duration] intervals. */
function overlapMins(aStart: number, aDur: number, bStart: number, bDur: number): number {
  return Math.min(aStart + aDur, bStart + bDur) - Math.max(aStart, bStart);
}

function finiteDuration(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * Decide which incoming workouts are genuinely new.
 *
 * Three passes, in order:
 *
 *  1. Exact-key dedup (`date|start_time|activity`).
 *  2. **Interval overlap for zoneless copies.** A row reporting no HR zones that overlaps at
 *     least PHANTOM_OVERLAP_RATIO of its own duration with a known session is a coarse copy of
 *     it and is dropped, however far apart the two starts are.
 *  3. The ±5 min same-date start-proximity check.
 *
 * Both windowed passes are checked against stored rows AND against rows already accepted
 * earlier in this same batch. Google Health aggregates several writers (watch, phone,
 * connected apps) and commonly emits one activity twice per response — once from the writer
 * holding the HR sensor, with `hr_zones` populated, and once as a coarse copy with `hr_zones`
 * null and a wild calorie figure. Both arrive together, so neither is stored yet when the other
 * is judged, and a plain `.filter()` over the stored rows lets both through. That was the bug
 * behind the 2026-07-31 duplicates, fixed in #656/#657.
 *
 * WHY PASS 2 EXISTS. #657 shipped 2026-08-05 and the pairs kept coming: 13 more between
 * 2026-08-06 and 2026-09-08, worth 1,729 phantom kcal and 8.6 h. The ±5 min window was simply
 * too narrow. The copies land 6-19 minutes after their twin, not the "seconds to ~3 min"
 * the 2026-08-05 sweep had observed — 8 min on 2026-09-08 (100 min / 696 kcal recorded again as
 * 102 min / 377 kcal), 10 min on 2026-09-06, 19 min on 2026-08-07 and 2026-09-01. Widening
 * OVERLAP_MINS to cover that would collapse genuinely separate back-to-back walks, which Jason
 * does have (2026-08-24 has two real walks 34 min apart, 2026-08-28 has four). Overlap in wall
 * clock is the honest test: you cannot start a second walk while the first is still running.
 *
 * Pass 2 deliberately ignores `activity`. Writers disagree on the label for one session — the
 * 2026-08-07 phone copy of an 08:55 `Treadmill` run came back as a 09:14 `Walk` nested inside
 * it. Requiring the labels to match would miss exactly the copies this pass exists to catch.
 *
 * Rows carrying no zones AND overlapping nothing are left alone. There are 15 of those since
 * 2026-08-01 (10-39 min, 2-3 kcal/min, no twin) — low-fidelity passive step detection rather
 * than copies of anything, and a separate question from this one.
 *
 * KNOWN LIMITATION, unchanged and still asserted in the tests: pass 3's index is keyed by date
 * only, not date+activity, so two *different* activities starting within 5 min collapse.
 */
export function filterNewWorkouts(
  stored: StoredWorkout[],
  incoming: Record<string, unknown>[],
): Record<string, unknown>[] {
  const storedKeys = new Set(stored.map((r) => `${r.date}|${r.start_time}|${r.activity}`));
  const exactNew = incoming.filter((r) => !storedKeys.has(r._key as string));

  // Judge rows that report HR zones first. A genuine row and its zoneless copy usually arrive
  // in the same batch, and pass 2 can only condemn the copy once the genuine row is in the
  // comparison set. Stable, so rows that tie keep their original order.
  const ordered = exactNew
    .map((row, i) => ({ row, i, zoneless: isZoneless(row) }))
    .sort((a, b) => Number(a.zoneless) - Number(b.zoneless) || a.i - b.i)
    .map((e) => e.row);

  const dateIndex = new Map<string, StoredWorkout[]>();
  for (const r of stored) dateIndex.set(r.date, [...(dateIndex.get(r.date) ?? []), r]);

  const accepted: Record<string, unknown>[] = [];
  for (const row of ordered) {
    const newMins = timeToMins(row.start_time as string | null);
    const date = row.date as string;
    const sameDate = dateIndex.get(date) ?? [];
    const newDur = finiteDuration(row.duration_mins);

    // Pass 2 — a zoneless row sitting inside a session we already know about.
    let shadowed = false;
    if (isZoneless(row) && newMins != null && newDur != null) {
      for (const ex of sameDate) {
        const exMins = timeToMins(ex.start_time);
        const exDur = finiteDuration(ex.duration_mins);
        if (exMins == null || exDur == null) continue;
        if (overlapMins(newMins, newDur, exMins, exDur) >= newDur * PHANTOM_OVERLAP_RATIO) {
          shadowed = true;
          break;
        }
      }
    }
    if (shadowed) continue;

    // Pass 3 — start-time proximity.
    let overlapped = false;
    for (const ex of sameDate) {
      const exMins = timeToMins(ex.start_time);
      if (newMins == null || exMins == null) continue;
      if (Math.abs(newMins - exMins) <= OVERLAP_MINS) {
        overlapped = true;
        break;
      }
    }
    if (overlapped) continue;

    accepted.push(row);
    // The accepted row joins the comparison set for the rest of this batch. It carries its real
    // duration: pass 2 needs an interval, and a null here would make it invisible to that pass.
    dateIndex.set(date, [
      ...sameDate,
      {
        id: "",
        date,
        start_time: row.start_time as string | null,
        activity: row.activity as string,
        avg_hr: null,
        duration_mins: newDur,
      },
    ]);
  }
  return accepted;
}
