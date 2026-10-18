import type { MacroTotals, ScanItem } from "./types";

export const MAX_PHOTOS = 6;

export const HEIC_MSG =
  "In your iPhone Camera settings, set format to 'Most Compatible' and try again.";

export function isHeic(file: File): boolean {
  return file.type === "image/heic" || file.name.toLowerCase().endsWith(".heic");
}

export function roundOrDash(v: number | null, digits = 0): string {
  if (v === null) return "—";
  const m = 10 ** digits;
  return String(Math.round(v * m) / m);
}

export function sumNullable(items: ScanItem[], field: "fiber_g" | "sugar_g"): number | null {
  let sum = 0;
  let any = false;
  for (const it of items) {
    const v = it[field];
    if (v !== null && v !== undefined) {
      sum += v * it.portionFraction;
      any = true;
    }
  }
  return any ? sum : null;
}

// Totals scaled by per-item portionFraction (#545).
export function combineTotals(items: ScanItem[]): MacroTotals {
  return items.reduce(
    (acc, item) => ({
      calories: acc.calories + item.calories * item.portionFraction,
      protein_g: acc.protein_g + item.protein_g * item.portionFraction,
      carbs_g: acc.carbs_g + item.carbs_g * item.portionFraction,
      fat_g: acc.fat_g + item.fat_g * item.portionFraction,
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );
}

interface EstimateResponse {
  food_name?: string;
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  fiber_g?: number | null;
  sugar_g?: number | null;
}

/**
 * Merge a fresh estimate into an item, respecting per-field manual-edit flags — don't
 * clobber anything the user typed (#302). Shared by re-estimate and photo re-scan.
 * user_context is user-authored — always preserved unchanged.
 */
export function applyEstimate(it: ScanItem, data: EstimateResponse): ScanItem {
  return {
    ...it,
    label: it.labelManuallyEdited ? it.label : (data.food_name ?? it.label),
    calories: it.caloriesManuallyEdited ? it.calories : (data.calories ?? it.calories),
    protein_g: it.proteinManuallyEdited ? it.protein_g : (data.protein_g ?? it.protein_g),
    carbs_g: it.carbsManuallyEdited ? it.carbs_g : (data.carbs_g ?? it.carbs_g),
    fat_g: it.fatManuallyEdited ? it.fat_g : (data.fat_g ?? it.fat_g),
    fiber_g: it.fiberManuallyEdited ? it.fiber_g : (data.fiber_g ?? null),
    sugar_g: it.sugarManuallyEdited ? it.sugar_g : (data.sugar_g ?? null),
  };
}

/**
 * The USDA records the user is actually accepting by logging.
 *
 * A card whose macros were hand-edited is excluded: the numbers on it are no longer that
 * record\'s, so accepting the card says nothing about whether the record was the right food.
 */
export function acceptedPicks(items: ScanItem[]) {
  return items
    .filter(
      (i) =>
        !i.caloriesManuallyEdited &&
        !i.proteinManuallyEdited &&
        !i.carbsManuallyEdited &&
        !i.fatManuallyEdited,
    )
    .flatMap((i) => i.picks ?? []);
}

// Context handed to the inline chat.
export function buildNutritionContext(
  items: ScanItem[],
  combined: MacroTotals,
  combinedFiber: number | null,
  combinedSugar: number | null,
): string {
  const lines = items
    .map((i) => {
      const f = i.portionFraction;
      const pct = f < 1 ? ` (${Math.round(f * 100)}%)` : "";
      const cal = Math.round(i.calories * f);
      const p = Math.round(i.protein_g * f);
      const c = Math.round(i.carbs_g * f);
      const fat = Math.round(i.fat_g * f);
      const base = `- ${i.label}${pct}: ${cal} cal, ${p}g P, ${c}g C, ${fat}g fat`;
      const extras: string[] = [];
      if (i.fiber_g !== null) extras.push(`${roundOrDash(i.fiber_g * f, 1)}g fiber`);
      if (i.sugar_g !== null) extras.push(`${roundOrDash(i.sugar_g * f, 1)}g sugar`);
      return extras.length ? `${base}, ${extras.join(", ")}` : base;
    })
    .join("\n");
  const combinedLine =
    `Combined: ${Math.round(combined.calories)} cal, ${Math.round(combined.protein_g)}g P, ${Math.round(combined.carbs_g)}g C, ${Math.round(combined.fat_g)}g fat` +
    (combinedFiber !== null ? `, ${roundOrDash(combinedFiber, 1)}g fiber` : "") +
    (combinedSugar !== null ? `, ${roundOrDash(combinedSugar, 1)}g sugar` : "");
  return `--- Scanned nutrition data ---\n${lines}\n${combinedLine}`;
}
