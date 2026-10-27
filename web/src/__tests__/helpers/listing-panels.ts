// Amazon Fresh listing panels, as fixtures for listing-label and meal-tools tests.
// Not a test file: the runner glob is src/__tests__/*.test.ts, so helpers/ is never run.

// The cooked-shrimp panel exactly as #updatedAlmNutritionalInformation_feature_div's textContent
// read on 2026-10-26 (ASIN B07ZS3ZTCC), whitespace collapsed. It is the reason the review step
// exists: "1.0 servings per container" for a 12 oz bag, and 0 mg sodium on shrimp.
export const SHRIMP_TEXT =
  "Nutrition information 1.0 servings per container | 3 oz (85g) About 11 shrimp 100 Calories " +
  "19g Protein 0mg Sodium 0g Fiber 0g Sugars 1.0 servings per container Serving size 3 oz (85g) " +
  "About 11 shrimp Amount per 3 oz (85g) About 11 shrimp Calories 100 % Daily Value * 0% Total " +
  "Fat 1.5g 0% Saturated Fat 0g 0% Cholesterol 0mg 0% Sodium 0mg 0% Total Carbohydrate 1g 0% " +
  "Dietary Fiber 0g Sugars 0g 0% Protein 19g 0% Calcium 0mg 0% Iron 0mg *The % Daily Value (DV) " +
  "tells you how much a nutrient in a serving of food contributes to a daily diet.";

/** A panel in the same layout as the live block, for listings only their numbers were kept of. */
export function panelText(p: {
  servings: string;
  serving: string;
  kcal: string;
  fat: string;
  carbs: string;
  fiber?: string;
  sugars?: string;
  protein: string;
  sodium?: string;
}) {
  return (
    `Nutrition information ${p.servings} servings per container | ${p.serving} ${p.kcal} Calories ` +
    `${p.protein}g Protein ${p.servings} servings per container Serving size ${p.serving} ` +
    `Amount per ${p.serving} Calories ${p.kcal} % Daily Value * 0% Total Fat ${p.fat}g ` +
    `0% Sodium ${p.sodium ?? "0"}mg 0% Total Carbohydrate ${p.carbs}g ` +
    `0% Dietary Fiber ${p.fiber ?? "0"}g Total Sugars ${p.sugars ?? "0"}g ` +
    `Includes 0g Added Sugars 0% Protein ${p.protein}g`
  );
}

// Cleveland Kitchen Classic Kimchi (B098PVNV18), numbers as read 2026-10-26.
export const KIMCHI_TEXT = panelText({
  servings: "16",
  serving: "1 oz (28g)",
  kcal: "10",
  fat: "0",
  carbs: "3",
  fiber: "1",
  sugars: "2",
  protein: "0",
  sodium: "270",
});
