// Current weather for towns MMS doesn't publish "current conditions" for.
// Source: Open-Meteo (open-meteo.com), free and keyless, built on national weather-model data.
// These are MODEL ESTIMATES, not measurements; the app labels them that way and keeps MMS observations separate.

import type { TownsStatus, TownWeather } from '../src/data/liveTypes.ts'

const TTL = 15 * 60 * 1000

// Approximate town centres. Open-Meteo snaps to its model grid (a few km), so this is precise enough.
export const TOWNS: { name: string; region: string; lat: number; lon: number }[] = [
  { name: 'Grand Baie', region: 'north', lat: -20.0128, lon: 57.5808 },
  { name: 'Triolet', region: 'north', lat: -20.0575, lon: 57.5503 },
  { name: 'Goodlands', region: 'north', lat: -20.0369, lon: 57.6436 },
  { name: 'Centre de Flacq', region: 'east', lat: -20.1897, lon: 57.7144 },
  { name: 'Bel Air', region: 'east', lat: -20.2578, lon: 57.7497 },
  { name: 'Mahébourg', region: 'south', lat: -20.4081, lon: 57.7 },
  { name: 'Souillac', region: 'south', lat: -20.5167, lon: 57.5167 },
  { name: 'Le Morne', region: 'west', lat: -20.455, lon: 57.33 },
  { name: 'Flic-en-Flac', region: 'west', lat: -20.2742, lon: 57.3711 },
  { name: 'Rose-Hill', region: 'centre', lat: -20.2397, lon: 57.4697 },
  { name: 'Quatre Bornes', region: 'centre', lat: -20.2654, lon: 57.4791 },
  { name: 'Moka', region: 'centre', lat: -20.219, lon: 57.496 },
  { name: 'Curepipe', region: 'centre', lat: -20.3186, lon: 57.5263 },
]

interface OpenMeteoCurrent {
  current: {
    time: string
    temperature_2m: number
    weather_code: number
    wind_speed_10m: number
    wind_gusts_10m: number
    precipitation: number
    relative_humidity_2m: number
  }
}

let cache: { at: number; status: TownsStatus } | undefined

export async function getTowns(): Promise<TownsStatus> {
  if (cache && Date.now() - cache.at < TTL) return cache.status
  const url =
    'https://api.open-meteo.com/v1/forecast?' +
    new URLSearchParams({
      latitude: TOWNS.map((t) => t.lat).join(','),
      longitude: TOWNS.map((t) => t.lon).join(','),
      current: 'temperature_2m,weather_code,wind_speed_10m,wind_gusts_10m,precipitation,relative_humidity_2m',
      timezone: 'Indian/Mauritius',
    })
  // Open-Meteo occasionally answers 503 when busy: retry twice, then fall back to the last good values.
  let res: Response | undefined
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await fetch(url, { signal: AbortSignal.timeout(20_000) }).catch(() => undefined)
    if (res?.ok) break
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
  }
  if (!res?.ok) {
    if (cache) return cache.status
    throw new Error(`Open-Meteo → HTTP ${res?.status ?? 'no response'}`)
  }
  const data = (await res.json()) as OpenMeteoCurrent[]
  const towns: TownWeather[] = data.map((d, i) => ({
    name: TOWNS[i].name,
    region: TOWNS[i].region,
    tempC: Math.round(d.current.temperature_2m),
    code: d.current.weather_code,
    windKmh: Math.round(d.current.wind_speed_10m),
    gustKmh: Math.round(d.current.wind_gusts_10m),
    rainMm: d.current.precipitation,
    humidity: d.current.relative_humidity_2m,
  }))
  const status: TownsStatus = { fetchedAt: new Date().toISOString(), modelTime: data[0]?.current.time, towns }
  cache = { at: Date.now(), status }
  return status
}
