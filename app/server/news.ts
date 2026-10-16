// Press headlines from L'Express and Defimedia, read live.
// - Defimedia: its own RSS feed (defimedia.info/rss.xml).
// - L'Express: lexpress.mu blocks automated requests (HTTP 403), so we use Google News' public RSS search
//   restricted to site:lexpress.mu. Only headlines and links are used; readers open the article on the paper's site.
// Two uses:
//   1. Weather/warning headlines, shown next to the app's guidance so people can cross-check it.
//   2. Service disruptions not caused by weather (unrest, curfew…), see disruptions.ts.
// Neither changes the warning rules.

import type { NewsItem, NewsStatus, NewsTopic } from '../src/data/liveTypes.ts'
import { findDisruptions } from './disruptions.ts'
import { decodeEntities } from './mms.ts'

const TTL = 10 * 60 * 1000
const MAX_AGE_DAYS = 4

const googleNews = (q: string) => 'https://news.google.com/rss/search?hl=fr&gl=MU&ceid=MU:fr&q=' + encodeURIComponent(q)

const FEEDS: { source: NewsItem['source']; url: string }[] = [
  { source: 'Defimedia', url: 'https://defimedia.info/rss.xml' },
  {
    source: "L'Express",
    url: googleNews('site:lexpress.mu (cyclone OR classe OR "pluies torrentielles" OR "fortes pluies" OR inondation OR météo OR avertissement OR CWA OR réservoir) when:4d'),
  },
  {
    source: "L'Express",
    url: googleNews('site:lexpress.mu (metro OR métro OR autobus OR NLTA OR couvre-feu OR écoles OR "transport public") when:3d'),
  },
]

// Must mention weather/warnings to count as a weather headline.
const WEATHER = /cyclone|classe\s*(1|2|3|4|i{1,3}|iv)\b|avertissement|avis de|pluies? torrentielles?|fortes pluies|averses|inondation|inond[ée]|crue|météo|meteo|\bmms\b|vents? violents?|rafales|houle|bulletin de sécurité|intempéries|glissement de terrain|réservoir|cwa|sécheresse|coupure d.eau/i

const TOPICS: Record<NewsTopic, RegExp> = {
  school: /école|écoles|scolaire|élèves|collèges?|établissements? (scolaires|d.enseignement)|ministère de l.éducation|universités?|classes? suspendues/i,
  work: /travail|travailleurs|employés|bureaux|secteur privé|fonction publique|employeurs|congé|workers'? rights/i,
  transport: /autobus|\bbus\b|metro|métro|transport|\bnta\b|circulation|routes?|autoroute|aéroport|vols?\b/i,
  warning: /cyclone|classe|avertissement|pluies torrentielles|fortes pluies|avis de|bulletin|mms|météo/i,
  water: /cwa|réservoir|eau potable|coupure d.eau|distribution d.eau|sécheresse|mare.aux.vacoas/i,
}

const FR_DAYS: Record<string, string> = { lun: 'Mon', mar: 'Tue', mer: 'Wed', jeu: 'Thu', ven: 'Fri', sam: 'Sat', dim: 'Sun' }

/** Defimedia dates are in French ("ven, 16 Oct 2026 10:14:12 +0400"). */
export function parseRssDate(s: string): string | undefined {
  const en = s.trim().replace(/^(\p{L}+)\.?,/u, (_, d: string) => `${FR_DAYS[d.toLowerCase().slice(0, 3)] ?? d},`)
  const t = Date.parse(en)
  return Number.isNaN(t) ? undefined : new Date(t).toISOString()
}

const tag = (xml: string, name: string) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'))
  return m ? decodeEntities(m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '')).trim() : undefined
}

export interface RawItem {
  title: string
  url: string
  source: NewsItem['source']
  publishedAt: string
}

/** Every item in a feed. */
export function parseRssAll(xml: string, source: NewsItem['source']): RawItem[] {
  const items: RawItem[] = []
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    let title = tag(m[1], 'title') ?? ''
    const url = tag(m[1], 'link') ?? ''
    const publishedAt = parseRssDate(tag(m[1], 'pubDate') ?? '')
    if (!title || !url || !publishedAt) continue
    // Google News appends " - lexpress.mu" to titles; skip its section pages ("Recherche", the home page).
    title = title.replace(/\s+-\s+lexpress\.mu$/i, '')
    if (/^(recherche|lexpress\.mu)\b/i.test(title)) continue
    items.push({ title, url: url.replace(/^http:\/\/defimedia/, 'https://defimedia'), source, publishedAt })
  }
  return items
}

/** Weather/warning headlines only, tagged by topic. */
export function weatherItems(items: RawItem[]): NewsItem[] {
  return items
    .filter((i) => WEATHER.test(i.title))
    .map((i) => ({ ...i, topics: (Object.keys(TOPICS) as NewsTopic[]).filter((k) => TOPICS[k].test(i.title)) }))
}

export const parseRss = (xml: string, source: NewsItem['source']) => weatherItems(parseRssAll(xml, source))

let cache: { at: number; status: NewsStatus } | undefined

export async function getNews(): Promise<NewsStatus> {
  if (cache && Date.now() - cache.at < TTL) return cache.status
  const errors: string[] = []
  const lists = await Promise.all(
    FEEDS.map(async (f) => {
      try {
        const res = await fetch(f.url, {
          headers: { 'User-Agent': 'CalamityCompanion/0.1 (personal public-safety project)' },
          signal: AbortSignal.timeout(20_000),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return parseRssAll(await res.text(), f.source)
      } catch (e) {
        errors.push(`${f.source}: ${(e as Error).message}`)
        return []
      }
    }),
  )
  const since = Date.now() - MAX_AGE_DAYS * 86400000
  const seen = new Set<string>()
  const all = lists
    .flat()
    .filter((i) => new Date(i.publishedAt).getTime() > since)
    .filter((i) => {
      const k = i.title.toLowerCase().replace(/\W+/g, ' ').slice(0, 60)
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))

  const status: NewsStatus = {
    fetchedAt: new Date().toISOString(),
    items: weatherItems(all).slice(0, 30),
    disruptions: findDisruptions(all),
    errors,
  }
  cache = { at: Date.now(), status }
  return status
}
