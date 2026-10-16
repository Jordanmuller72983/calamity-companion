// Cyclone position and track.
// 1. Official position, intensity and movement: parsed from the MMS cyclone bulletin text.
// 2. Track, forecast and uncertainty cone: GDACS (UN/EC Global Disaster Alert and Coordination System),
//    which republishes RSMC La Réunion data as GeoJSON. Live, no key needed.

import type { CycloneInfo, TrackCollection } from '../src/data/liveTypes.ts'

const GDACS = 'https://www.gdacs.org/gdacsapi/api'
const MAURITIUS = { lat: -20.16, lon: 57.5 } // Port Louis

// ---------- MMS bulletin text ----------

const COMPASS = ['north', 'north-northeast', 'northeast', 'east-northeast', 'east', 'east-southeast', 'southeast', 'south-southeast', 'south', 'south-southwest', 'southwest', 'west-southwest', 'west', 'west-northwest', 'northwest', 'north-northwest']

/** "easterly" → 90, "south-south-westerly" → 202.5. Movement words describe where it is heading. */
export function bearingFromWord(word: string): number | undefined {
  const w = word.toLowerCase().replace(/erly$|ly$/, '').replace(/-?wards?$/, '').replace(/\s+/g, '-')
  const norm = w.replace(/^(north|south)-(east|west)$/, '$1$2').replace(/-(north|south)-(east|west)$/, '-$1$2')
  const i = COMPASS.indexOf(norm)
  return i >= 0 ? i * 22.5 : undefined
}

const INTENSITY = /(very intense tropical cyclone|intense tropical cyclone|tropical cyclone|severe tropical storm|moderate tropical storm|tropical storm|tropical depression|tropical disturbance|zone of disturbed weather|remnant low|filling low)/i

export function parsePosition(lines: string[]): Omit<CycloneInfo, 'source' | 'distanceKm'> | undefined {
  const text = lines.join(' ').replace(/\s+/g, ' ')
  const pos = text.match(/latitude\s+([\d.]+)\s*degrees?\s+south\s+and\s+longitude\s+([\d.]+)\s*degrees?\s+east/i)
  if (!pos) return undefined
  const lat = -Number(pos[1])
  const lon = Number(pos[2])
  const nameMatch = text.match(new RegExp(`${INTENSITY.source}\\s+([A-Z][a-zA-Z'-]+)`, 'i'))
  const move = text.match(/moving in an? (?:general )?([a-z-]+(?:\s[a-z-]+)?) direction at (?:a speed of )?(?:about |around )?(\d+) km\/?h/i)
  const where = text.match(/centred at (?:about )?([^.]*?)(?: near latitude)/i)?.[1]
  const at = text.match(/At (\d{1,2}h\d{2})/)?.[1]
  return {
    name: nameMatch?.[2],
    intensity: nameMatch?.[1] ? nameMatch[1].replace(/\b\w/g, (c) => c.toUpperCase()) : undefined,
    lat,
    lon,
    movement: move ? { towards: move[1].toLowerCase(), bearing: bearingFromWord(move[1]), speedKmh: Number(move[2]) } : undefined,
    where: where?.trim(),
    at,
  }
}

export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number } = MAURITIUS) {
  const r = (d: number) => (d * Math.PI) / 180
  const dLat = r(b.lat - a.lat)
  const dLon = r(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLon / 2) ** 2
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)))
}

// ---------- GDACS ----------

interface GFeature {
  type: 'Feature'
  geometry: { type: string; coordinates: unknown }
  properties: Record<string, unknown>
}

function centroid(coords: number[][][]): [number, number] {
  const ring = coords[0]
  const [x, y] = ring.reduce(([sx, sy], [px, py]) => [sx + px, sy + py], [0, 0])
  return [Number((x / ring.length).toFixed(3)), Number((y / ring.length).toFixed(3))]
}

/** Keep only what the map draws: track segments, track points, the uncertainty cone and wind zones. */
export function simplifyGdacs(geo: { features: GFeature[] }): TrackCollection {
  const features: TrackCollection['features'] = []
  for (const f of geo.features) {
    const cls = String(f.properties.Class ?? '')
    const name = String(f.properties.eventname ?? '')
    if (cls.startsWith('Line_Line')) {
      features.push({
        type: 'Feature',
        geometry: f.geometry as { type: 'LineString'; coordinates: number[][] },
        properties: { kind: 'track', forecast: f.properties.forecast === true, category: String(f.properties.polygonlabel ?? ''), name },
      })
    } else if (cls.startsWith('Point_Polygon')) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: centroid(f.geometry.coordinates as number[][][]) },
        properties: { kind: 'point', label: String(f.properties.polygonlabel ?? ''), name },
      })
    } else if (cls === 'Poly_Cones') {
      features.push({ type: 'Feature', geometry: f.geometry as { type: 'Polygon'; coordinates: number[][][] }, properties: { kind: 'cone', name } })
    } else if (/^Poly_(Green|Orange|Red)$/.test(cls)) {
      features.push({
        type: 'Feature',
        geometry: f.geometry as { type: 'Polygon'; coordinates: number[][][] },
        properties: { kind: 'wind', level: cls.slice(5).toLowerCase(), label: String(f.properties.polygonlabel ?? ''), name },
      })
    }
  }
  return { type: 'FeatureCollection', features }
}

// South-West Indian Ocean, where storms can affect Mauritius.
const inSwio = ([lon, lat]: number[]) => lon >= 30 && lon <= 100 && lat <= -2 && lat >= -45

let listCache: { at: number; tracks: TrackCollection[] } | undefined
const LIST_TTL = 15 * 60 * 1000

/** Active storms in the South-West Indian Ocean, from GDACS. Empty when there are none. */
export async function getActiveTracks(): Promise<TrackCollection[]> {
  if (listCache && Date.now() - listCache.at < LIST_TTL) return listCache.tracks
  const day = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10)
  const res = await fetch(`${GDACS}/events/geteventlist/SEARCH?eventlist=TC&fromDate=${day(-10)}&toDate=${day(1)}&alertlevel=green;orange;red`, {
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`GDACS → HTTP ${res.status}`)
  const list = (await res.json()) as { features: GFeature[] }
  const recent = Date.now() - 36 * 3600 * 1000
  const active = list.features.filter(
    (f) => inSwio(f.geometry.coordinates as number[]) && new Date(String(f.properties.todate) + 'Z').getTime() > recent,
  )
  const tracks = await Promise.all(
    active.map(async (f) => {
      const url = (f.properties.url as { geometry: string }).geometry
      const g = (await fetch(url, { signal: AbortSignal.timeout(20_000) }).then((r) => r.json())) as { features: GFeature[] }
      return simplifyGdacs(g)
    }),
  )
  listCache = { at: Date.now(), tracks }
  return tracks
}
