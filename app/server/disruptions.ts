// Service disruptions that aren't about the weather (unrest, curfews, strikes, breakdowns), read from the press.
// Headlines from the last 3 days are classified by service and state. The app shows them as
// "press reports" with the headline, source and age: a headline is not an official status.

import type { Disruption, DisruptionService, DisruptionState } from '../src/data/liveTypes.ts'
import type { RawItem } from './news.ts'

const MAX_AGE_HOURS = 72

const SERVICE: Record<DisruptionService, RegExp> = {
  metro: /metro express|\bm[ée]tro\b|light rail/i,
  bus: /autobus|\bbus\b|\bnlta\b/i,
  school: /écoles?\b|ecoles?\b|\bclasses\b|établissements scolaires|élèves|collèges?|universit/i,
  curfew: /couvre-feu|curfew/i,
}

// First match wins. Explicit "no service" and planned (future) restarts come first: telling people a service
// runs when it doesn't strands them, so we err towards "stopped".
const STATES: [DisruptionState, RegExp][] = [
  ['stopped', /pas de service|pas de classes|pas d.école|ne circule(ra)? pas|à l.arrêt|reprise (des opérations )?prévue|reprendra (dans|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|la semaine)/i],
  // Whole words only: "entreprises" contains "reprise".
  ['resumed', /\breprise\b|\breprend(ront)?\b|\brouvr|réouverture|de nouveau en service|retour à la normale|levée du couvre-feu|praticables/i],
  ['early', /(prendront fin|cesseront|s.arrêteront|arrêt de tous les services[^,]*) à \d+ ?(h|heures)/i],
  ['stopped', /à l.arrêt|\barrêt\b|suspendu|suspension|pas opérationnel|n.est pas opérationnel|ne circule|cesseront|prendront fin|fin des services|fermée?s?\b|pas de classes|pas d.école|interrompu|paralysé/i],
  ['limited', /au ralenti|perturbé|perturbation|réduit|partiel|limité/i],
  ['active', /prolongé|reconduit|maintenu|mainteni|dès \d+ ?h|instauré|décrété|en vigueur/i],
]

// Not about services in Mauritius, or not a status (court cases, arrests…).
const IGNORE = /pakistan|inde\b|france|réunion|madagascar|procès|tribunal|\bcour\b|arrêtée?s?\b|arrestations?|poursuivi|détention|infractions|non-respect/i

const stateOf = (text: string) => STATES.find(([, re]) => re.test(text))?.[0]

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

/** Newest press report per service (two for curfews), from the last 3 days. */
export function findDisruptions(items: RawItem[], now = Date.now()): Disruption[] {
  const since = now - MAX_AGE_HOURS * 3600 * 1000
  const out: Disruption[] = []
  for (const i of [...items].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))) {
    if (new Date(i.publishedAt).getTime() < since) continue
    for (const c of classifyDisruption(i.title)) {
      const already = out.filter((d) => d.service === c.service).length
      if (already >= (c.service === 'curfew' ? 2 : 1)) continue
      out.push({ ...c, title: i.title, url: i.url, source: i.source, publishedAt: i.publishedAt })
    }
  }
  return out
}
