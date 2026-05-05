import { NextResponse } from "next/server";

const CRON_SECRET = process.env.CRON_SECRET;
const GITHUB_PAT = process.env.GITHUB_PAT;
const GITHUB_REPO = "Theioz/mr-bridge-assistant";
const WORKFLOW_FILE = "weekly-plan.yml";

function checkAuth(req: Request): boolean {
  const auth = req.headers.get("authorization");
  return !!(CRON_SECRET && auth === `Bearer ${CRON_SECRET}`);
}

export async function GET(req: Request) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!GITHUB_PAT) {
    return NextResponse.json({ error: "GITHUB_PAT not configured" }, { status: 500 });
  }

  const weekStart = new URL(req.url).searchParams.get("week_start") ?? "";

  const dispatchRes = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GITHUB_PAT}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main", inputs: { week_start: weekStart } }),
    },
  );

  if (!dispatchRes.ok) {
    const body = await dispatchRes.text();
    console.error("[weekly-plan] GitHub dispatch failed:", dispatchRes.status, body);
    return NextResponse.json(
      { error: `GitHub dispatch failed: ${dispatchRes.status}`, detail: body },
      { status: 502 },
    );
  }

  console.log("[weekly-plan] Dispatched weekly-plan.yml to GitHub Actions");
  return NextResponse.json(
    { ok: true, dispatched: true, week_start: weekStart || null },
    { status: 202 },
  );
}
