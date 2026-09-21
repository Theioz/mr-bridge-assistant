// Layout regression check for the task row — run by hand, not in CI.
//
//   cd web && node smoke/layout/measure-task-row.mjs
//
// Needs a headless Chromium with system libs present (libnspr4, libnss3, libasound2t64).
// It is NOT part of `npm run smoke`: that suite boots the app and needs test-account creds,
// and this needs neither — it renders the row's flex structure standalone via setContent.
//
// WHY THIS EXISTS
//
// The task row was fixed twice for the same symptom. On 2026-09-21 the title column collapsed
// and wrapped one character per line on a phone. The first fix (#734) gave the title `flex: 1`
// so it would win against the chips INSIDE its own group — and it did, which is why tasks with
// no due date and no series rendered correctly and looked fixed.
//
// It was not fixed. The due-date and recurring-series chips are NOT in that group; they are
// direct children of the row, and every chip and button in the row is flex-shrink-0. The title
// group is the only flexible child, so it absorbs the row's entire shortfall. On the reported
// row — "Dose the aquarium with fertilizer", overdue + "every Sunday" + three buttons — that
// measured a title 0px wide, 24 lines tall, in a 464px row.
//
// The lesson is why this is committed rather than thrown away: the first fix was verified by
// reading the code and reasoning about flexbox, and the reasoning was locally right and
// globally wrong. Flex shortfall is arithmetic over the WHOLE row. Measure it.

import { chromium } from "@playwright/test";

// Reproduces the task row's flex structure exactly as task-item.tsx renders it, for the
// "Dose the aquarium with fertilizer" row that still broke: overdue chip + recurring-series
// chip + 3 buttons, all flex-shrink-0.
const row = (groupStyle, rowStyle) => `
<div style="width:100%;font-family:system-ui;font-size:14px">
 <div class="row" style="display:flex;align-items:center;${rowStyle}">
  <button style="width:44px;height:44px;flex-shrink:0"></button>
  <span style="width:6px;height:6px;flex-shrink:0"></span>
  <div class="grp" style="display:flex;align-items:center;gap:8px;flex:1 1 0%;min-width:0;${groupStyle}">
    <span class="title" style="flex:1 1 auto;min-width:0;overflow-wrap:break-word">Dose the aquarium with fertilizer</span>
  </div>
  <span style="flex-shrink:0;font-size:11px">1d overdue</span>
  <span style="flex-shrink:0;font-size:11px">&#8646; every Sunday</span>
  <button style="width:32px;height:32px;flex-shrink:0"></button>
  <button style="width:32px;height:32px;flex-shrink:0"></button>
  <button style="width:32px;height:32px;flex-shrink:0"></button>
 </div>
</div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 800 } });

async function measure(label, groupStyle, rowStyle) {
  await page.setContent(row(groupStyle, rowStyle));
  const r = await page.evaluate(() => {
    const t = document.querySelector(".title").getBoundingClientRect();
    const g = document.querySelector(".grp").getBoundingClientRect();
    const rows = document.querySelector(".row").getBoundingClientRect();
    return {
      title: +t.width.toFixed(1),
      titleH: +t.height.toFixed(1),
      grp: +g.width.toFixed(1),
      rowH: +rows.height.toFixed(1),
    };
  });
  // ~7.5px per char at 14px system-ui; under ~2 chars/line is the reported bug.
  const charsPerLine = (r.title / 7.5).toFixed(1);
  console.log(
    `${label.padEnd(34)} title=${String(r.title).padStart(6)}px  (~${String(charsPerLine).padStart(4)} chars/line)  lines=${(r.titleH / 19).toFixed(0).padStart(2)}  rowH=${r.rowH}`,
  );
  return r;
}

console.log("viewport 390px — the row from the screenshot\n");
await measure("BEFORE (shipped in #734)", "", "gap:12px");
const after = await measure(
  "AFTER  (flex-wrap + floor)",
  "min-width:min(60%,14rem);",
  "column-gap:12px;row-gap:4px;flex-wrap:wrap",
);

// Desktop must be untouched.
await page.setViewportSize({ width: 1280, height: 800 });
const wide = await measure(
  "AFTER @1280px (desktop)",
  "min-width:min(60%,14rem);",
  "column-gap:12px;row-gap:4px;flex-wrap:wrap",
);

await browser.close();
const ok = after.title >= 180 && wide.rowH <= 48;
console.log(
  `\n${ok ? "PASS" : "FAIL"}  mobile title >=180px: ${after.title >= 180}  |  desktop still one line: ${wide.rowH <= 48}`,
);
process.exit(ok ? 0 : 1);
