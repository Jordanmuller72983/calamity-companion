// Builds the app's live status from MMS pages. Runs in Node today (Vite dev/preview middleware);
// the same code moves to a scheduled Supabase function later.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AreaReading, Conditions, LiveStatus, RainfallSet, TrackCollection } from '../src/data/liveTypes.ts'
import type { CycloneLevel, RainLevel } from '../src/rules/types.ts'
import {
  MMS_PAGES,
  classify,
  parseBanner,
  parseBulletin,
  parseConditions,
  parseForecast,
  parseRainfall,
  parseStationExtras,
  type StationExtras,
} from './mms.ts'
import { getJson, setJson } from './store.ts'
import { distanceKm, getActiveTracks, parsePosition } from './cyclone.ts'

const CACHE_MS = 5 * 60 * 1000
const TIMEOUT_MS = 15_000

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'CalamityCompanion/0.1 (personal public-safety project)' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  return new TextDecoder('utf-8').decode(await res.arrayBuffer())
}

type Pages = Record<keyof typeof MMS_PAGES, string | undefined>


/** "Port Louis (Line Barracks)" and "Port Louis" are the same place. */
const placeKey = (name: string) => name.toLowerCase().replace(/\s*\(.*\)/, '').replace(/[^a-z]/g, '')

/** Merge rainfall, wind, temperature and current conditions into one reading per place. */
export function buildAreas(rain: { last3h?: RainfallSet; last24h?: RainfallSet }, x: StationExtras, conditions: Conditions[]): AreaReading[] {
  const areas = new Map<string, AreaReading>()
  const get = (name: string) => {
    const k = placeKey(name)
    if (!areas.has(k)) areas.set(k, { name: name.replace(/\s*\(.*\)/, '') })
    return areas.get(k)!
  }
  for (const r of rain.last24h?.stations ?? []) get(r.station).rain24h = r.mm
  for (const r of rain.last3h?.stations ?? []) get(r.station).rain3h = r.mm
  for (const w of x.wind) get(w.station).windMaxKmh = w.kmh
  for (const t of x.temp) Object.assign(get(t.station), { tempMax: t.max, tempMin: t.min })
  for (const h of x.humidity) get(h.station).humidity = h.pct
  for (const c of conditions) Object.assign(get(c.place), { sky: c.sky, tempNow: c.tempC, windNow: c.wind })
  // Wettest and windiest places first, so the strip leads with what matters.
  const score = (a: AreaReading) => (a.rain3h ?? 0) * 4 + (a.rain24h ?? 0) + (a.windMaxKmh ?? 0) / 10
  return [...areas.values()].sort((a, b) => score(b) - score(a))
}

// Remember the last state so the app can say what changed ("Class II → Class III").
let lastState: { cyclone: CycloneLevel; rain: RainLevel; since: string } | undefined
let previous: LiveStatus['snapshot']['previous']

function build(pages: Pages, fetchedAt: string, source: LiveStatus['source'], errors: string[], tracks: TrackCollection[] = []): LiveStatus {
  const cycloneBulletin = pages.cycloneEn ? parseBulletin(pages.cycloneEn) : undefined
  const rainBulletin = pages.rain ? parseBulletin(pages.rain) : undefined
  const banner = parseBanner(pages.home ?? pages.cycloneEn ?? '')
  const c = classify(banner, [...(cycloneBulletin?.lines.slice(0, 3) ?? []), ...(rainBulletin?.lines.slice(0, 3) ?? [])])

  if (source === 'live') {
    if (lastState && (lastState.cyclone !== c.cyclone || lastState.rain !== c.rain)) {
      previous = { cyclone: lastState.cyclone, rain: lastState.rain, changedAt: fetchedAt }
    }
    if (!lastState || lastState.cyclone !== c.cyclone || lastState.rain !== c.rain) {
      lastState = { cyclone: c.cyclone, rain: c.rain, since: fetchedAt }
    }
  }

  const bulletin =
    c.cyclone !== 'none' && cycloneBulletin
      ? { ...cycloneBulletin, url: MMS_PAGES.cycloneEn }
      : c.rain !== 'none' && rainBulletin
        ? { ...rainBulletin, url: MMS_PAGES.rain }
        : undefined

  const pos = c.cyclone !== 'none' && cycloneBulletin ? parsePosition(cycloneBulletin.lines) : undefined
  const cyclone = pos && { ...pos, distanceKm: distanceKm(pos), source: 'mms' as const }

  const forecast = pages.forecastEn ? parseForecast(pages.forecastEn) : undefined
  const rainfall = pages.latest ? parseRainfall(pages.latest) : {}
  const extras: StationExtras = pages.latest ? parseStationExtras(pages.latest) : { wind: [], temp: [], humidity: [] }
  const conditions = parseConditions(pages.home ?? '')
  const forecastFr = pages.forecastFr ? parseForecast(pages.forecastFr) : undefined

  return {
    source,
    fetchedAt,
    snapshot: {
      cyclone: c.cyclone,
      rain: c.rain,
      rainArea: c.rainArea,
      issuedAt: bulletin?.issuedAt ?? fetchedAt,
      fetchedAt,
      previous: source === 'live' ? previous : undefined,
    },
    bulletin,
    cyclone,
    tracks,
    notices: c.others,
    rainfall,
    conditions,
    areas: buildAreas(rainfall, extras, conditions),
    areaPeriods: { rain3h: rainfall.last3h?.period, rain24h: rainfall.last24h?.period, wind: extras.windPeriod },
    forecast: forecast && { ...forecast, url: MMS_PAGES.forecastEn },
    forecastFr: forecastFr && forecastFr.next24h.length ? { ...forecastFr, url: MMS_PAGES.forecastFr } : undefined,
    errors,
  }
}

let cache: { at: number; status: LiveStatus } | undefined
let inflight: Promise<LiveStatus> | undefined

export async function getLiveStatus(): Promise<LiveStatus> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.status
  inflight ??= (async () => {
    let trackError: string | undefined
    const keys = Object.keys(MMS_PAGES) as (keyof typeof MMS_PAGES)[]
    const [results, tracks] = await Promise.all([
      Promise.allSettled(keys.map((k) => fetchPage(MMS_PAGES[k]))),
      getActiveTracks().catch((e) => {
        trackError = `GDACS: ${(e as Error).message}`
        return [] as TrackCollection[]
      }),
    ])
    const errors: string[] = trackError ? [trackError] : []
    const pages = Object.fromEntries(
      keys.map((k, i) => {
        const r = results[i]
        if (r.status === 'rejected') errors.push(`${k}: ${String(r.reason?.message ?? r.reason)}`)
        return [k, r.status === 'fulfilled' ? r.value : undefined]
      }),
    ) as Pages

    // Nothing reachable: keep serving the last good data (the app shows how old it is).
    if (!pages.home && !pages.cycloneEn && cache) {
      return { ...cache.status, errors }
    }
    // Serverless instances don't share memory: keep "what changed" (e.g. Class II → III) in the store.
    const saved = await getJson<{ lastState?: typeof lastState; previous?: typeof previous }>('warning-state').catch(() => undefined)
    if (saved) ({ lastState, previous } = saved)
    const before = JSON.stringify(lastState)
    const status = build(pages, new Date().toISOString(), 'live', errors, tracks)
    if (JSON.stringify(lastState) !== before) await setJson('warning-state', { lastState, previous }).catch(() => undefined)
    cache = { at: Date.now(), status }
    return status
  })().finally(() => {
    inflight = undefined
  })
  return inflight
}

/** Real archived MMS pages from Cyclone Belal (16 Jan 2024), to see the app with an actual bulletin. */
export function getBelalArchiveStatus(): LiveStatus {
  // Relative to the app folder: works in dev and on Vercel (files included via vercel.json).
  const f = (name: string) => readFileSync(join(process.cwd(), 'server', 'fixtures', name), 'utf8')
  const belal = f('2024-01-16-belal-cyclone-en.html')
  const status = build(
    {
      home: belal,
      cycloneEn: belal,
      rain: undefined,
      special: undefined,
      latest: undefined, // no archived rainfall for that day
      forecastEn: undefined,
      forecastFr: undefined,
    },
    '2024-01-16T00:20:00.000Z',
    'archive-belal',
    [],
    [JSON.parse(f('2024-01-belal-gdacs-track.json')) as TrackCollection],
  )
  // Show it as if just fetched, so it isn't flagged as stale.
  const now = new Date().toISOString()
  return { ...status, fetchedAt: now, snapshot: { ...status.snapshot, fetchedAt: now } }
}
