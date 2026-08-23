import assert from "node:assert/strict";
import test from "node:test";

import { audit, RECIPE_AUDIT_SELECT } from "../lib/nutrition/recipe-audit.ts";

// The audit is now shared by the CLI and GET /api/cron/audit-recipes. These pin the behaviour that
// both callers depend on, so extracting it into a lib cannot quietly change what gets reported.

const recipe = (over: Record<string, unknown> = {}) => ({
  id: "r1",
  name: "Test Recipe",
  ingredients_json: null,
  steps_json: null,
  instructions: null,
  typical_portions: 1,
  calories: 500,
  macros_computed_at: "2026-08-23T00:00:00Z",
  metadata: null,
  ...over,
});

test("a clean recipe produces no findings", () => {
  assert.deepEqual(
    audit([
      recipe({
        ingredients_json: [
          { item: "dry brown rice, long-grain", quantity: 150, unit: "g", fdc_id: 169703 },
        ],
        steps_json: [{ step: 1, text: "MEDIUM-HIGH. Brown the chicken 6 min." }],
      }),
    ]),
    [],
  );
});

test("the two new invariants surface as audit findings", () => {
  const kinds = audit([
    recipe({
      ingredients_json: [
        { item: "Brown rice, long-grain, DRY", quantity: 150, unit: "g", fdc_id: 169703 },
        { item: "Gochujang", quantity: 60, unit: "g", fdc_id: 2113732 },
      ],
    }),
  ]).map((f) => f.kind);
  assert.ok(kinds.includes("rice-not-annotatable"));
  assert.ok(kinds.includes("gochujang-label"));
});

test("an undeclared batch is still caught", () => {
  const kinds = audit([recipe({ calories: 2800, typical_portions: 1 })]).map((f) => f.kind);
  assert.ok(kinds.includes("undeclared-batch"));
});

test("macros with no computed_at stamp are still caught", () => {
  const kinds = audit([recipe({ macros_computed_at: null })]).map((f) => f.kind);
  assert.ok(kinds.includes("unstamped-macros"));
});

test("a timed step with no heat setting is still caught", () => {
  const kinds = audit([
    recipe({ steps_json: [{ step: 1, text: "Simmer the sauce 40 min until thick." }] }),
  ]).map((f) => f.kind);
  assert.ok(kinds.includes("timed-step-no-heat"));
});

test("a timed step that names its heat is not flagged", () => {
  const kinds = audit([
    recipe({ steps_json: [{ step: 1, text: "MEDIUM-LOW. Simmer the sauce 40 min until thick." }] }),
  ]).map((f) => f.kind);
  assert.ok(!kinds.includes("timed-step-no-heat"));
});

test("the select list carries every column audit() reads", () => {
  for (const col of [
    "ingredients_json",
    "steps_json",
    "instructions",
    "typical_portions",
    "calories",
    "macros_computed_at",
    "metadata",
  ]) {
    assert.ok(RECIPE_AUDIT_SELECT.includes(col), `${col} missing from RECIPE_AUDIT_SELECT`);
  }
});
