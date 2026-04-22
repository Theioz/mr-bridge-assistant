#!/usr/bin/env python3
"""
Fetch current weather and forecast from Open-Meteo (no API key required).

Location is resolved in order:
  1. profile keys location_lat + location_lon  (explicit coordinates)
  2. profile key location_city                 (geocoded via Open-Meteo)
  3. profile key Identity/Location             (geocoded as fallback)

To set a custom location:
  python3 -c "
  import sys, os; sys.path.insert(0,'scripts')
  from _supabase import get_client, get_owner_user_id; c = get_client(); uid = get_owner_user_id()
  c.table('profile').upsert({'user_id':uid,'key':'location_city','value':'Seattle, WA'}, on_conflict='user_id,key').execute()
  "

Reusable by both fetch_briefing_data.py and check_weather_alert.py.

Usage: python3 scripts/fetch_weather.py
"""
from __future__ import annotations

import sys
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from _supabase import get_client, get_owner_user_id
from _sync_log import urlopen_with_retry

# WMO Weather Interpretation Code → human-readable condition
WMO_CONDITIONS: dict[int, str] = {
    0:  "Clear",
    1:  "Mainly Clear",
    2:  "Partly Cloudy",
    3:  "Overcast",
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
}


def wmo_to_condition(code: int | None) -> str:
    if code is None:
        return "Unknown"
    return WMO_CONDITIONS.get(code, f"WMO {code}")


def _geocode(query: str) -> tuple[float, float, str]:
    """Resolve a city/address string to (lat, lon, display_name) via Open-Meteo geocoding.

    Tries the full query first; if no results, retries with just the text before
    the first comma (handles "San Francisco, CA" → "San Francisco").
    """
    def _call(name: str) -> list:
        url = (
            "https://geocoding-api.open-meteo.com/v1/search"
            f"?name={urllib.parse.quote(name)}&count=1&language=en&format=json"
        )
        req = urllib.request.Request(url, headers={"User-Agent": "mr-bridge/1.0"})
        return urlopen_with_retry(req).get("results") or []

    results = _call(query)
    if not results and "," in query:
        results = _call(query.split(",")[0].strip())
    if not results:
        raise RuntimeError(f"Could not geocode location: {query!r}")

    r = results[0]
    display = r.get("name", query)
    admin = r.get("admin1", "")
    country_code = r.get("country_code", "")
    if admin:
        display = f"{display}, {admin}"
    elif country_code:
        display = f"{display}, {country_code}"
    return float(r["latitude"]), float(r["longitude"]), display


def _fetch_forecast(lat: float, lon: float) -> dict[str, Any]:
    """Call Open-Meteo forecast API. Returns raw JSON response."""
    params = (
        f"latitude={lat}&longitude={lon}"
        "&current=temperature_2m,weathercode,windspeed_10m,precipitation"
        "&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum"
        "&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch"
        "&timezone=auto&forecast_days=1"
    )
    url = f"https://api.open-meteo.com/v1/forecast?{params}"
    req = urllib.request.Request(url, headers={"User-Agent": "mr-bridge/1.0"})
    return urlopen_with_retry(req)


def fetch_weather(
    client=None,
    lat: float | None = None,
    lon: float | None = None,
    profile: dict[str, str] | None = None,
    owner_user_id: str | None = None,
) -> dict[str, Any]:
    """
    Fetch weather data and return a structured dict.

    Location resolution (first match wins):
      - lat/lon passed directly
      - profile['location_lat'] + profile['location_lon']
      - profile['location_city']  → geocoded
      - profile['Identity/Location'] → geocoded (fallback)

    Pass `profile` dict to skip an extra Supabase round-trip (used by
    fetch_briefing_data.py which already has profile data in memory).

    Returns:
        {
            "temp": float,        current temp °F
            "condition": str,     human-readable condition (daily WMO preferred)
            "wmo_code": int,      daily WMO weather code
            "high": float,        forecast high °F
            "low": float,         forecast low °F
            "wind_mph": float,    current wind speed mph
            "precip_in": float,   today's total precip forecast inches
            "location": str,      display label for the resolved location
        }
    """
    location_label = ""

    if lat is None or lon is None:
        if profile is None:
            if client is None:
                client = get_client()
            if owner_user_id is None:
                try:
                    owner_user_id = get_owner_user_id()
                except EnvironmentError:
                    owner_user_id = None
            q = client.table("profile").select("key,value")
            if owner_user_id:
                q = q.eq("user_id", owner_user_id)
            rows = q.execute().data
            profile = {r["key"]: r["value"] for r in rows}

        raw_lat = profile.get("location_lat")
        raw_lon = profile.get("location_lon")

        if raw_lat and raw_lon:
            lat = float(raw_lat)
            lon = float(raw_lon)
            location_label = profile.get("location_city", f"{lat:.4f},{lon:.4f}")
        else:
            # Try location_city, then fall back to Identity/Location
            city = profile.get("location_city") or profile.get("Identity/Location")
            if not city:
                raise RuntimeError(
                    "No location configured. Set location_lat + location_lon "
                    "(or location_city) in the profile table."
                )
            lat, lon, location_label = _geocode(city)
    else:
        location_label = f"{lat:.4f},{lon:.4f}"

    data = _fetch_forecast(lat, lon)

    current = data.get("current", {})
    daily = data.get("daily", {})

    temp     = current.get("temperature_2m")
    wind_mph = current.get("windspeed_10m")

    # Daily arrays — index 0 = today
    high      = (daily.get("temperature_2m_max") or [None])[0]
    low       = (daily.get("temperature_2m_min") or [None])[0]
    precip_in = (daily.get("precipitation_sum")  or [None])[0]
    daily_wmo = (daily.get("weathercode")        or [None])[0]
    curr_wmo  = current.get("weathercode")

    # Prefer daily WMO (more representative of full day) over current-hour WMO
    wmo_code = daily_wmo if daily_wmo is not None else curr_wmo

    return {
        "temp":      temp,
        "condition": wmo_to_condition(wmo_code),
        "wmo_code":  wmo_code,
        "high":      high,
        "low":       low,
        "wind_mph":  wind_mph,
        "precip_in": precip_in if precip_in is not None else (current.get("precipitation") or 0.0),
        "location":  location_label,
    }


def format_weather_line(w: dict[str, Any]) -> str:
    """Return single-line briefing format: temp, condition | High/Low | Wind | Precip."""
    def _f(val, fmt=".0f", suffix="", fallback="—"):
        return f"{val:{fmt}}{suffix}" if val is not None else fallback

    temp      = _f(w.get("temp"),      suffix="°F")
    condition = w.get("condition", "Unknown")
    high      = _f(w.get("high"),      suffix="°F")
    low       = _f(w.get("low"),       suffix="°F")
    wind      = _f(w.get("wind_mph"),  suffix=" mph")
    precip    = _f(w.get("precip_in"), fmt=".1f", suffix=" in")
    return f"{temp}, {condition} | High: {high}  Low: {low} | Wind: {wind} | Precip: {precip}"


if __name__ == "__main__":
    try:
        client = get_client()
        w = fetch_weather(client)
        print(f"### Weather ({w['location']})")
        print(format_weather_line(w))
        if w.get("precip_in") and w["precip_in"] > 0.1:
            print("Rain expected — plan accordingly")
    except Exception as e:
        print(f"[fetch_weather] Error: {e}", file=sys.stderr)
        sys.exit(1)
