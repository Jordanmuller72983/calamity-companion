// Water: reservoirs and CWA notices, read live.
// - Reservoir locations and capacities: CWA ArcGIS map service (gis.cwa.mu).
// - Notices: CWA website posts (WordPress REST API).
// - Fill levels: extracted from CWA / Water Resources Commission communiqué PDFs linked from those posts.
// Published figures from the press are kept as a fallback (src/data/reservoirs.ts); the newest figure wins.

import { extractText, getDocumentProxy } from 'unpdf'
import type { ReservoirLive, WaterNotice, WaterStatusLive } from '../src/data/liveTypes.ts'
import { ALL_RESERVOIRS, OUTLOOK, RESERVOIRS } from '../src/data/reservoirs.ts'
import { decodeEntities } from './mms.ts'

const CWA = 'https://cwa.govmu.org/cwa'
const ARCGIS = 'https://gis.cwa.mu/arcgis/rest/services/Website/Map_For_Website/MapServer/2/query'
const TTL = 6 * 60 * 60 * 1000

// Names as written in communiqués and in the CWA GIS → our id.
const ALIASES: [RegExp, string, string][] = [
  [/mare[\s-]+aux[\s-]+vacoas/i, 'mare-aux-vacoas', 'Mare-aux-Vacoas'],
  [/mare[\s-]+longue/i, 'mare-longue', 'Mare Longue'],
  [/la\s+nicoli[eè]re/i, 'la-nicoliere', 'La Nicolière'],
  [/midlands/i, 'midlands', 'Midlands Dam'],
  [/la\s+ferme/i, 'la-ferme', 'La Ferme'],
  [/piton\s+du\s+milieu/i, 'piton-du-milieu', 'Piton du Milieu'],
  [/bagatelle/i, 'bagatelle', 'Bagatelle Dam'],
  [/eau\s+bleue/i, 'eau-bleue', 'Eau Bleue'],
  [/tamarind\s+falls/i, 'tamarind-falls', 'Tamarind Falls'],
  [/diamamouve/i, 'diamamouve', 'Cascade Diamamouve'],
  [/valetta/i, 'valetta', 'Valetta'],
  [/dagoti[eè]re/i, 'dagotiere', 'Dagotière'],
]

const idFor = (name: string) => ALIASES.find(([re]) => re.test(name))

// Fallback locations (centroids computed from the CWA GIS polygons, Oct 2026).
const FALLBACK_GEO: Record<string, { lon: number; lat: number; capacity: string; purpose: string }> = {
  'mare-aux-vacoas': { lon: 57.5034, lat: -20.373, capacity: '25.89 Mm³', purpose: 'Domestic' },
  midlands: { lon: 57.5868, lat: -20.3236, capacity: '25.5 Mm³', purpose: 'Domestic, irrigation' },
  bagatelle: { lon: 57.5228, lat: -20.2495, capacity: '14 Mm³', purpose: '' },
  'la-ferme': { lon: 57.4322, lat: -20.2566, capacity: '11.52 Mm³', purpose: 'Irrigation' },
  'mare-longue': { lon: 57.4582, lat: -20.3789, capacity: '6.28 Mm³', purpose: 'Hydropower, irrigation' },
  'la-nicoliere': { lon: 57.6163, lat: -20.1585, capacity: '5.26 Mm³', purpose: 'Domestic, irrigation' },
  diamamouve: { lon: 57.6598, lat: -20.3114, capacity: '4.30 Mm³', purpose: 'Hydropower' },
  'eau-bleue': { lon: 57.603, lat: -20.3482, capacity: '4.10 Mm³', purpose: 'Hydropower' },
  'piton-du-milieu': { lon: 57.5781, lat: -20.2928, capacity: '2.99 Mm³', purpose: 'Domestic' },
  'tamarind-falls': { lon: 57.4617, lat: -20.3598, capacity: '2.30 Mm³', purpose: 'Hydropower, irrigation' },
  valetta: { lon: 57.5722, lat: -20.2595, capacity: '2.0 Mm³', purpose: 'Mill, irrigation' },
  dagotiere: { lon: 57.5643, lat: -20.2415, capacity: '0.60 Mm³', purpose: 'Mill, irrigation' },
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(25_000), headers: { 'User-Agent': 'CalamityCompanion/0.1' } })
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  return (await res.json()) as T
}

/** Reservoir outlines from the CWA GIS, reduced to a centre point. */
async function reservoirGeo(): Promise<typeof FALLBACK_GEO> {
  const q = `${ARCGIS}?where=1%3D1&outFields=NAME,CAPACITY,PURPOSE&outSR=4326&geometryPrecision=4&f=json`
  const data = await getJson<{ features: { attributes: Record<string, string>; geometry?: { rings: number[][][] } }[] }>(q)
  const out: typeof FALLBACK_GEO = {}
  for (const f of data.features) {
    const hit = idFor(f.attributes.NAME ?? '')
    const ring = f.geometry?.rings?.flat()
    if (!hit || !ring?.length) continue
    const [x, y] = ring.reduce(([a, b], [px, py]) => [a + px, b + py], [0, 0])
    const purpose = (f.attributes.PURPOSE ?? '').trim().toLowerCase().replace(/hydropoer/, 'hydropower').replace(/\s*,\s*/g, ', ')
    out[hit[1]] = {
      lon: Number((x / ring.length).toFixed(4)),
      lat: Number((y / ring.length).toFixed(4)),
      capacity: (f.attributes.CAPACITY ?? '').trim(),
      purpose: purpose.charAt(0).toUpperCase() + purpose.slice(1),
    }
  }
  return Object.keys(out).length ? out : FALLBACK_GEO
}

interface WpPost {
  date: string
  link: string
  title: { rendered: string }
  content?: { rendered: string }
}

const RELEVANT = /r[ée]servoir|remplissage|niveau|s[ée]cheresse|distribution d.eau|fourniture d.eau|coupure|restriction|horaires|dry season|water supply/i

/** "Mare aux Vacoas, principal réservoir du pays, est actuellement à 41% de sa capacité" → { 'mare-aux-vacoas': 41 } */
export function percentagesFromText(text: string): Record<string, number> {
  const out: Record<string, number> = {}
  const flat = text.replace(/\s+/g, ' ')
  for (const [re, id] of ALIASES) {
    const m = flat.match(new RegExp(`${re.source}[^%]{0,90}?(\\d{1,3}(?:[.,]\\d{1,2})?)\\s?%`, 'i'))
    if (m) {
      const v = Number(m[1].replace(',', '.'))
      if (v >= 0 && v <= 100) out[id] = v
    }
  }
  return out
}

async function pdfText(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  const pdf = await getDocumentProxy(new Uint8Array(await res.arrayBuffer()))
  const { text } = await extractText(pdf, { mergePages: true })
  return text
}

let cache: { at: number; status: WaterStatusLive } | undefined

export async function getWater(): Promise<WaterStatusLive> {
  if (cache && Date.now() - cache.at < TTL) return cache.status
  const errors: string[] = []

  const geo = await reservoirGeo().catch((e) => {
    errors.push(`CWA GIS: ${e.message}`)
    return FALLBACK_GEO
  })

  const posts = await getJson<WpPost[]>(`${CWA}/?rest_route=/wp/v2/posts&per_page=30&_fields=date,link,title,content`).catch((e) => {
    errors.push(`CWA posts: ${e.message}`)
    return [] as WpPost[]
  })

  const notices: WaterNotice[] = posts
    .map((p) => ({ title: decodeEntities(p.title.rendered).trim(), date: p.date.slice(0, 10), url: p.link }))
    .filter((n) => RELEVANT.test(n.title))
    .slice(0, 6)

  // Live levels from communiqué PDFs (most recent first, last 120 days).
  const live: Record<string, { pct: number; date: string; source: { name: string; url: string } }> = {}
  const since = Date.now() - 120 * 86400000
  for (const p of posts.filter((p) => RELEVANT.test(p.title.rendered) && new Date(p.date).getTime() > since)) {
    const pdfs = [...(p.content?.rendered ?? '').matchAll(/href="([^"]+\.pdf)"/gi)].map((m) => new URL(m[1], CWA + '/').href)
    for (const pdf of pdfs.slice(0, 2)) {
      try {
        const found = percentagesFromText(await pdfText(pdf))
        for (const [id, pct] of Object.entries(found)) {
          if (!live[id] || live[id].date < p.date.slice(0, 10))
            live[id] = { pct, date: p.date.slice(0, 10), source: { name: `CWA communiqué, ${p.date.slice(0, 10)}`, url: pdf } }
        }
      } catch (e) {
        errors.push(`PDF ${pdf}: ${(e as Error).message}`)
      }
    }
  }

  const reservoirs: ReservoirLive[] = Object.entries(geo).map(([id, g]) => {
    const name = ALIASES.find(([, i]) => i === id)?.[2] ?? id
    const published = RESERVOIRS.find((r) => r.id === id)
    const readings = [
      ...(published?.readings.map((r) => ({ date: r.date, pct: r.pct, approx: r.approx, source: r.source, from: 'press' as const })) ?? []),
      ...(live[id] ? [{ ...live[id], from: 'cwa' as const }] : []),
    ].sort((a, b) => a.date.localeCompare(b.date))
    return { id, name, ...g, readings }
  })

  const status: WaterStatusLive = {
    fetchedAt: new Date().toISOString(),
    reservoirs: reservoirs.sort((a, b) => parseFloat(b.capacity) - parseFloat(a.capacity)),
    all: ALL_RESERVOIRS,
    outlook: OUTLOOK,
    notices,
    errors,
  }
  cache = { at: Date.now(), status }
  return status
}
