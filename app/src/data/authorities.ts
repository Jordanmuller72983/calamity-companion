import data from './authorities.json'
import type { ReportKind } from './liveTypes'

export interface Authority {
  id: string
  name: string
  handles: ReportKind[]
  email: string | null
  phone?: string
  whatsapp?: string
  source?: string
  notes?: string
}

export const AUTHORITIES = data.authorities as Authority[]

export const authoritiesFor = (kind: ReportKind) => AUTHORITIES.filter((a) => a.handles.includes(kind))

const KIND_FR: Record<ReportKind, string> = {
  flood: 'Route inondée',
  tree: 'Arbre tombé',
  power: 'Ligne électrique tombée',
  landslide: 'Glissement de terrain',
  water: "Pas d'eau",
  blocked: 'Route bloquée',
  other: 'Autre problème',
}
const KIND_EN: Record<ReportKind, string> = {
  flood: 'Flooded road',
  tree: 'Fallen tree',
  power: 'Power line down',
  landslide: 'Landslide',
  water: 'No water',
  blocked: 'Road blocked',
  other: 'Other problem',
}

export interface MailDraft {
  kind: ReportKind
  lat: number
  lon: number
  note?: string
  place?: string
  /** When it was reported (ISO). */
  at: string
}

/**
 * mailto: link that opens the person's own email app with To, subject and message filled in.
 * The sender ("From") is the person's own email account; a mailto link cannot and should not set it.
 */
export function mailtoLink(to: Authority[], d: MailDraft): string {
  const where = d.place ? `${d.place} (${d.lat}, ${d.lon})` : `${d.lat}, ${d.lon}`
  const when = new Date(d.at).toLocaleString('fr-FR', { timeZone: 'Indian/Mauritius', dateStyle: 'medium', timeStyle: 'short' })
  const subject = `${KIND_FR[d.kind]} / ${KIND_EN[d.kind]} – ${d.place ?? where}`
  const body = [
    'Bonjour,',
    '',
    `Je signale : ${KIND_FR[d.kind]} / I am reporting: ${KIND_EN[d.kind]}`,
    '',
    `Lieu / Location: ${where}`,
    `Carte / Map: https://www.openstreetmap.org/?mlat=${d.lat}&mlon=${d.lon}#map=17/${d.lat}/${d.lon}`,
    `Google Maps: https://maps.google.com/?q=${d.lat},${d.lon}`,
    `Date: ${when}`,
    d.note ? `\nDétails / Details:\n${d.note}` : '',
    '',
    'Merci / Thank you.',
    '',
    '(Envoyé avec Calamity Companion / Sent with Calamity Companion)',
  ]
    .filter((l, i, a) => !(l === '' && a[i - 1] === ''))
    .join('\n')
  const emails = to.map((a) => a.email).filter(Boolean).join(',')
  return `mailto:${emails}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

/** Street / area name for the email, from OpenStreetMap. Best effort: undefined if offline or slow. */
export async function lookupPlace(lat: number, lon: number): Promise<string | undefined> {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&accept-language=fr&lat=${lat}&lon=${lon}`, {
      signal: AbortSignal.timeout(4000),
    })
    const a = ((await res.json()) as { address?: Record<string, string> }).address ?? {}
    return [a.road, a.suburb ?? a.village ?? a.town ?? a.city].filter(Boolean).join(', ') || undefined
  } catch {
    return undefined
  }
}
