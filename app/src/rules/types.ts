export type Lang = 'en' | 'fr' | 'mfe'
export type Text = Record<Lang, string>

// Official MMS terms: Class I–IV, then a Safety Bulletin (lifts III/IV), then Termination.
export type CycloneLevel = 'none' | 'class1' | 'class2' | 'class3' | 'class4' | 'safetyBulletin' | 'terminated'
export type RainLevel = 'none' | 'heavyRainWatch' | 'heavyRainWarning' | 'torrentialRainWarning'
export type WarningId =
  | 'none'
  | Exclude<CycloneLevel, 'none'>
  | Exclude<RainLevel, 'none'>

export const TOPICS = ['school', 'work', 'transport', 'outside'] as const
export type Topic = (typeof TOPICS)[number]
export type TopicStatus = 'ok' | 'caution' | 'stop'

/** What a rule rests on: the law, a ministry communiqué issued each time, past events, nothing found, or a normal day. */
export type Basis = 'law' | 'communique' | 'practice' | 'unclear' | 'normal'

export interface TopicRule {
  status: TopicStatus
  basis: Basis
  /** Keys into RulesFile.sources */
  sources: string[]
  detail: Text
}

export interface WarningRule {
  kind: 'none' | 'cyclone' | 'rain'
  severity: number
  shortName: Text
  headline: Text
  instruction: Text
  topics: Record<Topic, TopicRule>
  doNow: Text[]
  sourceIds: string[]
  verified: boolean
}

export interface RulesFile {
  version: string
  reviewedOn: string | null
  notes: string
  sources: Record<string, { name: string; url: string | null }>
  warnings: Record<WarningId, WarningRule>
}

/** What the official MMS feed says right now. Cyclone and rain warnings are independent signals. */
export interface WarningSnapshot {
  cyclone: CycloneLevel
  rain: RainLevel
  /** Region named in a heavy rain warning, e.g. "the South and Central Plateau". */
  rainArea?: string
  issuedAt: string
  fetchedAt: string
  previous?: {
    cyclone: CycloneLevel
    rain: RainLevel
    changedAt: string
  }
}
