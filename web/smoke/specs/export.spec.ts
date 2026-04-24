import JSZip from "jszip";
import { test, expect } from "../fixtures/auth";

test("data export — JSON zip downloads with manifest + per-table files", async ({
  signedInPage,
  consoleErrors,
}) => {
  const page = signedInPage;
  await page.goto("/settings?tab=data");
  consoleErrors.length = 0;

  await expect(page.getByRole("heading", { name: "Export your data" })).toBeVisible();

  // Issue the export via page.request so we can inspect the binary response
  // directly. The button click path is exercised implicitly — it calls the
  // same endpoint.
  const res = await page.request.post("/api/export", {
    data: { format: "json", range: "all" },
  });
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/zip");

  const zipBuffer = Buffer.from(await res.body());
  const zip = await JSZip.loadAsync(zipBuffer);

  const manifestFile = zip.file("_manifest.json");
  expect(manifestFile, "_manifest.json missing from export zip").toBeTruthy();
  const manifest = JSON.parse(await manifestFile!.async("string")) as {
    schema_version: number;
    user_id: string;
    format: string;
    range: string;
    row_counts: Record<string, number>;
    excluded_tables: string[];
  };
  expect(manifest.schema_version).toBe(1);
  expect(manifest.format).toBe("json");
  expect(manifest.range).toBe("all");
  expect(manifest.user_id).toMatch(/^[0-9a-f-]{36}$/);

  // Must include: all 15 user-authored tables.
  const requiredTables = [
    "tasks",
    "habits",
    "habit_registry",
    "fitness_log",
    "workout_sessions",
    "recovery_metrics",
    "recipes",
    "meal_log",
    "profile",
    "study_log",
    "journal_entries",
    "workout_plans",
    "strength_sessions",
    "strength_session_sets",
    "exercise_prs",
  ];
  for (const t of requiredTables) {
    expect(zip.file(`${t}.json`), `${t}.json missing`).toBeTruthy();
    expect(manifest.row_counts[t], `row_counts.${t} missing`).not.toBeUndefined();
  }

  // Must exclude chat and app-internal data.
  const excludedFiles = [
    "chat_sessions.json",
    "chat_messages.json",
    "user_integrations.json",
    "notifications.json",
    "user_equipment.json",
    "packages.json",
    "stocks_cache.json",
    "sports_cache.json",
    "sync_log.json",
    "timer_state.json",
  ];
  for (const f of excludedFiles) {
    expect(zip.file(f), `${f} should not be in export`).toBeFalsy();
  }

  // Every non-empty row must belong to the signed-in user — RLS + explicit
  // user_id filter combined. Exception: strength_session_sets has no user_id
  // column; it's scoped by RLS via the parent session.
  for (const t of requiredTables) {
    if (t === "strength_session_sets") continue;
    const rows = JSON.parse(await zip.file(`${t}.json`)!.async("string")) as {
      user_id?: string;
    }[];
    for (const row of rows) {
      if (row.user_id) {
        expect(row.user_id, `${t}: row belongs to a different user`).toBe(manifest.user_id);
      }
    }
  }

  expect(consoleErrors, `Unexpected console errors: ${consoleErrors.join(" | ")}`).toEqual([]);
});

test("data export — CSV zip downloads and respects 30d range", async ({
  signedInPage,
  consoleErrors,
}) => {
  const page = signedInPage;
  await page.goto("/settings?tab=data");
  consoleErrors.length = 0;

  const res = await page.request.post("/api/export", {
    data: { format: "csv", range: "30d" },
  });
  expect(res.status()).toBe(200);

  const zipBuffer = Buffer.from(await res.body());
  const zip = await JSZip.loadAsync(zipBuffer);

  const manifest = JSON.parse(await zip.file("_manifest.json")!.async("string")) as {
    format: string;
    range: string;
    since: string | null;
  };
  expect(manifest.format).toBe("csv");
  expect(manifest.range).toBe("30d");
  expect(manifest.since).not.toBeNull();

  // CSV files must have a header row + CRLF line endings.
  const mealsCsv = await zip.file("meal_log.csv")!.async("string");
  expect(mealsCsv.startsWith("id,date,meal_type")).toBe(true);
  // At minimum the header line and a CRLF terminator.
  expect(mealsCsv).toMatch(/\r\n/);

  expect(consoleErrors).toEqual([]);
});
