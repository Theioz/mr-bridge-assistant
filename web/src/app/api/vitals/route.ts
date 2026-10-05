import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Real-user page-load metrics (#445). Fed by components/web-vitals-reporter.tsx via sendBeacon.
// Best-effort by design: a dropped beacon costs one data point, never a user-visible error, so
// anything malformed is discarded rather than reported.

const METRICS = new Set(["LCP", "FCP", "CLS", "INP", "TTFB"]);
const RATINGS = new Set(["good", "needs-improvement", "poor"]);
const MAX_BATCH = 10;

interface Incoming {
  metric?: unknown;
  value?: unknown;
  rating?: unknown;
  route?: unknown;
  navType?: unknown;
  viewportW?: unknown;
  viewportH?: unknown;
  dpr?: unknown;
  effectiveType?: unknown;
  mobile?: unknown;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : null);

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse(null, { status: 401 });

  let body: unknown;
  try {
    // sendBeacon posts text/plain; parse the raw body either way.
    body = JSON.parse(await request.text());
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const items = (Array.isArray(body) ? body : [body]).slice(0, MAX_BATCH) as Incoming[];

  const rows = items
    .filter(
      (m) =>
        typeof m.metric === "string" &&
        METRICS.has(m.metric) &&
        num(m.value) !== null &&
        (num(m.value) as number) >= 0 &&
        typeof m.route === "string",
    )
    .map((m) => ({
      user_id: user.id,
      metric: m.metric as string,
      value: m.value as number,
      rating: typeof m.rating === "string" && RATINGS.has(m.rating) ? m.rating : null,
      route: str(m.route, 200) as string,
      nav_type: str(m.navType, 32),
      viewport_w: num(m.viewportW),
      viewport_h: num(m.viewportH),
      dpr: num(m.dpr),
      effective_type: str(m.effectiveType, 16),
      mobile: typeof m.mobile === "boolean" ? m.mobile : null,
    }));

  if (rows.length) {
    const { error } = await supabase.from("web_vitals").insert(rows);
    if (error) console.error("[vitals] insert failed:", error.message);
  }
  return new NextResponse(null, { status: 204 });
}
