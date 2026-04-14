import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker")?.toUpperCase();
  if (!ticker) {
    return NextResponse.json({ valid: false, error: "Missing ticker" }, { status: 400 });
  }

  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    // No key — skip validation, allow the add
    return NextResponse.json({ valid: true });
  }

  const url = `https://api.polygon.io/v3/reference/tickers?ticker=${ticker}&apiKey=${apiKey}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    return NextResponse.json({ valid: false, error: `Polygon returned ${res.status}` }, { status: 502 });
  }

  const json = await res.json() as { count?: number };
  return NextResponse.json({ valid: (json.count ?? 0) > 0 });
}
