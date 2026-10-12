// Run on https://www.amazon.com/cart/localmarket?almBrandId=QW1hem9uIEZyZXNo — READ-ONLY.
// The Fresh cart is the ONLY source of truth for what was added. Never infer from clicks.
(() => {
  const rows = [...document.querySelectorAll('[data-asin][data-itemtype="active"]')];
  const seen = new Map();
  for (const r of rows) {
    if (seen.has(r.dataset.asin)) continue;
    seen.set(r.dataset.asin, {
      asin: r.dataset.asin,
      qty: Number(r.dataset.quantity),
      price: r.dataset.price ? Number(r.dataset.price) : null,
      title: (r.dataset.producttitle || "").slice(0, 100),
      outOfStock: r.dataset.outofstock === "1" || r.dataset.outofstock === "true",
    });
  }
  return {
    isFreshCart: /amazon fresh shopping cart/i.test(document.title),
    items: [...seen.values()],
    subtotal: document.querySelector("#sc-subtotal-amount-activecart")?.innerText?.trim() ?? null,
  };
})();
