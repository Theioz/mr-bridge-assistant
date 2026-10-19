// Weekly scorecard arithmetic (lib/scorecard.ts) — the /weekly Scorecard panel.
// Run with: node --experimental-strip-types --test src/__tests__/scorecard.test.ts
// (from the web/ directory)
//
// WHY THIS EXISTS
//
// Every number on the scorecard is a plausible-looking integer when it is wrong: a dry-day count
// that treats an unlogged day as a drinking day, an alcohol share computed over a half-logged
// week, a landing date projected off two readings. None of those fail loudly. The cases mirror
// tests/test_scorecard.py one for one, so the page and the Sunday push agree. Values are synthetic.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { computeScorecard, type Scorecard } from "../lib/scorecard.ts";

const TODAY = "2026-10-25";

/** i days before TODAY, ISO. */
function day(i: number): string {
  const d = new Date(`${TODAY}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - i);
  return d.toISOString().slice(0, 10);
}

function card(kw: Partial<Parameters<typeof computeScorecard>[0]> = {}): Scorecard {
  return computeScorecard({
    today: TODAY,
    profile: {},
    fitness: [],
    sessions: [],
    recovery: [],
    meals: [],
    plans: [],
    ...kw,
  });
}

const near = (a: number | null, b: number) =>
  assert.ok(a != null && Math.abs(a - b) < 1e-9, `${a} != ${b}`);

describe("weight", () => {
  it("week means and delta", () => {
    const fitness = [
      ...Array.from({ length: 7 }, (_, i) => ({ date: day(i), weight_lb: 150 })),
      ...Array.from({ length: 7 }, (_, i) => ({ date: day(i + 7), weight_lb: 151 })),
    ];
    const c = card({ fitness });
    near(c.weight7, 150);
    near(c.delta, -1);
  });

  it("ignores null readings", () => {
    const c = card({
      fitness: [
        { date: day(0), weight_lb: null },
        { date: day(1), weight_lb: 150 },
      ],
    });
    near(c.weight7, 150);
  });

  it("excluded weigh-in dates drop out", () => {
    const fitness = [
      { date: day(0), weight_lb: 154 },
      { date: day(1), weight_lb: 150 },
    ];
    near(card({ fitness, excludedWeighIns: new Set([TODAY]) }).weight7, 150);
  });

  it("trajectory line", () => {
    const profile = {
      phase_start_date: day(14),
      phase_start_weight: "154",
      target_rate_lb_wk: "0.75",
    };
    near(card({ profile }).expected, 152.5);
    assert.equal(card({ profile: { phase_start_date: day(14) } }).expected, null);
  });

  it("landing needs six readings and a downtrend", () => {
    const profile = { weight_goal_lbs: "141" };
    const few = Array.from({ length: 5 }, (_, i) => ({ date: day(i), weight_lb: 150 + i * 0.1 }));
    assert.equal(card({ profile, fitness: few }).landing, null);
    const up = Array.from({ length: 10 }, (_, i) => ({ date: day(i), weight_lb: 150 - i * 0.1 }));
    assert.equal(card({ profile, fitness: up }).landing, null);
    // Losing 0.1 lb/day from ~150: ~9 lb to go is ~90 days out.
    const down = Array.from({ length: 28 }, (_, i) => ({ date: day(i), weight_lb: 150 + i * 0.1 }));
    const landing = card({ profile, fitness: down }).landing;
    assert.ok(landing);
    const days = Math.round((Date.parse(landing) - Date.parse(TODAY)) / 86_400_000);
    assert.ok(days >= 80 && days <= 100, `${days}`);
  });
});

describe("alcohol", () => {
  it("unlogged days count as dry", () => {
    const c = card({
      meals: [{ date: day(1), calories: 600, protein_g: 0, standard_drinks: 5.7 }],
    });
    assert.equal(c.drinkingDays, 1);
    assert.equal(c.dryDays, 6);
    assert.equal(c.drinks, 5.7);
    assert.equal(c.alcoholKcal, 600);
  });

  it("max day sums same-day rows", () => {
    const meals = [
      { date: day(1), calories: null, protein_g: null, standard_drinks: 2 },
      { date: day(1), calories: null, protein_g: null, standard_drinks: 2.5 },
    ];
    assert.equal(card({ meals }).maxDay, 4.5);
  });

  it("breaches only for limits that are set", () => {
    const meals = Array.from({ length: 5 }, (_, i) => ({
      date: day(i),
      calories: null,
      protein_g: null,
      standard_drinks: 3,
    }));
    assert.deepEqual(card({ meals }).breaches, []);
    const profile = {
      alcohol_weekly_cap: "10",
      alcohol_dry_days_min: "4",
      alcohol_max_per_occasion: "3",
    };
    assert.deepEqual(card({ profile, meals }).breaches, ["weekly cap", "dry days"]);
  });

  it("share needs five logged days", () => {
    const profile = { tdee_estimate: "2350" };
    const food = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ date: day(i), calories: 1800, protein_g: 0 }));
    const drink = [{ date: day(0), calories: 700, protein_g: 0, standard_drinks: 5.7 }];
    assert.equal(card({ profile, meals: [...food(4), ...drink] }).alcoholSharePct, null);
    // deficit = 7×2350 − 5×1800 = 7450; 700 / 7450 = 9.4%
    near(card({ profile, meals: [...food(5), ...drink] }).alcoholSharePct, (700 / 7450) * 100);
  });
});

describe("counts", () => {
  it("steps days use the max row per date", () => {
    const recovery = [
      { date: day(0), steps: 12000 },
      { date: day(0), steps: 0 },
      { date: day(1), steps: 9000 },
    ];
    assert.equal(card({ recovery }).stepsDays, 1);
  });

  it("sessions are distinct days in the window", () => {
    const sessions = [{ performed_on: day(0) }, { performed_on: day(0) }, { performed_on: day(9) }];
    const c = card({ sessions });
    assert.equal(c.sessions, 1);
    assert.equal(c.sessionsTarget, 3);
  });

  it("delivery and cheat", () => {
    const meals = [{ date: day(2), calories: 1100, protein_g: 0, origin: "delivery" }];
    const plans = [
      { date: day(3), is_cheat: true },
      { date: day(20), is_cheat: true },
    ];
    const c = card({ meals, plans });
    assert.deepEqual([c.deliveryN, c.deliveryKcal, c.cheatMeals], [1, 1100, 1]);
  });

  it("food averages are over logged days only", () => {
    const meals = [
      { date: day(0), calories: 1000, protein_g: 50 },
      { date: day(0), calories: 1000, protein_g: 50 },
      { date: day(2), calories: 1000, protein_g: 100 },
    ];
    const c = card({ meals });
    assert.equal(c.daysLogged, 2);
    near(c.avgKcal, 1500);
    near(c.avgProtein, 100);
  });
});
