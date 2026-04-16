"use client";

import { useEffect, useState } from "react";
import type { WeatherData } from "@/app/api/weather/route";

export default function DashboardBriefing() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherError, setWeatherError] = useState(false);

  useEffect(() => {
    fetch("/api/weather")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("weather fetch failed"))))
      .then((d) => {
        if (d.error) setWeatherError(true);
        else setWeather(d);
      })
      .catch(() => setWeatherError(true));
  }, []);

  if (weatherError) {
    return (
      <p
        className="prose-column"
        style={{
          color: "var(--color-text-muted)",
          fontSize: "var(--t-body)",
          lineHeight: 1.55,
          margin: 0,
        }}
      >
        Weather unavailable.
      </p>
    );
  }

  if (!weather) {
    return (
      <p
        className="prose-column"
        style={{
          color: "var(--color-text-muted)",
          fontSize: "var(--t-body)",
          lineHeight: 1.55,
          margin: 0,
          minHeight: "1.55em",
        }}
      >
        &nbsp;
      </p>
    );
  }

  const condition = weather.condition?.toLowerCase() ?? "";
  const temp = weather.temp != null ? Math.round(weather.temp) : null;
  const high = weather.high != null ? Math.round(weather.high) : null;
  const low = weather.low != null ? Math.round(weather.low) : null;

  return (
    <p
      className="prose-column"
      style={{
        color: "var(--color-text-muted)",
        fontSize: "var(--t-body)",
        lineHeight: 1.55,
        margin: 0,
      }}
    >
      {temp !== null && (
        <>
          Currently{" "}
          <strong className="tnum" style={{ color: "var(--color-text)", fontWeight: 500 }}>
            {temp}°F
          </strong>
          {condition && `, ${condition}`}
          {high !== null && low !== null && (
            <>
              . High{" "}
              <strong className="tnum" style={{ color: "var(--color-text)", fontWeight: 500 }}>
                {high}°F
              </strong>
              , low{" "}
              <strong className="tnum" style={{ color: "var(--color-text)", fontWeight: 500 }}>
                {low}°F
              </strong>
            </>
          )}
          .
        </>
      )}
    </p>
  );
}
