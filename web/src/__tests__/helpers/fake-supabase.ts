// In-memory fake of the supabase-js query builder, for contract tests that must not touch a
// real database (#761).
//
// It implements the subset of PostgREST semantics the code under test uses — enough to run
// the real query chains end to end and assert on the resulting table state:
//
//   from(t).select(cols) / insert(rows) / update(patch) / upsert(rows, { onConflict }) / delete()
//   filters: eq neq gt gte lt lte in is not ilike
//   modifiers: order limit single maybeSingle, and .select() after a write to return rows
//
// Every chain is a thenable resolving to `{ data, error }`, like supabase-js. Columns may be
// JSON paths with `->` (e.g. `metadata->plex_progress`). Anything outside this subset throws
// loudly rather than silently returning the wrong rows.
//
// Not a test file: the runner glob is src/__tests__/*.test.ts, so helpers/ is never run.

import type { SupabaseClient } from "@supabase/supabase-js";

export type Row = Record<string, unknown>;
type DbError = { message: string };
type Result = { data: unknown; error: DbError | null };
type Op = "select" | "insert" | "update" | "upsert" | "delete";

type Filter = (row: Row) => boolean;

export interface FakeCall {
  table: string;
  op: Op;
  payload?: unknown;
  /** The write's options, e.g. `{ onConflict }` — the conflict target is part of the contract. */
  options?: { onConflict?: string };
}

let idCounter = 0;

/** Read a column, following `a->b->c` JSON paths. */
function col(row: Row, column: string): unknown {
  const parts = column.split("->").map((p) => p.trim());
  let v: unknown = row;
  for (const p of parts) {
    if (v === null || v === undefined || typeof v !== "object") return undefined;
    v = (v as Row)[p];
  }
  return v;
}

function cmp(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  return (a as number | string) < (b as number | string) ? -1 : 1;
}

function isMatch(value: unknown, expected: unknown): boolean {
  if (expected === null) return value === null || value === undefined;
  return value === expected;
}

/** Project `"a, b, c"` onto a row. Embedded selects (`cooks(name)`) and `*` return the row. */
function project(row: Row, columns: string | undefined): Row {
  if (!columns || columns.trim() === "*") return { ...row };
  const names = columns.split(",").map((c) => c.trim());
  if (names.some((n) => !/^[a-z_][a-z0-9_]*$/i.test(n))) return { ...row };
  const out: Row = {};
  for (const n of names) out[n] = row[n] ?? null;
  return out;
}

class Query implements PromiseLike<Result> {
  private filters: Filter[] = [];
  private orders: { column: string; ascending: boolean }[] = [];
  private limitN: number | null = null;
  private mode: "many" | "single" | "maybeSingle" = "many";
  private returning = false;
  private columns: string | undefined;

  private db: FakeSupabase;
  private table: string;
  private op: Op;
  private payload?: unknown;
  private options?: { onConflict?: string };

  // No parameter properties: node's type-stripping runner rejects them.
  constructor(
    db: FakeSupabase,
    table: string,
    op: Op,
    payload?: unknown,
    options?: { onConflict?: string },
  ) {
    this.db = db;
    this.table = table;
    this.op = op;
    this.payload = payload;
    this.options = options;
  }

  select(columns?: string) {
    if (this.op !== "select") this.returning = true;
    this.columns = columns;
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push((r) => col(r, column) === value);
    return this;
  }
  neq(column: string, value: unknown) {
    this.filters.push((r) => col(r, column) !== value);
    return this;
  }
  gt(column: string, value: unknown) {
    this.filters.push((r) => col(r, column) != null && cmp(col(r, column), value) > 0);
    return this;
  }
  gte(column: string, value: unknown) {
    this.filters.push((r) => col(r, column) != null && cmp(col(r, column), value) >= 0);
    return this;
  }
  lt(column: string, value: unknown) {
    this.filters.push((r) => col(r, column) != null && cmp(col(r, column), value) < 0);
    return this;
  }
  lte(column: string, value: unknown) {
    this.filters.push((r) => col(r, column) != null && cmp(col(r, column), value) <= 0);
    return this;
  }
  /** PostgREST ilike: case-insensitive, `%` = any run, `_` = one character. */
  ilike(column: string, pattern: string) {
    const re = new RegExp(
      "^" +
        pattern
          .split("")
          .map((ch) =>
            ch === "%" ? ".*" : ch === "_" ? "." : ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          )
          .join("") +
        "$",
      "i",
    );
    this.filters.push(
      (r) => typeof col(r, column) === "string" && re.test(col(r, column) as string),
    );
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push((r) => values.includes(col(r, column)));
    return this;
  }
  is(column: string, value: null | boolean) {
    this.filters.push((r) => isMatch(col(r, column), value));
    return this;
  }
  not(column: string, operator: string, value: unknown) {
    if (operator === "is") this.filters.push((r) => !isMatch(col(r, column), value));
    else if (operator === "eq") this.filters.push((r) => col(r, column) !== value);
    else throw new Error(`fake-supabase: not(..., "${operator}") is not implemented`);
    return this;
  }
  order(column: string, opts: { ascending?: boolean } = {}) {
    this.orders.push({ column, ascending: opts.ascending ?? true });
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  single() {
    this.mode = "single";
    return this;
  }
  maybeSingle() {
    this.mode = "maybeSingle";
    return this;
  }

  then<A = Result, B = never>(
    onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve()
      .then(() => this.run())
      .then(onfulfilled, onrejected);
  }

  private matches(row: Row) {
    return this.filters.every((f) => f(row));
  }

  private run(): Result {
    this.db.calls.push({
      table: this.table,
      op: this.op,
      payload: this.payload,
      ...(this.options ? { options: this.options } : {}),
    });
    const injected = this.db.failures.get(`${this.table}:${this.op}`);
    if (injected) return { data: null, error: { message: injected } };

    const rows = this.db.table(this.table);
    let affected: Row[];

    switch (this.op) {
      case "select":
        affected = rows.filter((r) => this.matches(r));
        break;
      case "insert": {
        const input = Array.isArray(this.payload) ? this.payload : [this.payload];
        affected = (input as Row[]).map((r) => ({ id: `fake-${++idCounter}`, ...r }));
        rows.push(...affected);
        break;
      }
      case "upsert": {
        const input = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Row[];
        const keys = (this.options?.onConflict ?? "id").split(",").map((k) => k.trim());
        affected = input.map((r) => {
          const existing = rows.find((e) => keys.every((k) => e[k] === r[k]));
          if (existing) return Object.assign(existing, r);
          const created = { id: `fake-${++idCounter}`, ...r };
          rows.push(created);
          return created;
        });
        break;
      }
      case "update":
        affected = rows.filter((r) => this.matches(r));
        for (const r of affected) Object.assign(r, this.payload as Row);
        break;
      case "delete":
        affected = rows.filter((r) => this.matches(r));
        this.db.tables.set(
          this.table,
          rows.filter((r) => !affected.includes(r)),
        );
        break;
    }

    if (this.op !== "select" && !this.returning) return { data: null, error: null };

    for (const o of [...this.orders].reverse()) {
      affected = [...affected].sort(
        (a, b) => cmp(col(a, o.column), col(b, o.column)) * (o.ascending ? 1 : -1),
      );
    }
    if (this.limitN !== null) affected = affected.slice(0, this.limitN);
    const data = affected.map((r) => project(r, this.columns));

    if (this.mode === "many") return { data, error: null };
    if (data.length > 1) {
      return { data: null, error: { message: "JSON object requested, multiple rows returned" } };
    }
    if (data.length === 0) {
      return this.mode === "single"
        ? { data: null, error: { message: "JSON object requested, 0 rows returned" } }
        : { data: null, error: null };
    }
    return { data: data[0], error: null };
  }
}

export class FakeSupabase {
  tables = new Map<string, Row[]>();
  calls: FakeCall[] = [];
  /** `table:op` → error message returned instead of running the query. */
  failures = new Map<string, string>();

  constructor(seed: Record<string, Row[]> = {}) {
    for (const [t, rows] of Object.entries(seed)) {
      this.tables.set(
        t,
        rows.map((r) => structuredClone(r)),
      );
    }
  }

  table(name: string): Row[] {
    if (!this.tables.has(name)) this.tables.set(name, []);
    return this.tables.get(name)!;
  }

  from(table: string) {
    return {
      select: (columns?: string) => new Query(this, table, "select").select(columns),
      insert: (rows: Row | Row[]) => new Query(this, table, "insert", rows),
      update: (patch: Row) => new Query(this, table, "update", patch),
      upsert: (rows: Row | Row[], options?: { onConflict?: string }) =>
        new Query(this, table, "upsert", rows, options),
      delete: () => new Query(this, table, "delete"),
    };
  }

  /** The fake typed as the real client, for passing to code under test. */
  get client(): SupabaseClient {
    return this as unknown as SupabaseClient;
  }
}
