import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { geocode, geocodeFirst } from "@/lib/weather/geocode";
import { getCurrentStay } from "@/lib/travel/current-stay";
import { addressCountry, geocodeCandidates } from "@/lib/travel/stay";

export interface WeatherData {
  temp: number | null;
  condition: string;
  wmoCode: number | null;
  high: number | null;
  low: number | null;
  windMph: number | null;
  precipIn: number | null;
  location: string;
  /**
   * Set when the forecast is for a "Stay at …" calendar event rather than home (travel mode).
   * `until` is the last day the stay covers, YYYY-MM-DD.
   */
  travel?: { city: string; until: string } | null;
}

const WMO_CONDITIONS: Record<number, string> = {
  0: "Clear",
  1: "Mainly Clear",
  2: "Partly Cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Icy Fog",
  51: "Light Drizzle",
  53: "Moderate Drizzle",
  55: "Dense Drizzle",
  56: "Light Freezing Drizzle",
  57: "Heavy Freezing Drizzle",
  61: "Light Rain",
  63: "Moderate Rain",
  65: "Heavy Rain",
  66: "Light Freezing Rain",
  67: "Heavy Freezing Rain",
  71: "Light Snow",
  73: "Moderate Snow",
  75: "Heavy Snow",
  77: "Snow Grains",
  80: "Light Showers",
  81: "Moderate Showers",
  82: "Heavy Showers",
  85: "Light Snow Showers",
  86: "Heavy Snow Showers",
  95: "Thunderstorm",
  96: "Thunderstorm w/ Light Hail",
  99: "Thunderstorm w/ Heavy Hail",
};

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data: profileRows } = await supabase
      .from("profile")
      .select("key,value")
      .eq("user_id", user.id);
    const profile: Record<string, string> = {};
    for (const row of profileRows ?? []) profile[row.key] = row.value;

    // Resolve location. A current "Stay at …" calendar event wins over home: that is where the
    // weather actually is today. Nothing is written — when the event ends, home comes back on
    // its own (see lib/travel/stay.ts).
    let lat: number | null = null;
    let lon: number | null = null;
    let location = "";
    let travel: WeatherData["travel"] = null;

    const stay = await getCurrentStay(supabase, user.id);
    const away = stay?.location
      ? await geocodeFirst(geocodeCandidates(stay.location), addressCountry(stay.location))
      : null;
    if (stay && !away) {
      // Never silent: travel mode with home weather underneath reads as correct and is not.
      console.warn(`[weather] could not place stay "${stay.name}" (${stay.location}); using home`);
    }

    if (stay && away) {
      lat = away.lat;
      lon = away.lon;
      location = away.label;
      travel = { city: away.name, until: stay.end };
    } else if (profile.location_lat && profile.location_lon) {
      lat = parseFloat(profile.location_lat);
      lon = parseFloat(profile.location_lon);
      location = profile.location_city ?? `${lat.toFixed(4)},${lon.toFixed(4)}`;
    } else {
      const city = profile.location_city ?? profile["Identity/Location"];
      if (!city) return NextResponse.json({ error: "No location configured" }, { status: 200 });
      const geo = await geocode(city);
      if (!geo) return NextResponse.json({ error: `Could not geocode: ${city}` }, { status: 200 });
      lat = geo.lat;
      lon = geo.lon;
      location = geo.label;
    }

    const params = new URLSearchParams({
      latitude: lat.toString(),
      longitude: lon.toString(),
      current: "temperature_2m,weathercode,windspeed_10m,precipitation",
      daily: "weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum",
      temperature_unit: "fahrenheit",
      wind_speed_unit: "mph",
      precipitation_unit: "inch",
      timezone: "auto",
      forecast_days: "1",
    });

    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
      next: { revalidate: 1800 }, // cache 30 min
    });
    const data = await res.json();

    const current = data.current ?? {};
    const daily = data.daily ?? {};

    const dailyWmo: number | null = daily.weathercode?.[0] ?? null;
    const currWmo: number | null = current.weathercode ?? null;
    const wmoCode = dailyWmo ?? currWmo;

    const weather: WeatherData = {
      temp: current.temperature_2m ?? null,
      condition: wmoCode != null ? (WMO_CONDITIONS[wmoCode] ?? `WMO ${wmoCode}`) : "Unknown",
      wmoCode,
      high: daily.temperature_2m_max?.[0] ?? null,
      low: daily.temperature_2m_min?.[0] ?? null,
      windMph: current.windspeed_10m ?? null,
      precipIn: daily.precipitation_sum?.[0] ?? current.precipitation ?? null,
      location,
      travel,
    };

    return NextResponse.json(weather);
  } catch (err) {
    console.error("[/api/weather]", err);
    return NextResponse.json({ error: "Weather fetch failed" }, { status: 500 });
  }
}
