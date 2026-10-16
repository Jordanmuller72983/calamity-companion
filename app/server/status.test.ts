import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseConditions, parseRainfall, parseStationExtras } from './mms.ts'
import { buildAreas } from './status.ts'

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8')

describe('areas strip', () => {
  const latest = fixture('2026-10-16-latest-weather.html')
  const areas = buildAreas(parseRainfall(latest), parseStationExtras(latest), parseConditions(fixture('2026-10-16-home.html')))

  it('has one entry per place, with readable names', () => {
    expect(areas.length).toBeGreaterThan(20)
    expect(areas.every((a) => a.name.length > 1)).toBe(true)
    expect(new Set(areas.map((a) => a.name)).size).toBe(areas.length)
  })

  it('merges station data with current conditions (Port Louis (Line Barracks) = Port Louis)', () => {
    const pl = areas.find((a) => a.name === 'Port Louis')
    expect(pl).toMatchObject({ tempNow: 27, sky: 'partly cloudy day' })
    expect(pl?.rain24h).toBeTypeOf('number') // from "Port Louis (Line Barracks)"
    // Wind is only measured at some stations (Port Louis had none that day).
    expect(areas.find((a) => a.name === 'Vacoas')).toMatchObject({ tempNow: 19 })
    expect(areas.find((a) => a.name === 'Vacoas')?.windMaxKmh).toBeTypeOf('number')
  })

  it('puts the wettest and windiest places first', () => {
    const score = (a: (typeof areas)[number]) => (a.rain3h ?? 0) * 4 + (a.rain24h ?? 0) + (a.windMaxKmh ?? 0) / 10
    expect(score(areas[0])).toBeGreaterThanOrEqual(score(areas[areas.length - 1]))
  })
})
