// Run on https://www.amazon.com/s?k=<query>&i=amazonfresh — READ-ONLY.
// `addable` is false when the result has no add button (not deliverable by Fresh): never
// offer those as choices.
(() => {
  const text = document.body.innerText;
  const results = [...document.querySelectorAll('div[data-component-type="s-search-result"]')]
    .slice(0, 12)
    .map((el) => ({
      asin: el.dataset.asin,
      title: el.querySelector("h2")?.innerText?.trim()?.slice(0, 110),
      price: el.querySelector(".a-price .a-offscreen")?.innerText ?? null,
      addable: [...el.querySelectorAll("button, input[type=submit]")].some((b) =>
        /add to cart/i.test(b.getAttribute("aria-label") || b.innerText || b.value || ""),
      ),
    }))
    .filter((r) => r.asin);
  return {
    noResults: /no results for/i.test(text),
    freshUnavailable: /amazon fresh is not available for this location/i.test(text),
    results,
  };
})();
