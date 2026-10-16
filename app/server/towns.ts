// Current weather for towns MMS doesn't publish "current conditions" for.
// Source: Open-Meteo (open-meteo.com), free and keyless, built on national weather-model data.
// These are MODEL ESTIMATES, not measurements; the app labels them that way and keeps MMS observations separate.

import type { TownsStatus, TownWeather } from '../src/data/liveTypes.ts'

const TTL = 15 * 60 * 1000

// Approximate town centres. Open-Meteo snaps to its model grid (a few km), so this is precise enough.
export const TOWNS: Place[] = [
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
    /** 1 between sunrise and sunset at that town */
    is_day: number
  }
}

type Place = { name: string; region: string; lat: number; lon: number }

// More places, for the search on the Weather card. Coordinates from Open-Meteo's geocoder (GeoNames), checked
// 16 Oct 2026. Left out: Port Louis and Vacoas (MMS stations, measured above), Beau Bassin (same town as
// Rose-Hill), Baie du Tombeau and Midlands (GeoNames points in the bay / far below the village).
export const MORE_PLACES: Place[] = [
  { name: 'Pamplemousses', region: 'north', lat: -20.1039, lon: 57.5703 },
  { name: 'Cap Malheureux', region: 'north', lat: -19.9842, lon: 57.6142 },
  { name: 'Péreybère', region: 'north', lat: -19.9988, lon: 57.5885 },
  { name: 'Trou aux Biches', region: 'north', lat: -20.033, lon: 57.5503 },
  { name: 'Grand Gaube', region: 'north', lat: -20.0064, lon: 57.6608 },
  { name: 'Rivière du Rempart', region: 'north', lat: -20.1031, lon: 57.6847 },
  { name: 'Poudre d’Or', region: 'north', lat: -20.06, lon: 57.6767 },
  { name: 'Terre Rouge', region: 'north', lat: -20.1283, lon: 57.5312 },
  { name: 'Mapou', region: 'north', lat: -20.0758, lon: 57.6014 },
  { name: 'Belle Mare', region: 'east', lat: -20.1996, lon: 57.7786 },
  { name: 'Poste de Flacq', region: 'east', lat: -20.1631, lon: 57.7306 },
  { name: 'Lalmatie', region: 'east', lat: -20.1897, lon: 57.6611 },
  { name: 'Bon Accueil', region: 'east', lat: -20.175, lon: 57.672 },
  { name: 'Trou d’Eau Douce', region: 'east', lat: -20.234, lon: 57.7945 },
  { name: 'Quatre Cocos', region: 'east', lat: -20.2015, lon: 57.7745 },
  { name: 'Grande Rivière Sud Est', region: 'east', lat: -20.2861, lon: 57.7758 },
  { name: 'Montagne Blanche', region: 'east', lat: -20.2854, lon: 57.6587 },
  { name: 'Rose Belle', region: 'south', lat: -20.4003, lon: 57.5967 },
  { name: 'New Grove', region: 'south', lat: -20.4086, lon: 57.6136 },
  { name: 'Plaine Magnien', region: 'south', lat: -20.4297, lon: 57.6697 },
  { name: 'Blue Bay', region: 'south', lat: -20.441, lon: 57.7191 },
  { name: 'Grand Bois', region: 'south', lat: -20.4189, lon: 57.5442 },
  { name: 'Rivière des Anguilles', region: 'south', lat: -20.493, lon: 57.563 },
  { name: 'Saint Aubin', region: 'south', lat: -20.496, lon: 57.55 },
  { name: 'Surinam', region: 'south', lat: -20.5097, lon: 57.5053 },
  { name: 'Chemin Grenier', region: 'south', lat: -20.493, lon: 57.469 },
  { name: 'Bel Ombre', region: 'south', lat: -20.5022, lon: 57.4061 },
  { name: 'Baie du Cap', region: 'south', lat: -20.491, lon: 57.378 },
  { name: 'Albion', region: 'west', lat: -20.2081, lon: 57.4077 },
  { name: 'Petite Rivière', region: 'west', lat: -20.1955, lon: 57.4459 },
  { name: 'Bambous', region: 'west', lat: -20.2567, lon: 57.4061 },
  { name: 'Cascavelle', region: 'west', lat: -20.2869, lon: 57.4072 },
  { name: 'Tamarin', region: 'west', lat: -20.3256, lon: 57.3706 },
  { name: 'Grande Rivière Noire', region: 'west', lat: -20.3603, lon: 57.3661 },
  { name: 'Chamarel', region: 'west', lat: -20.425, lon: 57.391 },
  { name: 'La Gaulette', region: 'west', lat: -20.4279, lon: 57.3608 },
  { name: 'Pailles', region: 'centre', lat: -20.1927, lon: 57.4883 },
  { name: 'Saint Pierre', region: 'centre', lat: -20.2215, lon: 57.5343 },
  { name: 'Réduit', region: 'centre', lat: -20.2344, lon: 57.4939 },
  { name: 'Ebène', region: 'centre', lat: -20.2449, lon: 57.4916 },
  { name: 'Quartier Militaire', region: 'centre', lat: -20.2479, lon: 57.5974 },
  { name: 'Phoenix', region: 'centre', lat: -20.2867, lon: 57.5022 },
  { name: 'Floréal', region: 'centre', lat: -20.3094, lon: 57.5008 },
  { name: 'La Marie', region: 'centre', lat: -20.335, lon: 57.485 },
  { name: 'Nouvelle France', region: 'centre', lat: -20.3706, lon: 57.5611 },
]

export type TownSet = 'main' | 'more'
const SETS: Record<TownSet, Place[]> = { main: TOWNS, more: MORE_PLACES }
const caches: Partial<Record<TownSet, { at: number; status: TownsStatus }>> = {}

/** Current model weather for one set of places: the main towns, or the longer list fetched on request. */
export async function getTowns(set: TownSet = 'main'): Promise<TownsStatus> {
  const places = SETS[set]
  const cache = caches[set]
  if (cache && Date.now() - cache.at < TTL) return cache.status
  const url =
    'https://api.open-meteo.com/v1/forecast?' +
    new URLSearchParams({
      latitude: places.map((t) => t.lat).join(','),
      longitude: places.map((t) => t.lon).join(','),
      current: 'temperature_2m,weather_code,wind_speed_10m,wind_gusts_10m,precipitation,relative_humidity_2m,is_day',
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
    name: places[i].name,
    region: places[i].region,
    tempC: Math.round(d.current.temperature_2m),
    code: d.current.weather_code,
    windKmh: Math.round(d.current.wind_speed_10m),
    gustKmh: Math.round(d.current.wind_gusts_10m),
    rainMm: d.current.precipitation,
    humidity: d.current.relative_humidity_2m,
    isDay: d.current.is_day === 1,
  }))
  const status: TownsStatus = { fetchedAt: new Date().toISOString(), modelTime: data[0]?.current.time, towns }
  caches[set] = { at: Date.now(), status }
  return status
}
