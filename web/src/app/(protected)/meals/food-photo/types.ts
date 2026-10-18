export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
export type ScanPhase = "idle" | "error" | "manual";
export type AnalyzerMode = "food" | "label";
export type ActiveSheet = "log" | "mealprep" | null;

export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as MealType[];

export interface ScanItem {
  id: string;
  mode: AnalyzerMode;
  label: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  // Nutrient columns — null means "not estimated", rendered as "—" not "0" (#304).
  fiber_g: number | null;
  sugar_g: number | null;
  sodium_mg?: number;
  ingredients?: string;
  /**
   * The USDA records this card was priced from. Sent back when the meal is LOGGED, which is
   * what earns a food its pin in the server-side memo — the estimator no longer pins its own
   * picks, because a confident pick is not a correct one ("oyster" -> Mushrooms, oyster, raw).
   * Dropped when the macros are hand-edited: the numbers are then yours, not that record's.
   */
  picks?: { query: string; fdc_id: number; description?: string }[];
  // Per-field manual-edit flags — re-estimate must not clobber user edits (#302).
  labelManuallyEdited?: boolean;
  caloriesManuallyEdited?: boolean;
  proteinManuallyEdited?: boolean;
  carbsManuallyEdited?: boolean;
  fatManuallyEdited?: boolean;
  fiberManuallyEdited?: boolean;
  sugarManuallyEdited?: boolean;
  // User-supplied dish description at capture time (#371).
  user_context?: string;
  // Fraction of the dish the user ate (0–1). Default 1.0 (#545).
  portionFraction: number;
}

export interface PendingPhoto {
  tempId: string;
  fileName: string;
}

export interface FailedPhoto {
  tempId: string;
  file: File;
  errorMsg: string;
}

export interface StagedPhoto {
  tempId: string;
  file: File;
  fileName: string;
  previewUrl: string | null; // object URL for camera captures; null for library
}

export interface MacroTotals {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}
