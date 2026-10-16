import type { CycloneLevel, RainLevel, WarningSnapshot } from '../rules/types'

/**
 * Demo scenarios, shown alongside live MMS data so every warning state can be reviewed.
 * Times are relative to "now" so freshness and "what changed" behave realistically.
 */
export interface Scenario {
  id: string
  label: string
  build: (now: number) => WarningSnapshot
}

const min = 60 * 1000

function snap(
  cyclone: CycloneLevel,
  rain: RainLevel,
  opts: { ageMin?: number; prev?: [CycloneLevel, RainLevel, number]; rainArea?: string } = {},
) {
  return (now: number): WarningSnapshot => {
    const age = opts.ageMin ?? 4
    return {
      cyclone,
      rain,
      rainArea: opts.rainArea,
      issuedAt: new Date(now - (age + 20) * min).toISOString(),
      fetchedAt: new Date(now - age * min).toISOString(),
      previous: opts.prev && {
        cyclone: opts.prev[0],
        rain: opts.prev[1],
        changedAt: new Date(now - opts.prev[2] * min).toISOString(),
      },
    }
  }
}

export const SCENARIOS: Scenario[] = [
  { id: 'clear', label: 'No warning', build: snap('none', 'none') },
  { id: 'c1', label: 'Class I issued', build: snap('class1', 'none', { prev: ['none', 'none', 35] }) },
  { id: 'c2', label: 'Class II', build: snap('class2', 'none', { prev: ['class1', 'none', 50] }) },
  {
    id: 'c2rain',
    label: 'Class II + heavy rain warning',
    build: snap('class2', 'heavyRainWarning', { prev: ['class2', 'heavyRainWatch', 15], rainArea: 'the South and Central Plateau' }),
  },
  { id: 'c3', label: 'Class III', build: snap('class3', 'none', { prev: ['class2', 'none', 25] }) },
  { id: 'c4', label: 'Class IV', build: snap('class4', 'none', { prev: ['class3', 'none', 90] }) },
  { id: 'watch', label: 'Heavy rain watch', build: snap('none', 'heavyRainWatch', { prev: ['none', 'none', 30] }) },
  { id: 'trw', label: 'Torrential rain warning', build: snap('none', 'torrentialRainWarning', { prev: ['none', 'heavyRainWarning', 40] }) },
  {
    id: 'lifted-rain',
    label: 'Cyclone lifted, torrential rain still on',
    build: snap('safetyBulletin', 'torrentialRainWarning', { prev: ['class3', 'torrentialRainWarning', 20] }),
  },
  { id: 'after', label: 'All warnings ended', build: snap('terminated', 'none', { prev: ['safetyBulletin', 'none', 60] }) },
  { id: 'stale', label: 'Class II, data 2 h old', build: snap('class2', 'none', { ageMin: 125 }) },
]
