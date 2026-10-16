// Parsers for Mauritius Meteorological Services web pages (metservice.intnet.mu).
// MMS has no public data API, so we read the same HTML the public sees.
// Pure functions: no network, no Node APIs. Tested against real saved pages in ./fixtures.

import type { CycloneLevel, RainLevel } from '../src/rules/types.ts'

export const MMS_BASE = 'http://metservice.intnet.mu'

export const MMS_PAGES = {
  home: `${MMS_BASE}/index.php`,
  cycloneEn: `${MMS_BASE}/cyclone-bulletin-english-mauritius.php`,
  rain: `${MMS_BASE}/warning-bulletin-torrential-rain-warning.php`,
  special: `${MMS_BASE}/warning-bulletin-special-weather.php`,
  latest: `${MMS_BASE}/latest-weather-data.php`,
  forecastEn: `${MMS_BASE}/forecast-bulletin-english-mauritius.php`,
  forecastFr: `${MMS_BASE}/forecast-bulletin-french-mauritius.php`,
} as const

// ---------- text helpers ----------

const ENTITIES: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", deg: '°',
  eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', acirc: 'â', ccedil: 'ç',
  ocirc: 'ô', icirc: 'î', ucirc: 'û', ugrave: 'ù', rsquo: '’', lsquo: '‘', ndash: '–', mdash: '—',
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m)
}

/** Some MMS text is UTF-8 that was decoded as Latin-1 upstream ("Ã " for "à"). Repair it. */
export function fixMojibake(s: string): string {
  if (!/[ÃÂ][\u0080-ÿ]/.test(s)) return s
  try {
    const bytes = Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff)
    const fixed = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return fixed
  } catch {
    return s
  }
}

/** HTML fragment → plain text lines. */
export function htmlToLines(html: string): string[] {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h\d|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
  return fixMojibake(decodeEntities(text))
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .filter(Boolean)
}

// ---------- warning banner (present on every MMS page) ----------

export interface BannerItem {
  text: string
  href?: string
}

/** The scrolling red banner inside <div class="warning"> lists every active warning. */
export function parseBanner(html: string): BannerItem[] {
  const block = html.match(/<div class="warning">([\s\S]*?)<\/div>\s*<!-- END CYCLONE WARNING -->/i)?.[1]
  if (!block) return []
  const marquee = block.replace(/<!--[\s\S]*?-->/g, '').match(/<marquee[^>]*>([\s\S]*?)<\/marquee>/i)?.[1]
  if (!marquee) return []
  const items: BannerItem[] = []
  for (const m of marquee.matchAll(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const text = htmlToLines(m[2]).join(' ').trim()
    if (text) items.push({ text, href: m[1].trim() })
  }
  if (!items.length) {
    const text = htmlToLines(marquee).join(' ').trim()
    if (text) items.push({ text })
  }
  return items
}

const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4 }

function classNumber(token: string): number | undefined {
  const t = token.toLowerCase()
  return ROMAN[t] ?? (/^[1-4]$/.test(t) ? Number(t) : undefined)
}

const isRodriguesOnly = (t: string) => /rodrigues/i.test(t) && !/mauritius|maurice|moris/i.test(t)

/** Cyclone level from English or French text, for Mauritius (not Rodrigues). */
export function cycloneFromText(text: string): CycloneLevel | undefined {
  if (isRodriguesOnly(text)) return undefined
  const t = text.toLowerCase()
  if (/safety bulletin|bulletin de s[ée]curit[ée]/.test(t)) return 'safetyBulletin'
  if (/terminat|fin de (tous les )?avis|tous les avis.*lev[ée]s/.test(t)) return 'terminated'
  const m =
    t.match(/cyclone warning class\s+(iv|i{1,3}|[1-4])\b/) ??
    t.match(/avertissement de cyclone de classe\s+(iv|i{1,3}|[1-4])\b/) ??
    t.match(/avis de cyclone (?:de )?classe\s+(iv|i{1,3}|[1-4])\b/)
  const n = m && classNumber(m[1])
  if (n && !/(has been|is) (lifted|removed)|lev[ée]/.test(t)) return `class${n}` as CycloneLevel
  return undefined
}

/** Rain level from English or French text, for Mauritius (not Rodrigues). */
export function rainFromText(text: string): { level: RainLevel; area?: string } | undefined {
  if (isRodriguesOnly(text)) return undefined
  const t = text.toLowerCase()
  if (/(lifted|terminated|removed|lev[ée])/.test(t)) return undefined
  if (/torrential rain warning|avis de pluies torrentielles|avertissement de pluies torrentielles/.test(t))
    return { level: 'torrentialRainWarning' }
  const warn = text.match(/heavy rain warning(?: for| in)? ([^.|]+)/i)
  if (warn) return { level: 'heavyRainWarning', area: cleanArea(warn[1]) }
  if (/avis de fortes pluies|avertissement de fortes pluies/.test(t)) return { level: 'heavyRainWarning' }
  if (/heavy rain watch|veille de fortes pluies/.test(t)) return { level: 'heavyRainWatch' }
  return undefined
}

function cleanArea(s: string): string | undefined {
  const a = s.replace(/\s+(is|remains) in force.*/i, '').trim()
  return a && !/^mauritius$/i.test(a) ? a : undefined
}

const RAIN_RANK: Record<RainLevel, number> = { none: 0, heavyRainWatch: 1, heavyRainWarning: 2, torrentialRainWarning: 3 }
const CYCLONE_RANK: Record<CycloneLevel, number> = {
  none: 0, terminated: 1, safetyBulletin: 2, class1: 3, class2: 4, class3: 5, class4: 6,
}

export interface Classified {
  cyclone: CycloneLevel
  rain: RainLevel
  rainArea?: string
  /** Banner items that aren't cyclone/rain warnings for Mauritius (swell, Rodrigues, news). */
  others: BannerItem[]
}

export function classify(items: BannerItem[], bulletinTexts: string[] = []): Classified {
  let cyclone: CycloneLevel = 'none'
  let rain: RainLevel = 'none'
  let rainArea: string | undefined
  const others: BannerItem[] = []

  const consider = (text: string, item?: BannerItem) => {
    const c = cycloneFromText(text)
    const r = rainFromText(text)
    if (c && CYCLONE_RANK[c] > CYCLONE_RANK[cyclone]) cyclone = c
    if (r && RAIN_RANK[r.level] > RAIN_RANK[rain]) {
      rain = r.level
      rainArea = r.area
    }
    if (item && !c && !r) others.push(item)
  }
  for (const item of items) consider(item.text, item)
  for (const text of bulletinTexts) consider(text)
  return { cyclone, rain, rainArea, others }
}

// ---------- bulletin pages ----------

export interface Bulletin {
  title: string
  lines: string[]
  /** "issued at 04h10 on Tuesday 16 January 2024" → ISO, Mauritius time (UTC+4). */
  issuedAt?: string
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

export function parseIssued(text: string): string | undefined {
  const m = text.match(/issued at (\d{1,2})h(\d{2})[^\d]*?(\d{1,2}) (\w+) (\d{4})/i)
  if (!m) return undefined
  const month = MONTHS.indexOf(m[4].toLowerCase())
  if (month < 0) return undefined
  const utc = Date.UTC(Number(m[5]), month, Number(m[3]), Number(m[1]) - 4, Number(m[2]))
  return new Date(utc).toISOString()
}

/** Main content of a bulletin page: the <h1> and the text after it, inside left_content. */
export function parseBulletin(html: string): Bulletin | undefined {
  const left = html.match(/<div class="left_content">([\s\S]*?)<div id="footer_main">/i)?.[1]
  if (!left) return undefined
  const afterSep = left.split(/<div class="sep"><\/div>/i)[1] ?? ''
  const h1 = afterSep.match(/<h1>([\s\S]*?)(?:<\/h1>|$)/i)
  const title = h1 ? htmlToLines(h1[1]).join(' ') : ''
  const body = h1 ? afterSep.slice((h1.index ?? 0) + h1[0].length) : afterSep
  const lines = htmlToLines(body)
  // Every bulletin line is repeated once at the top as a bold header; drop exact duplicates in a row.
  const deduped = lines.filter((l, i) => l !== lines[i - 1])
  if (!deduped.length) return undefined
  return { title, lines: deduped, issuedAt: parseIssued(deduped.join(' ')) }
}

// ---------- rainfall per station (latest-weather-data.php) ----------

export interface StationValue {
  station: string
  mm: number
}

export interface RainfallSet {
  period: string
  stations: StationValue[]
}

interface StationRows {
  period: string
  rows: { station: string; values: number[] }[]
}

/** One map tab on latest-weather-data.php: a block per station with one or two numbers (e.g. max/min temp). */
function parseStations(html: string, viewId: string): StationRows | undefined {
  const start = html.indexOf(`<div id="${viewId}">`)
  if (start < 0) return undefined
  const nextView = html.indexOf('<div id="view', start + 10)
  const view = html.slice(start, nextView > 0 ? nextView : undefined)
  const rows: StationRows['rows'] = []
  // A station with no reading has an empty <p>. Port Louis appears on two maps.
  for (const block of view.split('class="station"').slice(1)) {
    const name = block.match(/^\s*title="([^"]+)"/)?.[1]
    const end = block.indexOf('</div>')
    const values = [...block.slice(0, end > 0 ? end : undefined).matchAll(/<p[^>]*>\s*(-?[\d.]+)\s*<\/p>/g)].map((m) => Number(m[1]))
    if (!name || !values.length) continue
    const station = decodeEntities(name).trim()
    if (!rows.some((s) => s.station === station)) rows.push({ station, values })
  }
  const caption = view.match(/class="weatherinfo">\s*<p[^>]*>([\s\S]*?)<\/p>/i)
  return { period: caption ? htmlToLines(caption[1]).join(' ') : '', rows }
}

function parseStationView(html: string, viewId: string): RainfallSet | undefined {
  const s = parseStations(html, viewId)
  return s && { period: s.period, stations: s.rows.map((r) => ({ station: r.station, mm: r.values[0] })) }
}

export interface StationExtras {
  windPeriod?: string
  wind: { station: string; kmh: number }[]
  tempPeriod?: string
  temp: { station: string; max: number; min?: number }[]
  humidityPeriod?: string
  humidity: { station: string; pct: number }[]
}

/** Max wind, max/min temperature and humidity per station (tabs 3–5 of latest-weather-data.php). */
export function parseStationExtras(html: string): StationExtras {
  const t = parseStations(html, 'view3')
  const w = parseStations(html, 'view4')
  const h = parseStations(html, 'view5')
  return {
    tempPeriod: t?.period,
    temp: (t?.rows ?? []).map((r) => ({ station: r.station, max: r.values[0], min: r.values[1] })),
    windPeriod: w?.period,
    wind: (w?.rows ?? []).map((r) => ({ station: r.station, kmh: r.values[0] })),
    humidityPeriod: h?.period,
    humidity: (h?.rows ?? []).map((r) => ({ station: r.station, pct: r.values[0] })),
  }
}

export function parseRainfall(html: string): { last24h?: RainfallSet; last3h?: RainfallSet } {
  return { last24h: parseStationView(html, 'view1'), last3h: parseStationView(html, 'view2') }
}

// ---------- current conditions (sidebar on every page) ----------

export interface Conditions {
  place: string
  sky: string
  tempC?: number
  wind?: string
  humidity?: string
}

export function parseConditions(html: string): Conditions[] {
  const out: Conditions[] = []
  const blocks = html.split('<h3>Current conditions</h3>').slice(1)
  for (const b of blocks) {
    const place = b.match(/class="vacoas_plaisance">([\s\S]*?)<\/p>/)?.[1]
    if (!place) continue
    const temp = b.match(/class="temperature">\s*(-?\d+)/)?.[1]
    out.push({
      place: htmlToLines(place).join(' '),
      sky: htmlToLines(b.match(/class="conditions">([\s\S]*?)<\/p>/)?.[1] ?? '').join(' '),
      tempC: temp ? Number(temp) : undefined,
      wind: htmlToLines(b.match(/Wind:<\/strong>\s*<span[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? '').join(' ') || undefined,
      humidity: htmlToLines(b.match(/Humidity:<\/strong>\s*<span[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? '').join(' ') || undefined,
    })
  }
  // The slider repeats; keep the first entry per place.
  return out.filter((c, i) => out.findIndex((o) => o.place === c.place) === i)
}

// ---------- forecast ----------

export interface Forecast {
  issued: string
  next24h: string[]
}

export function parseForecast(html: string): Forecast | undefined {
  const b = parseBulletin(html)
  if (!b) return undefined
  const issued = b.lines.find((l) => /issued at|émis à|emis a|publiées? à/i.test(l)) ?? b.lines[0] ?? ''
  const i = b.lines.findIndex((l) => /forecast for the next 24 hours|prévisions? pour les prochaines 24 heures/i.test(l))
  const end = b.lines.findIndex((l, j) => j > i && /^(high tides|low tides|sunrise|marées?|lever du soleil|pleine mer|basse mer)/i.test(l))
  const next24h = i >= 0 ? b.lines.slice(i + 1, end > 0 ? end : undefined) : []
  return { issued, next24h }
}
