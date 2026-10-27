// /jobs database-table helpers (lib/jobs/table.ts): view tabs, search, sort, short dates, pills.
// Run with: node --experimental-strip-types --test src/__tests__/jobs-table.test.ts
// (from the web/ directory)

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { STATUSES } from "../lib/jobs/jobs.ts";
import {
  inTab,
  searchRows,
  shortDate,
  sortRows,
  STATUS_TONE,
  statusRank,
  tabCounts,
} from "../lib/jobs/table.ts";

const rows = [
  { id: "1", status: "to_apply", title: "Senior TPM", company: "Acme", notes: null },
  { id: "2", status: "applied", title: "Staff PM", company: "Beta", notes: "referral from Sam" },
  { id: "3", status: "interviewing", title: "TPM II", company: "acme labs", notes: null },
  { id: "4", status: "offer", title: "TPM", company: "Gamma", notes: null },
  { id: "5", status: "rejected", title: "PM", company: "Delta", notes: null },
  { id: "6", status: "watching", title: "TPM", company: "Eps", notes: null },
  { id: "7", status: "closed", title: "TPM", company: "Zeta", notes: null },
] as const;

describe("tracker tabs", () => {
  it("counts every tab; Open excludes rejected/withdrawn/closed", () => {
    assert.deepEqual(tabCounts([...rows]), {
      open: 5,
      to_apply: 1,
      applied: 1,
      interviewing: 2,
      rejected: 1,
      all: 7,
    });
  });

  it("Interviewing covers recruiter screen through offer", () => {
    assert.deepEqual(
      inTab(
        [...rows, { id: "8", status: "recruiter_screen" }] as { id: string; status: never }[],
        "interviewing",
      ).map((r) => r.id),
      ["3", "4", "8"],
    );
  });
});

describe("searchRows", () => {
  it("matches every word across fields, case-insensitively", () => {
    const hit = (q: string) =>
      searchRows([...rows], q, ["title", "company", "notes"]).map((r) => r.id);
    assert.deepEqual(hit("acme"), ["1", "3"]);
    assert.deepEqual(hit("ACME tpm ii"), ["3"]);
    assert.deepEqual(hit("sam"), ["2"]);
    assert.equal(hit("  ").length, rows.length);
  });
});

describe("sortRows", () => {
  const data = [
    { id: "a", v: "beta" },
    { id: "b", v: null },
    { id: "c", v: "Alpha" },
    { id: "d", v: "" },
    { id: "e", v: "alpha" },
  ];
  it("sorts case-insensitively, stable, blanks last both ways", () => {
    assert.deepEqual(
      sortRows(data, (r) => r.v, "asc").map((r) => r.id),
      ["c", "e", "a", "b", "d"],
    );
    assert.deepEqual(
      sortRows(data, (r) => r.v, "desc").map((r) => r.id),
      ["a", "c", "e", "b", "d"],
    );
  });
  it("numbers compare numerically; status sorts in pipeline order", () => {
    const n = [{ v: 10 }, { v: 9 }, { v: null }, { v: 2 }];
    assert.deepEqual(
      sortRows(n, (r) => r.v, "asc").map((r) => r.v),
      [2, 9, 10, null],
    );
    assert.ok(statusRank("to_apply")! < statusRank("applied")!);
    assert.ok(statusRank("interviewing")! < statusRank("offer")!);
    assert.equal(statusRank(null), null);
  });
});

describe("shortDate", () => {
  it("drops the year only for this year", () => {
    assert.equal(shortDate("2026-10-27", "2026-10-28"), "Oct 27");
    assert.equal(shortDate("2025-01-03", "2026-10-28"), "Jan 3, 2025");
    assert.equal(shortDate(null, "2026-10-28"), "");
    assert.equal(shortDate("soon", "2026-10-28"), "");
  });
});

describe("pill tones", () => {
  it("every status has a tone", () => {
    for (const s of STATUSES) assert.ok(STATUS_TONE[s], s);
    assert.equal(STATUS_TONE.applied, "yellow");
    assert.equal(STATUS_TONE.interviewing, "purple");
  });
});
