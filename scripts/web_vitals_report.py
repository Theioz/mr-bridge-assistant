#!/usr/bin/env python3
"""
Summarize real-user page-load metrics from public.web_vitals (#445).

Per route and metric: sample count, p50, p75 and the share rated "good", split into phone
(coarse pointer) and desktop. p75 is the figure Core Web Vitals is judged on. Compare it with the
targets below, which are Google's "good" thresholds, the same ones #445's 2500 ms LCP comes from.

Run:  python3 scripts/web_vitals_report.py [--days 14] [--min-samples 3]
Requires: supabase, python-dotenv
"""

from __future__ import annotations

import argparse
import math
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

GOOD = {"LCP": 2500, "INP": 200, "CLS": 0.1, "FCP": 1800, "TTFB": 800}
ORDER = ["LCP", "INP", "CLS", "FCP", "TTFB"]


def percentile(values: list[float], p: float) -> float:
    """Nearest-rank percentile; values must be non-empty."""
    s = sorted(values)
    k = max(0, min(len(s) - 1, math.ceil(p / 100 * len(s)) - 1))
    return s[k]


def fmt(metric: str, v: float) -> str:
    return f"{v:.3f}" if metric == "CLS" else f"{v:.0f}ms"


def main() -> int:
    ap = argparse.ArgumentParser(description="Summarize real-user web vitals per route.")
    ap.add_argument("--days", type=int, default=14)
    ap.add_argument("--min-samples", type=int, default=3, help="Hide groups with fewer samples.")
    args = ap.parse_args()

    # Imported here so the pure helpers above can be unit-tested without a database client.
    from _supabase import get_client, get_owner_user_id

    try:
        client = get_client()
        owner = get_owner_user_id()
        since = (datetime.now(timezone.utc) - timedelta(days=args.days)).isoformat()
        rows = []
        page = 0
        while True:
            chunk = (
                client.table("web_vitals")
                .select("metric,value,rating,route,mobile")
                .eq("user_id", owner)
                .gte("created_at", since)
                .range(page * 1000, page * 1000 + 999)
                .execute()
                .data
                or []
            )
            rows.extend(chunk)
            if len(chunk) < 1000:
                break
            page += 1
    except Exception as e:
        print(f"[vitals] query failed: {e}", file=sys.stderr)
        return 1

    if not rows:
        print(f"No web vitals recorded in the last {args.days} days.")
        return 0

    groups: dict[tuple[str, str, str], list[dict]] = defaultdict(list)
    for r in rows:
        device = "phone" if r.get("mobile") else "desktop"
        groups[(device, r["route"], r["metric"])].append(r)

    print(f"Real-user web vitals, last {args.days} days ({len(rows)} samples). Good = "
          + ", ".join(f"{m} <= {fmt(m, GOOD[m])}" for m in ORDER))
    for device in ("phone", "desktop"):
        keys = sorted({(r, m) for (d, r, m) in groups if d == device},
                      key=lambda k: (k[0], ORDER.index(k[1])))
        if not keys:
            continue
        print(f"\n## {device}")
        print(f"{'route':<24} {'metric':<6} {'n':>4} {'p50':>9} {'p75':>9} {'good':>6}")
        for route, metric in keys:
            g = groups[(device, route, metric)]
            if len(g) < args.min_samples:
                continue
            vals = [x["value"] for x in g]
            good = sum(1 for x in g if x.get("rating") == "good") / len(g)
            flag = "" if percentile(vals, 75) <= GOOD[metric] else "  <- over"
            print(f"{route:<24} {metric:<6} {len(g):>4} {fmt(metric, percentile(vals, 50)):>9} "
                  f"{fmt(metric, percentile(vals, 75)):>9} {good:>6.0%}{flag}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
