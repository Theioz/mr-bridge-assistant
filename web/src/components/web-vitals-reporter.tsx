"use client";

import { useReportWebVitals } from "next/web-vitals";
import { vitalsRoute } from "@/lib/web-vitals-route";

// Real-user page-load metrics (#445): what the app actually feels like on the phone it is
// used from, as opposed to Lighthouse's simulated mid-range phone on slow 4G. Rows land in
// public.web_vitals; scripts/web_vitals_report.py summarizes them per route.
//
// Metrics are queued and flushed with sendBeacon when the page is hidden, which is when
// CLS and INP are final and the one moment a request is guaranteed not to be cut off.

const WANTED = new Set(["LCP", "FCP", "CLS", "INP", "TTFB"]);
const queue: Record<string, unknown>[] = [];
// The landing route. LCP, FCP and TTFB belong to the hard navigation, and CLS/INP accumulate
// from it, so this is the page they describe even after client-side navigations.
const landing = typeof window !== "undefined" ? vitalsRoute(window.location.pathname) : "/";
let listening = false;

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

export default function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    if (!WANTED.has(metric.name)) return;
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
  });
  return null;
}
