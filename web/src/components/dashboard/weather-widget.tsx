"use client";

import { useEffect, useState } from "react";
import { Thermometer, Wind, Droplets, MapPin } from "lucide-react";
import type { WeatherData } from "@/app/api/weather/route";

function Skeleton() {
  return (
    <div className="flex items-center gap-6 flex-wrap">
      {[60, 80, 64, 48].map((w, i) => (
        <div
          key={i}
          className="skeleton rounded"
          style={{ height: 12, width: w, borderRadius: 4 }}
        />
      ))}
    </div>
  );
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

export default function WeatherWidget() {
  const [data, setData] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/weather")
      .then((r) => r.json())
      .then((d) => { if (!d.error) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (!loading && !data) return null;

  const emoji = data?.wmoCode != null ? (WMO_EMOJI[data.wmoCode] ?? "🌡") : null;
  const rainWarning = data?.precipIn != null && data.precipIn > 0.1;

  return (
    <div
      className="rounded-xl px-5 py-3.5 flex flex-wrap items-center gap-x-6 gap-y-2"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      {loading ? (
        <Skeleton />
      ) : data ? (
        <>
          {/* Location */}
          <div className="flex items-center gap-1.5" style={{ color: "var(--color-text-muted)" }}>
            <MapPin size={12} />
            <span style={{ fontSize: 12 }}>{data.location}</span>
          </div>

          {/* Temp + condition */}
          <div className="flex items-center gap-2">
            {emoji && <span style={{ fontSize: 18, lineHeight: 1 }}>{emoji}</span>}
            <span className="font-heading font-semibold" style={{ fontSize: 22, color: "var(--color-text)" }}>
              {data.temp != null ? `${Math.round(data.temp)}°` : "—"}
            </span>
            <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>{data.condition}</span>
          </div>

          {/* High / Low */}
          {(data.high != null || data.low != null) && (
            <div className="flex items-center gap-2" style={{ fontSize: 12 }}>
              <span style={{ color: "var(--color-text-muted)" }}>
                H <span style={{ color: "var(--color-text)", fontWeight: 600 }}>
                  {data.high != null ? `${Math.round(data.high)}°` : "—"}
                </span>
              </span>
              <span style={{ color: "var(--color-text-faint)" }}>·</span>
              <span style={{ color: "var(--color-text-muted)" }}>
                L <span style={{ color: "var(--color-text)", fontWeight: 600 }}>
                  {data.low != null ? `${Math.round(data.low)}°` : "—"}
                </span>
              </span>
            </div>
          )}

          {/* Wind */}
          {data.windMph != null && (
            <div className="flex items-center gap-1.5" style={{ color: "var(--color-text-muted)", fontSize: 12 }}>
              <Wind size={12} />
              <span>{Math.round(data.windMph)} mph</span>
            </div>
          )}

          {/* Rain warning */}
          {rainWarning && (
            <div className="flex items-center gap-1.5" style={{ color: "var(--color-info)", fontSize: 12 }}>
              <Droplets size={12} />
              <span>Rain expected · {data.precipIn!.toFixed(2)} in</span>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
