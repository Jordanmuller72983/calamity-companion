import { describe, expect, it } from 'vitest'
import { AUTHORITIES, authoritiesFor, mailtoLink } from './authorities'

describe('authorities', () => {
  it('routes each kind of report to the responsible bodies', () => {
    expect(authoritiesFor('power').map((a) => a.id)).toEqual(['ceb'])
    expect(authoritiesFor('water').map((a) => a.id)).toEqual(['cwa'])
    expect(authoritiesFor('flood').map((a) => a.id)).toEqual(expect.arrayContaining(['ndrrmc', 'lda', 'rda']))
  })

  it('every authority links to the official page its details came from', () => {
    for (const a of AUTHORITIES) expect(a.source, a.id).toMatch(/^https:\/\//)
  })

  it('builds a mailto link with To, subject and message filled in', () => {
    const link = mailtoLink(authoritiesFor('power'), {
      kind: 'power',
      lat: -20.1625,
      lon: 57.5005,
      note: 'Cable on the road',
      place: 'Rue John Kennedy, Port-Louis',
      at: '2026-01-15T10:00:00.000Z',
    })
    expect(link.startsWith('mailto:ceb@ceb.mu?subject=')).toBe(true)
    const params = new URLSearchParams(link.split('?')[1])
    expect(params.get('subject')).toBe('Ligne électrique tombée / Power line down – Rue John Kennedy, Port-Louis')
    expect(params.get('body')).toContain('https://www.openstreetmap.org/?mlat=-20.1625&mlon=57.5005')
    expect(params.get('body')).toContain('Cable on the road')
  })

  it('skips bodies with no published email', () => {
    const link = mailtoLink(authoritiesFor('landslide'), { kind: 'landslide', lat: -20.3, lon: 57.5, at: '2026-01-15T10:00:00.000Z' })
    expect(link).toMatch(/^mailto:[^?]*disaster@govmu\.org/)
    expect(link.split('?')[0]).not.toContain('null')
  })
})
