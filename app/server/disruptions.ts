// Service disruptions that aren't about the weather (unrest, curfews, strikes, breakdowns), read from the press.
// Headlines from the last 3 days are classified by service and state. The app shows them as
// "press reports" with the headline, source and age: a headline is not an official status.
// Days named in a headline ("reprise des classes ce lundi 19 octobre") are kept as dates, so the app can tell
// that a restart announced for Monday means the service is still stopped today.

import type { Disruption, DisruptionService, DisruptionState } from '../src/data/liveTypes.ts'
import { mauritiusDate } from '../src/data/disruptions.ts'
import type { RawItem } from './news.ts'

const MAX_AGE_HOURS = 72

const SERVICE: Record<DisruptionService, RegExp> = {
  metro: /metro express|\bm[ée]tro\b|light rail/i,
  bus: /autobus|\bbus\b|\bnlta\b/i,
  // "classe" alone is too loose ("cyclone de classe 2"): only in phrases about lessons.
  school: /écoles?\b|ecoles?\b|\bclasses\b|pas de classe\b|établissements scolaires|élèves|collèges?|universit/i,
  curfew: /couvre-feu|curfew/i,
}

// First match wins. Explicit "no service" and planned (future) restarts come first: telling people a service
// runs when it doesn't strands them, so we err towards "stopped".
const STATES: [DisruptionState, RegExp][] = [
  ['stopped', /pas de service|pas de classes?\b|pas d.école|ne circule(ra)? pas|à l.arrêt|reprise (des opérations )?prévue|reprendra (dans|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|la semaine)/i],
  // "Les derniers autobus à 19 heures…, reprise à 5 heures": an early stop tonight, whatever restarts after.
  ['early', /derni(er|ère)s? (autobus|bus|métros?|trams?|rames?)[^,]* à \d+ ?(h|heures)/i],
  // Whole words only: "entreprises" contains "reprise".
  ['resumed', /\breprise\b|\breprend(ront)?\b|\brouvr|réouverture|de nouveau en service|retour à la normale|levée du couvre-feu|praticables/i],
  ['early', /(prendront fin|cesseront|s.arrêteront|arrêt de tous les services[^,]*) à \d+ ?(h|heures)/i],
  ['stopped', /à l.arrêt|\barrêt\b|suspendu|suspension|pas opérationnel|n.est pas opérationnel|ne circule|cesseront|prendront fin|fin des services|fermée?s?\b|\bfermeture\b|pas de classes?\b|pas d.école|interrompu|paralysé/i],
  ['limited', /au ralenti|perturbé|perturbation|réduit|partiel|limité/i],
  ['active', /prolongé|reconduit|maintenu|mainteni|dès \d+ ?h|instauré|décrété|en vigueur/i],
]

// Not about services in Mauritius, or not a status (court cases, arrests…).
const IGNORE = /pakistan|inde\b|france|réunion|madagascar|procès|tribunal|\bcour\b|arrêtée?s?\b|arrestations?|poursuivi|détention|infractions|non-respect/i

const stateOf = (text: string) => STATES.find(([, re]) => re.test(text))?.[0]

const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const DAY_RE = new RegExp(`\\b(demain|${WEEKDAYS.join('|')})(?:\\s+(\\d{1,2})(?:\\s+(${MONTHS.join('|')}))?)?`, 'gi')
const RESUME_RE = /\breprise\b|\breprend(ra|ront)?\b|\brouvr|réouverture|de nouveau en service/i
const NORMAL_RE = /retour à la normale/i

const DAY_MS = 86400000
const addDays = (ymd: string, n: number) => new Date(Date.parse(ymd + 'T00:00:00Z') + n * DAY_MS).toISOString().slice(0, 10)

/** Every day named in `text`, as Mauritius dates, read relative to the day the headline was published. */
export function datesIn(text: string, publishedAt: string): string[] {
  const pub = mauritiusDate(Date.parse(publishedAt))
  const pubDay = new Date(pub + 'T00:00:00Z')
  const out: string[] = []
  for (const m of text.matchAll(DAY_RE)) {
    const word = m[1].toLowerCase()
    if (word === 'demain') {
      out.push(addDays(pub, 1))
    } else if (m[2]) {
      // "lundi 19 octobre", or "lundi 19" in the month it was published (or the next one).
      const month = m[3] ? MONTHS.indexOf(m[3].toLowerCase()) : pubDay.getUTCMonth()
      const year = pubDay.getUTCFullYear() + (m[3] && month < pubDay.getUTCMonth() - 6 ? 1 : 0)
      let d = Date.UTC(year, month, Number(m[2]))
      if (!m[3] && d < pubDay.getTime() - 7 * DAY_MS) d = Date.UTC(year, month + 1, Number(m[2]))
      out.push(new Date(d).toISOString().slice(0, 10))
    } else {
      // A bare weekday is the next one on or after the publication day ("ce vendredi" on a Friday is that day).
      out.push(addDays(pub, (WEEKDAYS.indexOf(word) - pubDay.getUTCDay() + 7) % 7))
    }
  }
  return out
}

/** When a reported change takes effect, from the days named in the headline. */
export function datesOf(title: string, publishedAt: string): Pick<Disruption, 'resumesOn' | 'normalOn' | 'until'> {
  const firstDayAfter = (re: RegExp) => {
    const m = title.match(re)
    return m ? datesIn(title.slice(m.index! + m[0].length), publishedAt)[0] : undefined
  }
  const resumesOn = firstDayAfter(RESUME_RE)
  if (resumesOn) {
    const normalOn = firstDayAfter(NORMAL_RE)
    return normalOn && normalOn > resumesOn ? { resumesOn, normalOn } : { resumesOn }
  }
  // A closure for named days ("pas de classes jeudi et vendredi") only holds until the last of them.
  const days = datesIn(title, publishedAt).sort()
  return days.length ? { until: days[days.length - 1] } : {}
}

/** Every service a headline reports on, with its state. Each part of the headline is read on its own. */
export function classifyDisruption(title: string): { service: DisruptionService; state: DisruptionState }[] {
  if (IGNORE.test(title)) return []
  const services = (Object.keys(SERVICE) as DisruptionService[]).filter((s) => SERVICE[s].test(title))
  const parts = title.split(/\s*[,;:|]\s*|\s+[–-]\s+/)
  const out: { service: DisruptionService; state: DisruptionState }[] = []
  for (const service of services) {
    const own = parts.filter((p) => SERVICE[service].test(p)).map(stateOf).find(Boolean)
    // A headline about one service only: its state can be anywhere in the title.
    let state = own ?? (services.length === 1 ? stateOf(title) : undefined)
    // Any recent headline about the curfew is worth showing: it is a nightly measure.
    if (!state && service === 'curfew') state = 'active'
    if (!state) continue
    if (service === 'curfew' && (state === 'stopped' || state === 'early')) state = 'resumed'
    if (service !== 'curfew' && state === 'active') continue
    out.push({ service, state })
  }
  return out
}

const two = (n: string | undefined) => (n ?? '00').padStart(2, '0')
// "de 22 h à 4 h 30", "22h à 4h30", "de 20 h 30 ce mercredi à 5 heures jeudi matin", "ant 8h30 ek 5h".
const HOURS_RE = /\b(\d{1,2}) ?h(?:eures?)? ?(\d{2})?(?!\d)\D{0,20}?\s(?:à|a|ek|-|–)\s+(\d{1,2}) ?h(?:eures?)? ?(\d{2})?(?!\d)/i
const UNTIL_RE = /jusqu.(?:à|au)\s/i
const WEEKEND_RE = /\bweek-?end\b/i

/** Curfew hours and last day, when the headline gives them. */
export function curfewFacts(title: string, publishedAt: string): Pick<Disruption, 'hours' | 'until'> {
  const out: Pick<Disruption, 'hours' | 'until'> = {}
  const h = title.match(HOURS_RE)
  if (h && Number(h[1]) < 24 && Number(h[3]) < 24) out.hours = `${two(h[1])}:${two(h[2])}–${two(h[3])}:${two(h[4])}`
  const u = title.match(UNTIL_RE)
  const day = u ? datesIn(title.slice(u.index! + u[0].length), publishedAt)[0] : undefined
  if (day) out.until = day
  else if (WEEKEND_RE.test(title)) out.until = datesIn('dimanche', publishedAt)[0]
  return out
}

// A decision about the curfew itself. Morning "levée du couvre-feu" is not one: it comes back each night.
const CURFEW_DECISION = /maintenu|mainteni|prolongé|reconduit|étendu|instauré|décrété|en vigueur|horaires|zones concernées|définitiv|supprimé|abrogé/i
// About the curfew's effects, not the curfew: events, the economy, the law, policing.
const CURFEW_SIDE = /spectacle|concert|report[ée]|économie|vie nocturne|commer|\bloi\b|législation|sanctions|renforcement|business|entreprises|immersion|mobilis|incidents|autobus|passagers|recettes|\[live\]/i
const CURFEW_WINDOW_HOURS = 48

/**
 * The two curfew headlines worth showing: the newest decision, then one that adds what it lacks (hours or last day).
 * Side stories only fill in when nothing better was published.
 */
export function pickCurfew(found: Disruption[]): Disruption[] {
  const informative = (d: Disruption) => !!d.hours || !!d.until || CURFEW_DECISION.test(d.title)
  const tiers = [
    found.filter((d) => informative(d) && !CURFEW_SIDE.test(d.title)),
    found.filter((d) => informative(d) && CURFEW_SIDE.test(d.title)),
    found.filter((d) => !informative(d)),
  ].flat()
  const first = tiers[0]
  if (!first) return []
  const adds = (d: Disruption) => (!first.hours && !!d.hours) || (!first.until && !!d.until)
  const second = tiers.find((d) => d !== first && adds(d)) ?? tiers.find((d) => d !== first)
  return second ? [first, second] : [first]
}

/** Newest press report per service from the last 3 days; for curfews, the two most useful from the last 2 days. */
export function findDisruptions(items: RawItem[], now = Date.now()): Disruption[] {
  const since = now - MAX_AGE_HOURS * 3600 * 1000
  const curfewSince = now - CURFEW_WINDOW_HOURS * 3600 * 1000
  const out: Disruption[] = []
  const curfew: Disruption[] = []
  for (const i of [...items].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))) {
    const at = new Date(i.publishedAt).getTime()
    if (at < since) continue
    for (const c of classifyDisruption(i.title)) {
      const base = { ...c, title: i.title, url: i.url, source: i.source, publishedAt: i.publishedAt }
      if (c.service === 'curfew') {
        if (at >= curfewSince) curfew.push({ ...base, ...curfewFacts(i.title, i.publishedAt) })
        continue
      }
      if (out.some((d) => d.service === c.service)) continue
      out.push({ ...base, ...datesOf(i.title, i.publishedAt) })
    }
  }
  return [...out, ...pickCurfew(curfew)]
}

// Headlines people need to act on today, beyond the curfew, schools and transport (which have their own lines).
const KEY = new RegExp(
  [
    // An actual cut, not any story naming the CWA or CEB.
    'coupures? d.eau|pas d.eau|eau coupée|interruption (de la )?(distribution|fourniture) d.eau',
    'coupures? (de courant|d.électricité)|pannes? (de courant|d.électricité)|black-?out|délestage',
    'routes? (fermée|bloquée|coupée|inondée)s?|déviation|circulation (interdite|bloquée|perturbée)',
    'avis de (cyclone|fortes pluies|pluies torrentielles)|cyclone de classe|avertissement|bulletin de sécurité|vigilance',
    'évacu|centres? de refuge|\\bgrève\\b|congé public|jour férié|état d.urgence|confinement',
  ].join('|'),
  'i',
)
const KEY_MAX_AGE_HOURS = 24

/** Up to three other important headlines from the last 24 hours, newest first. */
export function keyHeadlines(items: RawItem[], now = Date.now()): RawItem[] {
  const since = now - KEY_MAX_AGE_HOURS * 3600 * 1000
  return [...items]
    .filter((i) => new Date(i.publishedAt).getTime() >= since && KEY.test(i.title) && !IGNORE.test(i.title))
    .filter((i) => !Object.values(SERVICE).some((re) => re.test(i.title)))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, 3)
}
