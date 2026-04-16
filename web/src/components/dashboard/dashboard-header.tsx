"use client";

import { useEffect, useState } from "react";
import {
  Sun, CloudSun, Cloud, Cloudy, CloudFog, CloudRain, CloudSnow, CloudLightning, Thermometer, AlertTriangle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import SyncButton from "./sync-button";
import { WindowSelector } from "@/components/ui/window-selector";
import type { WeatherData } from "@/app/api/weather/route";
import type { WindowKey } from "@/lib/window";

const WMO_ICON: Record<number, LucideIcon> = {
  0: Sun, 1: CloudSun, 2: CloudSun, 3: Cloud,
  45: CloudFog, 48: CloudFog,
  51: CloudRain, 53: CloudRain, 55: CloudRain,
  61: CloudRain, 63: CloudRain, 65: CloudRain,
  71: CloudSnow, 73: CloudSnow, 75: CloudSnow, 77: CloudSnow,
  80: CloudRain, 81: CloudRain, 82: CloudLightning,
  95: CloudLightning, 96: CloudLightning, 99: CloudLightning,
};

interface Props {
  greeting: string;
  dateStr: string;
  windowKey: WindowKey;
}

export default function DashboardHeader({ greeting, dateStr, windowKey }: Props) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherError, setWeatherError] = useState(false);

  useEffect(() => {
    fetch("/api/weather")
      .then((r) => r.ok ? r.json() : Promise.reject(new Error("weather fetch failed")))
      .then((d) => {
        if (d.error) setWeatherError(true);
        else setWeather(d);
      })
      .catch(() => setWeatherError(true));
  }, []);

  const Icon = weather?.wmoCode != null ? (WMO_ICON[weather.wmoCode] ?? Cloudy) : Thermometer;

  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="font-heading font-semibold" style={{ fontSize: 24, color: "var(--color-text)" }}>
          {greeting}
        </h1>
        <p className="mt-0.5" style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
          {dateStr}
        </p>
        {/* Reserve a fixed line-height so content below never shifts */}
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0" style={{ fontSize: 13, minHeight: "1.25rem" }}>
          {!weather && weatherError ? (
            <span className="flex items-center gap-1.5" style={{ color: "var(--color-danger)" }} role="status">
              <AlertTriangle size={14} aria-hidden />
              <span>Weather unavailable</span>
            </span>
          ) : weather ? (
            <>
              <Icon size={14} style={{ color: "var(--color-text-muted)", flexShrink: 0 }} aria-hidden />
              {weather.temp != null && (
                <span style={{ color: "var(--color-text)" }}>{Math.round(weather.temp)}°</span>
              )}
              <span style={{ color: "var(--color-text-muted)" }}>{weather.condition}</span>
              {(weather.high != null || weather.low != null) && (
                <span style={{ color: "var(--color-text-faint)", whiteSpace: "nowrap" }}>
                  · H {weather.high != null ? `${Math.round(weather.high)}°` : "—"} L {weather.low != null ? `${Math.round(weather.low)}°` : "—"}
                </span>
              )}
            </>
          ) : (
            /* Invisible placeholder while loading — same height as weather text */
            <span>&nbsp;</span>
          )}
        </p>
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        <SyncButton />
        <WindowSelector current={windowKey} />
      </div>
    </div>
  );
}
