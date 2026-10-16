// Reservoir fill levels. No public live feed exists (checked CWA website, CWA GIS service and the
// Water Resources Unit page, Oct 2026), so these are published figures entered by hand, each with its source.
// Update when the Water Resources Commission / CWA publish new figures.

export const LOW_PCT = 30
export const CRITICAL_PCT = 20

export interface Source {
  name: string
  url: string
}

export interface Reading {
  date: string // YYYY-MM-DD, date of the measurement
  pct: number
  approx?: boolean
  source: Source
}

export interface Reservoir {
  id: string
  name: string
  capacityMm3?: number
  serves?: string
  readings: Reading[] // oldest first
}

const DEFIMEDIA_2OCT: Source = {
  name: 'Defimedia, 2 Oct 2026',
  url: 'https://defimedia.info/mare-aux-vacoas-sous-pression-la-cwa-veut-eviter-le-seuil-critique-de-20-dici-fin-novembre',
}
const LEXPRESS_6OCT: Source = {
  name: "L'Express via AllAfrica, 6 Oct 2026 (CWA figures)",
  url: 'https://fr.allafrica.com/stories/202610060344.html',
}
const LEMAURICIEN_10OCT: Source = {
  name: 'Le Mauricien, 10 Oct 2026',
  url: 'https://www.lemauricien.com/actualites/societe/mare-aux-vacoas-a-357-30-000-m%C2%B3-deau-supplementaires-attendus-dici-fin-octobre/719924/',
}

export const RESERVOIRS: Reservoir[] = [
  {
    id: 'mare-aux-vacoas',
    name: 'Mare-aux-Vacoas',
    capacityMm3: 25.89,
    serves: 'Plaines Wilhems and the centre of the island',
    readings: [
      { date: '2026-10-02', pct: 36.8, approx: true, source: DEFIMEDIA_2OCT },
      { date: '2026-10-05', pct: 36.2, source: LEXPRESS_6OCT },
      { date: '2026-10-08', pct: 35.7, source: LEMAURICIEN_10OCT },
    ],
  },
  {
    id: 'mare-longue',
    name: 'Mare Longue',
    readings: [{ date: '2026-10-05', pct: 79.3, approx: true, source: LEXPRESS_6OCT }],
  },
]

/** All main reservoirs combined, with the same date a year earlier. */
export const ALL_RESERVOIRS = {
  date: '2026-10-08',
  pct: 57.1,
  lastYearPct: 87.4,
  source: LEMAURICIEN_10OCT,
}

/** Official outlook, shown next to the trend. */
export const OUTLOOK = {
  text: 'The Water Resources Commission expects Mare-aux-Vacoas could reach the critical 20% level around the end of November 2026.',
  source: DEFIMEDIA_2OCT,
}

export type WaterStatus = 'ok' | 'low' | 'critical'

export function waterStatus(pct: number): WaterStatus {
  if (pct < CRITICAL_PCT) return 'critical'
  if (pct < LOW_PCT) return 'low'
  return 'ok'
}

export const latest = (r: Reservoir) => r.readings[r.readings.length - 1]
