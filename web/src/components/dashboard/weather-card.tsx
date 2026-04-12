"use client";

import { useEffect, useState } from "react";
import { Cloud, CloudRain, CloudSnow, CloudLightning, Sun, CloudDrizzle, Wind, Droplets, Thermometer, MapPin } from "lucide-react";
import type { WeatherData } from "@/app/api/weather/route";

function WeatherIcon({ wmoCode, className }: { wmoCode: number | null; className?: string }) {
  if (wmoCode == null) return <Cloud className={className} />;
  if (wmoCode >= 95) return <CloudLightning className={className} />;
  if (wmoCode >= 80) return <CloudRain className={className} />;
  if (wmoCode >= 71) return <CloudSnow className={className} />;
  if (wmoCode >= 61) return <CloudRain className={className} />;
  if (wmoCode >= 51) return <CloudDrizzle className={className} />;
  if (wmoCode >= 45) return <Cloud className={className} />;
  if (wmoCode === 3) return <Cloud className={className} />;
  if (wmoCode <= 2) return <Sun className={className} />;
  return <Cloud className={className} />;
}

function iconColor(wmoCode: number | null): string {
  if (wmoCode == null) return "text-neutral-500";
  if (wmoCode >= 95) return "text-yellow-400";
  if (wmoCode >= 71) return "text-sky-300";
  if (wmoCode >= 51) return "text-blue-400";
  if (wmoCode >= 80) return "text-blue-400";
  if (wmoCode <= 2) return "text-amber-400";
  return "text-neutral-400";
}

function fmt(val: number | null, decimals = 0, suffix = ""): string {
  if (val == null) return "—";
  return `${val.toFixed(decimals)}${suffix}`;
}

export default function WeatherCard() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/weather")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(true); return; }
        setWeather(d);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="shrink-0 space-y-1.5 sm:items-end flex flex-col">
        <div className="h-4 w-36 bg-neutral-800 rounded animate-pulse" />
        <div className="h-3 w-28 bg-neutral-800 rounded animate-pulse" />
        <div className="h-3 w-20 bg-neutral-800 rounded animate-pulse" />
      </div>
    );
  }

  if (error || !weather) {
    return <p className="text-xs text-neutral-600 shrink-0">Weather unavailable</p>;
  }

  const hasRain = weather.precipIn != null && weather.precipIn > 0.1;
  const isAlert = weather.wmoCode != null && weather.wmoCode >= 95;

  return (
    <div className="shrink-0 min-w-0">
      {/* Row 1: icon + temp + condition */}
      <div className="flex items-center sm:justify-end gap-1.5">
        <WeatherIcon
          wmoCode={weather.wmoCode}
          className={`w-4 h-4 shrink-0 ${iconColor(weather.wmoCode)}`}
        />
        <span className="text-sm font-medium text-neutral-100">
          {fmt(weather.temp, 0, "°F")}, {weather.condition}
        </span>
        {isAlert && <span className="text-xs text-yellow-400 ml-1">⚠ Severe</span>}
      </div>

      {/* Row 2: high/low · wind · precip */}
      <div className="flex items-center sm:justify-end gap-3 mt-0.5">
        <div className="flex items-center gap-1 text-xs text-neutral-500">
          <Thermometer size={10} className="text-neutral-600" />
          <span>
            <span className="text-neutral-300">{fmt(weather.high, 0, "°")}</span>
            <span className="text-neutral-600"> / </span>
            <span>{fmt(weather.low, 0, "°")}</span>
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs text-neutral-500">
          <Wind size={10} className="text-neutral-600" />
          <span>{fmt(weather.windMph, 0, " mph")}</span>
        </div>
        <div className={`flex items-center gap-1 text-xs ${hasRain ? "text-blue-400" : "text-neutral-500"}`}>
          <Droplets size={10} className={hasRain ? "text-blue-500" : "text-neutral-600"} />
          <span>{fmt(weather.precipIn, 1, '"')}</span>
          {hasRain && <span className="text-blue-400/70">rain</span>}
        </div>
      </div>

      {/* Row 3: location */}
      {weather.location && (
        <div className="flex items-center sm:justify-end gap-1 mt-0.5">
          <MapPin size={9} className="text-neutral-600 shrink-0" />
          <span className="text-xs text-neutral-600">{weather.location}</span>
        </div>
      )}
    </div>
  );
}
