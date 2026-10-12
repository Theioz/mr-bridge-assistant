// Run on https://www.amazon.com/dp/<ASIN>?fpw=alm — READ-ONLY.
// Says whether the Fresh offer exists and where the VISIBLE "Add to cart" button is.
// Click those coordinates with the computer tool. Do NOT click element refs from `find`:
// on Amazon they resolve to hidden duplicate buttons, and the click silently does nothing.
(() => {
  const visible = (e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden";
  };
  const add = [...document.querySelectorAll("span.a-button-text, input[type=submit], button")]
    .filter(visible)
    .find((e) => /^add to cart$/i.test((e.innerText || e.value || "").trim()));
  const r = add?.getBoundingClientRect();
  return {
    title: document.querySelector("#productTitle")?.innerText?.trim() ?? null,
    availability: document.querySelector("#availability, #almAvailability_feature_div, #outOfStock")?.innerText?.trim()?.slice(0, 80) ?? null,
    price: document.querySelector("#corePrice_feature_div .a-offscreen, .a-price .a-offscreen")?.innerText ?? null,
    isFreshOffer: !!document.querySelector('[id*="freshAddToCart"], [id*="atfc-fresh"]'),
    addButton: r ? { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } : null,
  };
})();
