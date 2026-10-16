import type { WarningSnapshot } from '../rules/types'

// Shape of /api/status. Built server-side from MMS pages (server/status.ts).

export interface BannerItem {
  text: string
  href?: string
}

export interface StationValue {
  station: string
  mm: number
}

export interface RainfallSet {
  period: string
  stations: StationValue[]
}

export interface Conditions {
  place: string
  sky: string
  tempC?: number
  wind?: string
  humidity?: string
}

// ---------- cyclone ----------

export interface CycloneInfo {
  name?: string
  intensity?: string
  lat: number
  lon: number
  /** Where it is heading, e.g. { towards: 'easterly', bearing: 90, speedKmh: 15 } */
  movement?: { towards: string; bearing?: number; speedKmh: number }
  /** "about 90 km almost to the south of Souillac" */
  where?: string
  at?: string
  distanceKm: number
  source: 'mms'
}

type Geo<G, P> = { type: 'Feature'; geometry: G; properties: P }
export type TrackFeature =
  | Geo<{ type: 'LineString'; coordinates: number[][] }, { kind: 'track'; forecast: boolean; category: string; name: string }>
  | Geo<{ type: 'Point'; coordinates: [number, number] }, { kind: 'point'; label: string; name: string }>
  | Geo<{ type: 'Polygon'; coordinates: number[][][] }, { kind: 'cone'; name: string }>
  | Geo<{ type: 'Polygon'; coordinates: number[][][] }, { kind: 'wind'; level: string; label: string; name: string }>
export interface TrackCollection {
  type: 'FeatureCollection'
  features: TrackFeature[]
}

// ---------- water ----------

export interface ReservoirLive {
  id: string
  name: string
  lon: number
  lat: number
  capacity: string
  purpose: string
  readings: { date: string; pct: number; approx?: boolean; source: { name: string; url: string }; from: 'cwa' | 'press' }[]
}

export interface WaterNotice {
  title: string
  date: string
  url: string
}

export interface WaterStatusLive {
  fetchedAt: string
  reservoirs: ReservoirLive[]
  all: { date: string; pct: number; lastYearPct: number; source: { name: string; url: string } }
  outlook: { text: string; source: { name: string; url: string } }
  notices: WaterNotice[]
  errors: string[]
}

// ---------- towns (model estimates) ----------

export interface TownWeather {
  name: string
  region: string
  tempC: number
  /** WMO weather code */
  code: number
  windKmh: number
  gustKmh: number
  rainMm: number
  humidity: number
}

export interface TownsStatus {
  fetchedAt: string
  /** Local time of the model values, e.g. "2026-10-16T12:00" */
  modelTime?: string
  towns: TownWeather[]
}

// ---------- press ----------

export type NewsTopic = 'school' | 'work' | 'transport' | 'warning' | 'water'

export interface NewsItem {
  title: string
  url: string
  source: 'Defimedia' | "L'Express"
  publishedAt: string
  topics: NewsTopic[]
}

export type DisruptionService = 'metro' | 'bus' | 'school' | 'curfew'
/** stopped · early (stops at a set hour) · limited · resumed · active (curfew in force) */
export type DisruptionState = 'stopped' | 'early' | 'limited' | 'resumed' | 'active'

/** A non-weather disruption reported in the press (unrest, curfew, strike…). Not an official status. */
export interface Disruption {
  service: DisruptionService
  state: DisruptionState
  title: string
  url: string
  source: NewsItem['source']
  publishedAt: string
}

export interface NewsStatus {
  fetchedAt: string
  items: NewsItem[]
  disruptions: Disruption[]
  errors: string[]
}

// ---------- reports ----------

export const REPORT_KINDS = ['flood', 'tree', 'power', 'landslide', 'water', 'blocked', 'other'] as const
export type ReportKind = (typeof REPORT_KINDS)[number]

export interface Report {
  id: string
  kind: ReportKind
  lat: number
  lon: number
  note?: string
  photo?: string
  createdAt: string
  /** Warning in force when it was sent, e.g. "class3". */
  warning: string
}

/** One place in the auto-scrolling "areas" strip: rain and wind first, then temperature. */
export interface AreaReading {
  name: string
  rain3h?: number
  rain24h?: number
  /** Highest wind recorded over the last 24 h. */
  windMaxKmh?: number
  tempMax?: number
  tempMin?: number
  humidity?: number
  /** From MMS "current conditions", for the places that have them. */
  sky?: string
  tempNow?: number
  windNow?: string
}

export interface LiveStatus {
  source: 'live' | 'archive-belal'
  fetchedAt: string
  snapshot: WarningSnapshot
  bulletin?: { title: string; lines: string[]; issuedAt?: string; url: string }
  notices: BannerItem[]
  rainfall: { last3h?: RainfallSet; last24h?: RainfallSet }
  conditions: Conditions[]
  areas: AreaReading[]
  areaPeriods: { rain3h?: string; rain24h?: string; wind?: string }
  forecast?: { issued: string; next24h: string[]; url: string }
  /** Official position from the MMS bulletin, when a storm is being tracked. */
  cyclone?: CycloneInfo
  /** GDACS tracks of active South-West Indian Ocean storms (empty when none). */
  tracks: TrackCollection[]
  /** French MMS forecast, used for French and Kreol readers. */
  forecastFr?: { issued: string; next24h: string[]; url: string }
  errors: string[]
}
