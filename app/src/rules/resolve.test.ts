import { describe, expect, it } from 'vitest'
import { SCENARIOS } from '../data/scenarios'
import { resolveWarning, rules } from './resolve'
import { TOPICS, type Lang, type WarningSnapshot } from './types'

const NOW = Date.parse('2026-01-20T12:00:00Z')
const snap = (s: Partial<WarningSnapshot>): WarningSnapshot => ({
  cyclone: 'none',
  rain: 'none',
  issuedAt: new Date(NOW - 10 * 60000).toISOString(),
  fetchedAt: new Date(NOW - 2 * 60000).toISOString(),
  ...s,
})

describe('resolveWarning', () => {
  it('Class II: schools closed, buses still running', () => {
    const w = resolveWarning(snap({ cyclone: 'class2' }), NOW)
    expect(w.topics.school.status).toBe('stop')
    expect(w.topics.transport.status).toBe('ok')
  })

  it('takes the most restrictive status per topic across cyclone and rain', () => {
    const w = resolveWarning(snap({ cyclone: 'class2', rain: 'torrentialRainWarning' }), NOW)
    expect(w.topics.outside.status).toBe('stop') // Class II says "careful"; torrential rain says "stay in"
    expect(w.topics.outside.from).toBe('torrentialRainWarning')
    expect(w.topics.school.status).toBe('stop')
    expect(w.primaryId).toBe('torrentialRainWarning')
  })

  it('rain wins a severity tie, so "do not travel" beats "get home"', () => {
    const w = resolveWarning(snap({ cyclone: 'class3', rain: 'torrentialRainWarning' }), NOW)
    expect(w.primaryId).toBe('torrentialRainWarning')
    expect(w.topics.outside.from).toBe('torrentialRainWarning')
  })

  it('flags a lifted cyclone warning while torrential rain continues', () => {
    const w = resolveWarning(
      snap({
        cyclone: 'safetyBulletin',
        rain: 'torrentialRainWarning',
        previous: { cyclone: 'class3', rain: 'torrentialRainWarning', changedAt: new Date(NOW).toISOString() },
      }),
      NOW,
    )
    expect(w.rainStillOn).toBe(true)
    expect(w.topics.outside.status).toBe('stop')
  })

  it('does not flag rainStillOn when the cyclone warning goes up', () => {
    const w = resolveWarning(
      snap({ cyclone: 'class3', rain: 'heavyRainWarning', previous: { cyclone: 'class2', rain: 'heavyRainWarning', changedAt: '' } }),
      NOW,
    )
    expect(w.rainStillOn).toBe(false)
  })

  it('marks data older than 30 minutes as stale', () => {
    expect(resolveWarning(snap({ fetchedAt: new Date(NOW - 31 * 60000).toISOString() }), NOW).stale).toBe(true)
    expect(resolveWarning(snap({}), NOW).stale).toBe(false)
  })

  it('reports what changed', () => {
    const w = resolveWarning(
      snap({ cyclone: 'class3', previous: { cyclone: 'class2', rain: 'none', changedAt: '' } }),
      NOW,
    )
    expect(w.changes).toHaveLength(1)
    expect(w.changes[0]).toMatchObject({ signal: 'cyclone', from: { en: 'Class II' }, to: { en: 'Class III' } })
  })

  it('reports the cyclone change, not the unchanged rain headline', () => {
    const w = resolveWarning(
      snap({
        cyclone: 'safetyBulletin',
        rain: 'torrentialRainWarning',
        previous: { cyclone: 'class3', rain: 'torrentialRainWarning', changedAt: '' },
      }),
      NOW,
    )
    expect(w.changes).toEqual([{ signal: 'cyclone', from: rules.warnings.class3.shortName, to: rules.warnings.safetyBulletin.shortName }])
  })

  it('every scenario resolves', () => {
    for (const s of SCENARIOS) expect(() => resolveWarning(s.build(NOW), NOW)).not.toThrow()
  })
})

describe('rules evidence', () => {
  for (const [id, rule] of Object.entries(rules.warnings)) {
    it(`${id}: every claim has a source, and "verified" means nothing is unconfirmed`, () => {
      for (const [topic, t] of Object.entries(rule.topics)) {
        if (t.basis === 'law' || t.basis === 'communique' || t.basis === 'practice')
          expect(t.sources.length, `${id}.${topic}`).toBeGreaterThan(0)
        for (const s of t.sources) expect(rules.sources[s], `${id}.${topic} → ${s}`).toBeDefined()
      }
      expect(rule.verified).toBe(Object.values(rule.topics).every((t) => t.basis !== 'unclear'))
    })
  }

  it('matches the Workers’ Rights Act: Class III, IV and the safety bulletin allow paid absence; Class II does not', () => {
    for (const id of ['class3', 'class4', 'safetyBulletin'] as const) {
      expect(rules.warnings[id].topics.work.basis).toBe('law')
      expect(rules.warnings[id].topics.work.status).toBe('stop')
    }
    expect(rules.warnings.class3.topics.work.detail.en).toMatch(/3 times your hourly rate/)
    expect(rules.warnings.class2.topics.work.status).toBe('ok')
  })

  it('does not claim the May 2026 torrential rain protocol is already law', () => {
    expect(rules.warnings.torrentialRainWarning.topics.work.detail.en).toMatch(/not yet law/)
  })
})

describe('rules file', () => {
  const langs: Lang[] = ['en', 'fr', 'mfe']
  for (const [id, rule] of Object.entries(rules.warnings)) {
    it(`${id} has every topic and text in all languages`, () => {
      const texts = [rule.shortName, rule.headline, rule.instruction, ...rule.doNow, ...TOPICS.map((t) => rule.topics[t].detail)]
      for (const text of texts) for (const l of langs) expect(text[l], `${id} ${l}`).toBeTruthy()
      expect(rule.doNow.length).toBeLessThanOrEqual(3)
      for (const src of rule.sourceIds) expect(rules.sources[src], src).toBeDefined()
    })
  }
})
