"use client";

import { useEffect, useState } from "react";
import SyncButton from "./sync-button";
import { WindowSelector } from "@/components/ui/window-selector";
import type { WeatherData } from "@/app/api/weather/route";
import type { WindowKey } from "@/lib/window";

const WMO_EMOJI: Record<number, string> = {
  0: "☀️", 1: "🌤", 2: "⛅", 3: "☁️",
  45: "🌫", 48: "🌫",
  51: "🌦", 53: "🌦", 55: "🌧",
  61: "🌧", 63: "🌧", 65: "🌧",
  71: "🌨", 73: "🌨", 75: "❄️", 77: "❄️",
  80: "🌦", 81: "🌦", 82: "⛈",
  95: "⛈", 96: "⛈", 99: "⛈",
};

interface Props {
  greeting: string;
  dateStr: string;
  windowKey: WindowKey;
}

export default function DashboardHeader({ greeting, dateStr, windowKey }: Props) {
  const [weather, setWeather] = useState<WeatherData | null>(null);

  useEffect(() => {
    fetch("/api/weather")
      .then((r) => r.json())
      .then((d) => { if (!d.error) setWeather(d); })
      .catch(() => {});
  }, []);

  const emoji = weather?.wmoCode != null ? (WMO_EMOJI[weather.wmoCode] ?? "🌡") : null;

  return (
    <div className="flex items-start justify-between gap-4">
      {/* Left: greeting + date + weather */}
      <div>
        <h1 className="font-heading font-semibold" style={{ fontSize: 24, color: "var(--color-text)" }}>
          {greeting}
        </h1>
        <p className="mt-0.5" style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
          {dateStr}
        </p>
        {weather && (
          <p className="mt-0.5 flex items-center gap-1.5" style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
            {emoji && <span style={{ fontSize: 14, lineHeight: 1 }}>{emoji}</span>}
            {weather.temp != null && (
              <span style={{ color: "var(--color-text)" }}>{Math.round(weather.temp)}°</span>
            )}
            <span>{weather.condition}</span>
            {(weather.high != null || weather.low != null) && (
              <span style={{ color: "var(--color-text-faint)" }}>
                · H {weather.high != null ? `${Math.round(weather.high)}°` : "—"} L {weather.low != null ? `${Math.round(weather.low)}°` : "—"}
              </span>
            )}
          </p>
        )}
      </div>

      {/* Right: sync + window */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <SyncButton />
        <WindowSelector current={windowKey} />
      </div>
    </div>
  );
}
