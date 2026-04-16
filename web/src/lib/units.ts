export type WeightUnit = "kg" | "lb";

const LB_PER_KG = 2.2046226218;

export function kgToDisplay(kg: number | null | undefined, unit: WeightUnit): number | null {
  if (kg == null || Number.isNaN(kg)) return null;
  if (unit === "kg") return round(kg, 1);
  return round(kg * LB_PER_KG, 1);
}

export function displayToKg(value: number | null | undefined, unit: WeightUnit): number | null {
  if (value == null || Number.isNaN(value)) return null;
  if (unit === "kg") return round(value, 3);
  return round(value / LB_PER_KG, 3);
}

export function formatWeight(kg: number | null | undefined, unit: WeightUnit): string {
  const display = kgToDisplay(kg, unit);
  if (display == null) return "—";
  return `${display} ${unit}`;
}

export function parseWeightUnit(raw: string | null | undefined): WeightUnit {
  return raw === "kg" ? "kg" : "lb";
}

function round(n: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}
