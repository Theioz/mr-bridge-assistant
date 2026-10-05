"use client";

import { useReportWebVitals } from "next/web-vitals";
import { vitalsRoute } from "@/lib/web-vitals-route";

// Real-user page-load metrics (#445): what the app actually feels like on the phone it is
// used from, as opposed to Lighthouse's simulated mid-range phone on slow 4G. Rows land in
// public.web_vitals; scripts/web_vitals_report.py summarizes them per route.
//
// Metrics are queued and flushed with sendBeacon when the page is hidden, which is when
// CLS and INP are final and the one moment a request is guaranteed not to be cut off.

// The exact type the hook hands its callback (richer than next/app's NextWebVitalsMetric).
type Metric = Parameters<Parameters<typeof useReportWebVitals>[0]>[0];

const WANTED = new Set(["LCP", "FCP", "CLS", "INP", "TTFB"]);
const queue: Record<string, unknown>[] = [];
// The landing route. LCP, FCP and TTFB belong to the hard navigation, and CLS/INP accumulate
// from it, so this is the page they describe even after client-side navigations.
const landing = typeof window !== "undefined" ? vitalsRoute(window.location.pathname) : "/";
let listening = false;
// Each metric instance has a unique id; web-vitals can report the same one again as its value
// settles, and a re-subscribed listener replays it. One row per id, or p75 skews toward whatever
// page happened to re-render.
const seen = new Set<string>();

function flush() {
  if (!queue.length) return;
  const batch = JSON.stringify(queue.splice(0, queue.length));
  if (!navigator.sendBeacon?.("/api/vitals", batch)) {
    void fetch("/api/vitals", { method: "POST", body: batch, keepalive: true }).catch(() => {});
  }
}

function listen() {
  if (listening) return;
  listening = true;
  addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  addEventListener("pagehide", flush);
}

// Module-level, so its identity never changes. useReportWebVitals re-subscribes when handed a new
// function, and an inline arrow is a new function on every render: the first deploy recorded
// each metric three times from a single /tasks load.
function report(metric: Metric) {
  if (!WANTED.has(metric.name) || seen.has(metric.id)) return;
  seen.add(metric.id);
  listen();
  const conn = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection;
  queue.push({
    metric: metric.name,
    value: metric.value,
    rating: metric.rating,
    route: landing,
    navType: metric.navigationType,
    viewportW: innerWidth,
    viewportH: innerHeight,
    dpr: devicePixelRatio,
    effectiveType: conn?.effectiveType,
    mobile: matchMedia("(pointer: coarse)").matches,
  });
}

export default function WebVitalsReporter() {
  useReportWebVitals(report);
  return null;
}
