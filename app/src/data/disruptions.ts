import type { Disruption, DisruptionState, NewsStatus } from './liveTypes.ts'
import type { ResolvedTopic } from '../rules/resolve.ts'
import type { TopicStatus } from '../rules/types.ts'

const RANK: Record<TopicStatus, number> = { ok: 0, caution: 1, stop: 2 }
const MU_OFFSET_MS = 4 * 3600 * 1000 // Mauritius is UTC+4 all year.

/** The date in Mauritius (YYYY-MM-DD) at `ms`. */
export const mauritiusDate = (ms: number) => new Date(ms + MU_OFFSET_MS).toISOString().slice(0, 10)

/** Saturday or Sunday in Mauritius: no school. */
export const isWeekend = (now: number) => [0, 6].includes(new Date(now + MU_OFFSET_MS).getUTCDay())

/**
 * What a report means today. A restart announced for a later day ("reprise lundi") is still a stoppage until then;
 * a closure for named days stops counting once they are past (undefined: no longer relevant).
 */
export function stateToday(d: Disruption, now: number): DisruptionState | undefined {
  const today = mauritiusDate(now)
  if (d.resumesOn) {
    if (today < d.resumesOn) return 'stopped'
    if (d.normalOn && today < d.normalOn) return 'limited'
    return 'resumed'
  }
  if (d.until && today > d.until) return undefined
  return d.state
}

export interface TopicDisruption {
  status: TopicStatus
  reports: Disruption[]
}

/**
 * Press-reported disruptions that change what the School and Buses & Metro tiles should say right now,
 * whatever the weather. Only problems count ("resumed" reports are shown but don't raise the status).
 * Each report's `state` is what it means today.
 */
export function disruptionsByTopic(news?: NewsStatus, now = Date.now()): { school?: TopicDisruption; transport?: TopicDisruption } {
  const today = (news?.disruptions ?? []).flatMap((d) => {
    const state = stateToday(d, now)
    return state ? [{ ...d, state }] : []
  })
  const metro = today.find((d) => d.service === 'metro')
  const bus = today.find((d) => d.service === 'bus')
  const school = today.find((d) => d.service === 'school')
  const bad = (d?: Disruption) => !!d && d.state !== 'resumed'

  const out: { school?: TopicDisruption; transport?: TopicDisruption } = {}
  if (bad(metro) || bad(bus)) {
    const bothStopped = metro?.state === 'stopped' && bus?.state === 'stopped'
    out.transport = { status: bothStopped ? 'stop' : 'caution', reports: [metro, bus].filter((d): d is Disruption => !!d) }
  }
  if (bad(school)) out.school = { status: 'stop', reports: [school!] }
  return out
}

/** Merge a press disruption into a tile: the stricter status wins, and the reports are attached. */
export function withDisruption(topic: ResolvedTopic, d?: TopicDisruption): ResolvedTopic & { press?: Disruption[] } {
  if (!d) return topic
  return { ...topic, status: RANK[d.status] > RANK[topic.status] ? d.status : topic.status, press: d.reports }
}

/** Raise a tile to at least `status`. */
export const atLeast = (status: TopicStatus, min: TopicStatus): TopicStatus => (RANK[min] > RANK[status] ? min : status)

/**
 * Curfew headlines from the last 48 hours, newest first. A curfew is usually nightly ("lifted" each morning),
 * so we show what the press says rather than guessing whether it is on right now.
 */
export function curfewReports(news?: NewsStatus, now = Date.now()): Disruption[] {
  return (news?.disruptions ?? []).filter((d) => d.service === 'curfew' && now - new Date(d.publishedAt).getTime() < 48 * 3600 * 1000)
}

/**
 * What the curfew headlines say, put together: hours and last day from whichever report gives them.
 * In force when a report says it is in place (extended, maintained…) and its last day hasn't passed. Morning
 * "levée du couvre-feu" headlines don't end it: the curfew comes back each night until the press says otherwise.
 */
export function curfewSummary(reports: Disruption[], now = Date.now()) {
  const hours = reports.find((d) => d.hours)?.hours
  const until = reports.find((d) => d.until)?.until
  const past = !!until && mauritiusDate(now) > until
  const inForce = !past && reports.some((d) => d.state === 'active' || d.state === 'limited')
  return { hours, until, past, inForce }
}

export const curfewInForce = (reports: Disruption[], now = Date.now()) => curfewSummary(reports, now).inForce
