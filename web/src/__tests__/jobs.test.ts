// Jobs page/route logic (lib/jobs/jobs.ts): feedback and tracker validation, the manual-add row,
// query-string filters, the header summary and the report markdown parser.
// Run with: node --experimental-strip-types --test src/__tests__/jobs.test.ts
// (from the web/ directory)

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  daysBefore,
  feedbackStatus,
  feedbackUpdate,
  inline,
  newJob,
  NOTE_MAX,
  parseFilters,
  parseMarkdown,
  trackerPatch,
  trackerSummary,
  weekStart,
  type Block,
} from "../lib/jobs/jobs.ts";

const NOW = "2026-10-28T16:00:00.000Z";
const TODAY = "2026-10-28"; // a Wednesday
const NONE = { date_applied: null, date_rejected: null };

describe("feedbackUpdate", () => {
  it("sets feedback, note and time, and re-queues the row for the agent", () => {
    assert.deepEqual(feedbackUpdate({ feedback: "want", note: "  love GPU capacity work " }, NOW), {
      feedback: "want",
      feedback_note: "love GPU capacity work",
      feedback_at: NOW,
      feedback_sent_at: null,
      processed_at: null,
    });
  });

  it("null clears feedback and its note", () => {
    const u = feedbackUpdate({ feedback: null, note: "ignored" }, NOW);
    assert.equal(u.feedback, null);
    assert.equal(u.feedback_note, null);
    assert.equal(u.feedback_at, null);
  });

  it("caps long notes and rejects unknown feedback or a missing key", () => {
    assert.equal(
      feedbackUpdate({ feedback: "want", note: "x".repeat(5000) }, NOW).feedback_note!.length,
      NOTE_MAX,
    );
    assert.throws(() => feedbackUpdate({ feedback: "love" }, NOW), /feedback must be/);
    assert.throws(() => feedbackUpdate({ note: "x" }, NOW), /required/);
    assert.throws(() => feedbackUpdate([], NOW), /JSON object/);
  });
});

describe("trackerPatch", () => {
  it("moving to applied stamps today when no date is set", () => {
    assert.deepEqual(trackerPatch({ status: "applied" }, NONE, TODAY), {
      status: "applied",
      date_applied: TODAY,
    });
  });

  it("keeps an existing or explicit date", () => {
    assert.deepEqual(
      trackerPatch(
        { status: "applied" },
        { date_applied: "2026-10-01", date_rejected: null },
        TODAY,
      ),
      { status: "applied" },
    );
    assert.deepEqual(
      trackerPatch({ status: "rejected", date_rejected: "2026-10-20" }, NONE, TODAY),
      {
        status: "rejected",
        date_rejected: "2026-10-20",
      },
    );
    assert.equal(trackerPatch({ status: "rejected" }, NONE, TODAY).date_rejected, TODAY);
  });

  it("null status removes from the tracker without stamping dates", () => {
    assert.deepEqual(trackerPatch({ status: null }, NONE, TODAY), { status: null });
  });

  it("trims text, blanks to null, and validates fit, url and dates", () => {
    assert.deepEqual(trackerPatch({ fit: "high", level: "  Staff TPM ", notes: "" }, NONE, TODAY), {
      fit: "high",
      level: "Staff TPM",
      notes: null,
    });
    assert.equal(
      trackerPatch({ url: "https://x.com/jobs/1/" }, NONE, TODAY).url,
      "https://x.com/jobs/1",
    );
    assert.equal(
      trackerPatch({ notion_page_url: "https://www.notion.so/x" }, NONE, TODAY).notion_page_url,
      "https://www.notion.so/x",
    );
    assert.throws(
      () => trackerPatch({ notion_page_url: "notion://x" }, NONE, TODAY),
      /notion_page_url must start/,
    );
    assert.throws(() => trackerPatch({ fit: "great" }, NONE, TODAY), /fit must be/);
    assert.throws(() => trackerPatch({ status: "ghosted" }, NONE, TODAY), /status must be/);
    assert.throws(() => trackerPatch({ url: "javascript:alert(1)" }, NONE, TODAY), /http/);
    assert.throws(() => trackerPatch({ date_applied: "10/28/2026" }, NONE, TODAY), /YYYY-MM-DD/);
    assert.throws(() => trackerPatch({ company: "  " }, NONE, TODAY), /cannot be blank/);
    assert.throws(() => trackerPatch({}, NONE, TODAY), /Nothing to update/);
  });
});

describe("newJob", () => {
  it("defaults to To apply, marks the source manual", () => {
    assert.deepEqual(newJob({ company: "Acme", title: "Senior TPM" }, TODAY), {
      status: "to_apply",
      company: "Acme",
      title: "Senior TPM",
      source: "manual",
    });
  });

  it("an applied add gets today's date; company and title are required", () => {
    assert.equal(
      newJob({ company: "Acme", title: "TPM", status: "applied" }, TODAY).date_applied,
      TODAY,
    );
    assert.throws(() => newJob({ title: "TPM" }, TODAY), /company cannot be blank/);
    assert.throws(() => newJob({ company: "Acme" }, TODAY), /title cannot be blank/);
  });
});

describe("parseFilters", () => {
  it("reads known values and drops unknown or malformed ones", () => {
    assert.deepEqual(
      parseFilters({ stage: "pay", company: "Acme", q: " tpm ", all: "1", report: "2026-10-27" }),
      {
        stage: "pay",
        company: "Acme",
        q: "tpm",
        showStale: true,
        feedbackOnly: false,
        report: "2026-10-27",
      },
    );
    const f = parseFilters({ stage: "recommended", report: "yesterday", fb: ["1", "0"] });
    assert.equal(f.stage, null);
    assert.equal(f.report, null);
    assert.equal(f.feedbackOnly, true);
  });
});

describe("dates and the header summary", () => {
  it("daysBefore and weekStart (Monday)", () => {
    assert.equal(daysBefore("2026-03-01", 1), "2026-02-28");
    assert.equal(weekStart(TODAY), "2026-10-26");
    assert.equal(weekStart("2026-10-26"), "2026-10-26");
    assert.equal(weekStart("2026-11-01"), "2026-10-26"); // Sunday
  });

  it("counts applications since Monday and open statuses only", () => {
    const s = trackerSummary(
      [
        { status: "applied", date_applied: "2026-10-26" },
        { status: "interviewing", date_applied: "2026-10-27" },
        { status: "applied", date_applied: "2026-10-25" }, // last week
        { status: "rejected", date_applied: "2026-10-27" },
        { status: "to_apply", date_applied: null },
        { status: "closed", date_applied: null },
      ],
      TODAY,
    );
    assert.equal(s.appliedThisWeek, 3);
    assert.equal(s.target, 8);
    assert.deepEqual(s.open, { applied: 2, interviewing: 1, to_apply: 1 });
  });
});

describe("feedbackStatus", () => {
  it("tracks where feedback is with the agent", () => {
    const base = { feedback: null, processed_at: null, status: null };
    assert.equal(feedbackStatus(base), null);
    assert.equal(feedbackStatus({ ...base, feedback: "want" }), "Queued for tomorrow's run");
    assert.equal(
      feedbackStatus({ feedback: "want", processed_at: NOW, status: "to_apply" }),
      "Added to tracker",
    );
    assert.equal(
      feedbackStatus({ feedback: "not_for_me", processed_at: NOW, status: null }),
      "Noted",
    );
  });
});

describe("parseMarkdown", () => {
  it("parses headings, paragraphs, lists and tables", () => {
    const blocks = parseMarkdown(
      "# Job Scout 2026-10-28\n\nTwo new roles.\nSecond line.\n\n- **Acme** TPM\n- Beta PM\n\n| Co | Score |\n|---|---|\n| Acme | 8 |\n",
    );
    assert.deepEqual(
      blocks.map((b) => b.type),
      ["h1", "p", "ul", "table"],
    );
    assert.deepEqual(blocks[1], {
      type: "p",
      inl: [{ t: "text", s: "Two new roles. Second line." }],
    });
    const ul = blocks[2] as Extract<Block, { type: "ul" }>;
    assert.deepEqual(ul.items[0], {
      depth: 0,
      inl: [
        { t: "b", s: "Acme" },
        { t: "text", s: " TPM" },
      ],
    });
    const table = blocks[3] as Extract<Block, { type: "table" }>;
    assert.equal(table.head.length, 2);
    assert.deepEqual(table.rows, [[[{ t: "text", s: "Acme" }], [{ t: "text", s: "8" }]]]);
  });

  it("--- is a rule and indented items nest", () => {
    const blocks = parseMarkdown("Intro\n\n---\n- top\n  - nested\n    - deeper\n- top again\n***");
    assert.deepEqual(
      blocks.map((b) => b.type),
      ["p", "hr", "ul", "hr"],
    );
    const ul = blocks[2] as Extract<Block, { type: "ul" }>;
    assert.deepEqual(
      ul.items.map((it) => it.depth),
      [0, 1, 2, 0],
    );
  });

  // The shape of the daily report (synthetic content): one ## heading per role, then a meta
  // line, a Posting link, bold sub-headings each followed directly by a list, and bold-led lines.
  it("parses a per-role report section", () => {
    const md = [
      "# Job Scout - 2026-10-27 (Tuesday)",
      "",
      "Checked 66 companies; 10 recommended.",
      "",
      "## 1. Acme - TPM Manager, Infrastructure",
      "Fit 8/10 (High) | Location: San Francisco | Pay: $200k-$250k base",
      "",
      "[Posting](https://jobs.example.com/acme/1)",
      "",
      "**Why it fits**",
      "- Capacity planning scope.",
      "- Cost visibility work.",
      "",
      "**Gaps / risks**",
      "- Manager title.",
      "",
      "**Lead story:** Datacenter capacity strategy.",
      "",
      "## 2. Beta - Senior TPM",
      "Fit 7/10 (Medium)",
      "",
      "## Filtered out today",
      "",
      "| Stage | Count |",
      "|---|---|",
      "| Prefiltered | 472 |",
    ].join("\n");
    const blocks = parseMarkdown(md);
    assert.deepEqual(
      blocks.map((b) => b.type),
      ["h1", "p", "h2", "p", "p", "p", "ul", "p", "ul", "p", "h2", "p", "h2", "table"],
    );
    assert.deepEqual((blocks[4] as { inl: unknown }).inl, [
      { t: "a", s: "Posting", href: "https://jobs.example.com/acme/1" },
    ]);
    assert.deepEqual((blocks[9] as { inl: unknown }).inl, [
      { t: "b", s: "Lead story:" },
      { t: "text", s: " Datacenter capacity strategy." },
    ]);
    assert.equal((blocks[6] as Extract<Block, { type: "ul" }>).items.length, 2);
  });

  it("only http(s) links become links; HTML stays text", () => {
    assert.deepEqual(inline("[a](https://x.com/j) and [b](javascript:alert(1)) <b>x</b>"), [
      { t: "a", s: "a", href: "https://x.com/j" },
      { t: "text", s: " and [b](javascript:alert(1)) <b>x</b>" },
    ]);
  });
});
