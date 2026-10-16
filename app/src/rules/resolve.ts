import rulesJson from './warning-rules.json'
import {
  TOPICS,
  type CycloneLevel,
  type RainLevel,
  type RulesFile,
  type Text,
  type Topic,
  type Basis,
  type TopicStatus,
  type WarningId,
  type WarningRule,
  type WarningSnapshot,
} from './types'

export const rules = rulesJson as RulesFile

const STATUS_RANK: Record<TopicStatus, number> = { ok: 0, caution: 1, stop: 2 }
const STALE_AFTER_MS = 30 * 60 * 1000

export interface ResolvedTopic {
  status: TopicStatus
  detail: Text
  basis: Basis
  sources: { name: string; url: string | null }[]
  from: WarningId
}

export interface ResolvedWarning {
  primaryId: WarningId
  primary: WarningRule
  cyclone: CycloneLevel
  rain: RainLevel
  topics: Record<Topic, ResolvedTopic>
  doNow: Text[]
  /** Each signal that changed since the previous bulletin, e.g. cyclone Class III → Lifted. */
  changes: { signal: 'cyclone' | 'rain'; from: Text; to: Text }[]
  changedAt?: string
  /** Cyclone warning was lowered or lifted while a rain warning is still in force. */
  rainStillOn: boolean
  stale: boolean
  verified: boolean
}

function activeIds(cyclone: CycloneLevel, rain: RainLevel): WarningId[] {
  const ids: WarningId[] = []
  if (cyclone !== 'none') ids.push(cyclone)
  if (rain !== 'none') ids.push(rain)
  return ids.length ? ids : ['none']
}

/** Highest severity wins. On a tie, rain wins: flooding is the more immediate danger. */
function pickPrimary(ids: WarningId[]): WarningId {
  return ids.reduce((best, id) => {
    const a = rules.warnings[best]
    const b = rules.warnings[id]
    if (b.severity > a.severity) return id
    if (b.severity === a.severity && b.kind === 'rain') return id
    return best
  })
}

const shortName = (level: CycloneLevel | RainLevel) => rules.warnings[level].shortName

const CYCLONE_RANK: Record<CycloneLevel, number> = {
  none: 0,
  terminated: 0,
  safetyBulletin: 0,
  class1: 1,
  class2: 2,
  class3: 3,
  class4: 4,
}
const isCycloneActive = (c: CycloneLevel) => CYCLONE_RANK[c] > 0
const cycloneRank = (c: CycloneLevel) => CYCLONE_RANK[c]

export function resolveWarning(snapshot: WarningSnapshot, now = Date.now()): ResolvedWarning {
  const { cyclone, rain, previous } = snapshot
  const ids = activeIds(cyclone, rain)
  const primaryId = pickPrimary(ids)
  const primary = rules.warnings[primaryId]

  const topics = Object.fromEntries(
    TOPICS.map((topic) => {
      const winner = ids.reduce((best, id) => {
        const a = rules.warnings[best].topics[topic]
        const b = rules.warnings[id].topics[topic]
        if (STATUS_RANK[b.status] > STATUS_RANK[a.status]) return id
        if (STATUS_RANK[b.status] === STATUS_RANK[a.status] && rules.warnings[id].kind === 'rain') return id
        return best
      })
      const rule = rules.warnings[winner].topics[topic]
      const sources = rule.sources.map((id) => rules.sources[id]).filter(Boolean)
      return [topic, { status: rule.status, detail: rule.detail, basis: rule.basis, sources, from: winner }]
    }),
  ) as Record<Topic, ResolvedTopic>

  const changes: ResolvedWarning['changes'] = []
  if (previous) {
    if (previous.cyclone !== cyclone)
      changes.push({ signal: 'cyclone', from: shortName(previous.cyclone), to: shortName(cyclone) })
    if (previous.rain !== rain) changes.push({ signal: 'rain', from: shortName(previous.rain), to: shortName(rain) })
  }

  const cycloneWentDown =
    !!previous && isCycloneActive(previous.cyclone) && cycloneRank(cyclone) < cycloneRank(previous.cyclone)

  return {
    primaryId,
    primary,
    cyclone,
    rain,
    topics,
    doNow: primary.doNow.slice(0, 3),
    changes,
    changedAt: changes.length ? previous?.changedAt : undefined,
    rainStillOn: cycloneWentDown && rain !== 'none',
    stale: now - new Date(snapshot.fetchedAt).getTime() > STALE_AFTER_MS,
    verified: ids.every((id) => rules.warnings[id].verified),
  }
}
