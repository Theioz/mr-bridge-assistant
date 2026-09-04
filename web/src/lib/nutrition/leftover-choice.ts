/**
 * Which existing tray a serving should come from.
 *
 * Split out of `eatFromRecipe` so the policy can be tested without a database. The bug it
 * exists to prevent had no policy at all: "Ate it" on a recipe-backed plan called `createCook`
 * UNCONDITIONALLY, so cooking a batch and then logging a serving from it produced TWO trays.
 *
 * Observed 2026-09-04 — a 4-portion pasta batch recorded through the Cook It dialog at
 * 17:54:20 (with its inventory draws) was followed 2.1 s later by "Ate it" on that day's lunch
 * plan, which created a second 4-portion cook carrying no draws. The fridge then reported
 * 7 portions of a 4-portion batch, and the serving came off the phantom tray while the real
 * one stayed full.
 *
 * The direction is what makes it expensive: `getLeftovers` is what the planner reads to decide
 * there is nothing to shop for, so inflated portions plan meals around food that does not exist
 * — the same failure as an inventory row reading stocked while the shelf is empty.
 */

export interface SpendableCook {
  id: string;
  portions_remaining: number | string | null;
  cooked_on: string | null;
}

/**
 * Pick the tray to spend, or null when the fridge holds nothing that can cover this serving.
 *
 * OLDEST FIRST, matching `getLeftovers` — the whole point of the cooks model is eating food
 * before it turns, and spending the newest tray would leave the old one to rot with the count
 * still looking right.
 *
 * BIG ENOUGH, OR NOT AT ALL. A tray with half a portion left cannot cover a one-portion log.
 * Drawing it anyway would push `portions_remaining` negative and log macros for food that was
 * not there; `eatFromCook` would reject it outright. Passing over it and cooking is the honest
 * answer — the half portion stays visible in the fridge rather than being silently consumed.
 */
export function chooseCookToSpend<T extends SpendableCook>(
  candidates: readonly T[],
  portionsWanted: number,
): T | null {
  if (!(portionsWanted > 0)) return null;

  const usable = candidates.filter((c) => {
    const left = Number(c.portions_remaining);
    return Number.isFinite(left) && left >= portionsWanted;
  });
  if (usable.length === 0) return null;

  // Undated trays sort last: a row with no `cooked_on` has no deadline to be urgent about.
  return usable.reduce((oldest, c) => {
    if (!c.cooked_on) return oldest;
    if (!oldest.cooked_on) return c;
    return c.cooked_on < oldest.cooked_on ? c : oldest;
  });
}
