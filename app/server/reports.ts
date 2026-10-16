// Community reports (flooded road, fallen tree, power line down…), sent from the app during cyclone warnings.
// Stored with server/store.ts: Upstash Redis when deployed, local files in development.
// People email the authorities themselves from the app (mailto link with To and the message filled in).

import { randomUUID } from 'node:crypto'
import { REPORT_KINDS, type Report, type ReportKind } from '../src/data/liveTypes.ts'
import { del, getJson, hit, setJson } from './store.ts'

const KEEP_HOURS = 72
// Photos are resized to 1280 px JPEG in the browser (typically 150–400 KB); Upstash accepts up to 1 MB per value.
const MAX_PHOTO_BYTES = 900_000
const LIMIT_PER_HOUR = 10
const LIST_KEY = 'reports'

// Mauritius and Rodrigues.
const inMauritius = (lat: number, lon: number) =>
  (lat >= -20.6 && lat <= -19.9 && lon >= 57.2 && lon <= 57.9) || (lat >= -19.85 && lat <= -19.6 && lon >= 63.3 && lon <= 63.55)

const recent = (reports: Report[]) => {
  const since = Date.now() - KEEP_HOURS * 3600 * 1000
  return reports.filter((r) => new Date(r.createdAt).getTime() > since)
}

/** Reports sent from demo/archive mode are tests: they never appear on the live map, and live ones never appear in demos. */
export const isTestReport = (r: Report) => r.warning.startsWith('demo:')

export type ReportScope = 'live' | 'demo'

export async function listReports(scope: ReportScope = 'live'): Promise<Report[]> {
  return recent((await getJson<Report[]>(LIST_KEY)) ?? [])
    .filter((r) => (scope === 'demo' ? isTestReport(r) : !isTestReport(r)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** Remove a report (and its photo). Returns false if it didn't exist. */
export async function deleteReport(id: string): Promise<boolean> {
  const all = (await getJson<Report[]>(LIST_KEY)) ?? []
  const keep = all.filter((r) => r.id !== id)
  if (keep.length === all.length) return false
  await setJson(LIST_KEY, keep)
  await del(`photo:${id}`)
  return true
}

export class ReportError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

export async function addReport(body: unknown, ip: string, warning: string): Promise<Report> {
  if ((await hit(`ratelimit:${ip}`, 3600)) > LIMIT_PER_HOUR) throw new ReportError('Too many reports from this device. Try again later.', 429)

  const b = (body ?? {}) as Record<string, unknown>
  const kind = String(b.kind) as ReportKind
  const lat = Number(b.lat)
  const lon = Number(b.lon)
  if (!REPORT_KINDS.includes(kind)) throw new ReportError('Unknown report type.')
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !inMauritius(lat, lon)) throw new ReportError('The location must be in Mauritius or Rodrigues.')
  const note = typeof b.note === 'string' ? b.note.trim().slice(0, 500) : undefined

  const id = randomUUID()
  let photo: string | undefined
  if (typeof b.photo === 'string' && b.photo.startsWith('data:image/jpeg;base64,')) {
    const base64 = b.photo.slice(23)
    const bytes = Buffer.from(base64, 'base64')
    if (bytes.length > MAX_PHOTO_BYTES) throw new ReportError('Photo is too large.')
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new ReportError('Photo must be a JPEG image.')
    await setJson(`photo:${id}`, base64, KEEP_HOURS * 3600)
    photo = `/api/reports/photo/${id}.jpg`
  }

  const report: Report = { id, kind, lat: Number(lat.toFixed(5)), lon: Number(lon.toFixed(5)), note: note || undefined, photo, createdAt: new Date().toISOString(), warning }
  const all = recent((await getJson<Report[]>(LIST_KEY)) ?? [])
  await setJson(LIST_KEY, [report, ...all].slice(0, 2000))
  return report
}

export async function getPhoto(name: string): Promise<Buffer | undefined> {
  const id = name.match(/^([0-9a-f-]{36})\.jpg$/)?.[1]
  if (!id) return undefined
  const base64 = await getJson<string>(`photo:${id}`)
  return base64 ? Buffer.from(base64, 'base64') : undefined
}
