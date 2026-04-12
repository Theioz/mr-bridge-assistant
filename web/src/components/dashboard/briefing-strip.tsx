"use client";

import { useEffect, useState } from "react";
import { MapPin, Wind, Droplets } from "lucide-react";
import type { WeatherData } from "@/app/api/weather/route";

interface Props {
  dateStr: string;
}

const WMO_EMOJI: Record<number, string> = {
  0: "☀️", 1: "🌤", 2: "⛅", 3: "☁️",
  45: "🌫", 48: "🌫",
  51: "🌦", 53: "🌦", 55: "🌧",
  61: "🌧", 63: "🌧", 65: "🌧",
  71: "🌨", 73: "🌨", 75: "❄️", 77: "❄️",
  80: "🌦", 81: "🌦", 82: "⛈",
  95: "⛈", 96: "⛈", 99: "⛈",
};

function WeatherSkeleton() {
  return (
    <div className="flex items-center gap-4">
      {[48, 72, 56].map((w, i) => (
        <div key={i} className="skeleton rounded" style={{ height: 11, width: w, borderRadius: 4 }} />
      ))}
    </div>
  );
}

export function BriefingStrip({ dateStr }: Props) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/weather")
      .then((r) => r.json())
      .then((d) => { if (!d.error) setWeather(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const emoji = weather?.wmoCode != null ? (WMO_EMOJI[weather.wmoCode] ?? "🌡") : null;
  const rainWarning = weather?.precipIn != null && weather.precipIn > 0.1;

  return (
    <div
      className="rounded-xl px-5 py-4 flex flex-wrap items-center justify-between gap-4"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      {/* Left: date */}
      <p className="font-heading font-semibold" style={{ fontSize: 16, color: "var(--color-text)" }}>
        {dateStr}
      </p>

      {/* Right: weather */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {loading ? (
          <WeatherSkeleton />
        ) : weather ? (
          <>
            {/* Location */}
            <div className="flex items-center gap-1" style={{ color: "var(--color-text-faint)" }}>
              <MapPin size={11} />
              <span style={{ fontSize: 11 }}>{weather.location}</span>
            </div>

            {/* Temp + condition */}
            <div className="flex items-center gap-2">
              {emoji && <span style={{ fontSize: 16, lineHeight: 1 }}>{emoji}</span>}
              <span className="font-heading font-semibold" style={{ fontSize: 20, color: "var(--color-text)" }}>
                {weather.temp != null ? `${Math.round(weather.temp)}°` : "—"}
              </span>
              <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{weather.condition}</span>
            </div>

            {/* High / Low */}
            {(weather.high != null || weather.low != null) && (
              <div className="flex items-center gap-1.5" style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                <span>H <strong style={{ color: "var(--color-text)" }}>{weather.high != null ? `${Math.round(weather.high)}°` : "—"}</strong></span>
                <span style={{ color: "var(--color-text-faint)" }}>·</span>
                <span>L <strong style={{ color: "var(--color-text)" }}>{weather.low != null ? `${Math.round(weather.low)}°` : "—"}</strong></span>
              </div>
            )}

            {/* Wind */}
            {weather.windMph != null && (
              <div className="flex items-center gap-1" style={{ color: "var(--color-text-muted)", fontSize: 12 }}>
                <Wind size={11} />
                <span>{Math.round(weather.windMph)} mph</span>
              </div>
            )}

            {/* Rain warning */}
            {rainWarning && (
              <div className="flex items-center gap-1" style={{ color: "var(--color-info)", fontSize: 12 }}>
                <Droplets size={11} />
                <span>Rain · {weather.precipIn!.toFixed(2)}"</span>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
