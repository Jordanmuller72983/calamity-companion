import type { Disruption, NewsStatus } from './liveTypes'
import type { ResolvedTopic } from '../rules/resolve'
import type { TopicStatus } from '../rules/types'

const RANK: Record<TopicStatus, number> = { ok: 0, caution: 1, stop: 2 }

export interface TopicDisruption {
  status: TopicStatus
  reports: Disruption[]
}

/**
 * Press-reported disruptions that change what the School and Buses & Metro tiles should say right now,
 * whatever the weather. Only problems count ("resumed" reports are shown but don't raise the status).
 */
export function disruptionsByTopic(news?: NewsStatus): { school?: TopicDisruption; transport?: TopicDisruption } {
  const ds = news?.disruptions ?? []
  const metro = ds.find((d) => d.service === 'metro')
  const bus = ds.find((d) => d.service === 'bus')
  const school = ds.find((d) => d.service === 'school')
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

/**
 * Curfew headlines from the last 48 hours, newest first. A curfew is usually nightly ("lifted" each morning),
 * so we show what the press says rather than guessing whether it is on right now.
 */
export function curfewReports(news?: NewsStatus, now = Date.now()): Disruption[] {
  return (news?.disruptions ?? []).filter((d) => d.service === 'curfew' && now - new Date(d.publishedAt).getTime() < 48 * 3600 * 1000)
}
