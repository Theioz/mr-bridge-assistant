// Run on https://www.amazon.com/dp/<ASIN>?fpw=alm — READ-ONLY.
// Reads the listing's Nutrition Facts panel for pin_grocery_product's `label`.
//
// The full panel sits in HIDDEN markup inside #updatedAlmNutritionalInformation_feature_div, so
// it is read with textContent (innerText skips hidden text and returns only the summary strip).
// Some listings have the element but leave it empty, and show the label only as a product photo:
// those return hasPanel:false — report "photograph the label on delivery", never guess.
//
// Pass `panelText` to pin_grocery_product VERBATIM. The server parses the numbers; `preview` is
// only for the report, so a person can eyeball the panel before it is stored.
(() => {
  const squash = (s) => (s || "").replace(/\s+/g, " ").trim();
  const el = document.querySelector(
    "#updatedAlmNutritionalInformation_feature_div",
  );
  const panelText = squash(el?.textContent);
  const byline = squash(document.querySelector("#bylineInfo")?.textContent);
  const brand =
    byline.match(/^Visit the (.+?) Store$/i)?.[1] ??
    byline.match(/^Brand:\s*(.+)$/i)?.[1] ??
    null;
  const hasPanel = /Amount per/i.test(panelText);
  const body = hasPanel ? panelText.slice(panelText.search(/Amount per/i)) : "";
  const pick = (re) => body.match(re)?.[1] ?? null;
  return {
    asin: location.pathname.match(/\/dp\/([A-Z0-9]{10})/i)?.[1] ?? null,
    title: squash(document.querySelector("#productTitle")?.textContent) || null,
    brand,
    hasPanel,
    reason: hasPanel
      ? null
      : el
        ? "panel element is empty: the label is only a photo, photograph it on delivery"
        : "no nutrition panel on this listing: photograph the label on delivery",
    panelText: hasPanel ? panelText : null,
    preview: hasPanel
      ? {
          serving:
            panelText.match(/Serving size (.+?) Amount per/i)?.[1] ?? null,
          servingsPerContainer:
            panelText.match(/([\d.]+) servings per container/i)?.[1] ?? null,
          calories: pick(/Calories\s+(<?\s*[\d,.]+)/i),
          fat: pick(/Total Fat\s+(<?\s*[\d.]+\s*g)/i),
          carbs: pick(/Total Carbohydrate\s+(<?\s*[\d.]+\s*g)/i),
          protein: pick(/Protein\s+(<?\s*[\d.]+\s*g)/i),
          sodium: pick(/Sodium\s+(<?\s*[\d.]+\s*mg)/i),
        }
      : null,
  };
})();
