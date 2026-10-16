import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  classify,
  cycloneFromText,
  parseBanner,
  parseBulletin,
  parseConditions,
  parseForecast,
  parseIssued,
  parseRainfall,
  parseStationExtras,
  rainFromText,
} from './mms.ts'

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8')

describe('real MMS pages, 16 Oct 2026 (no warning in force)', () => {
  const home = fixture('2026-10-16-home.html')

  it('banner has only a news item, so no warning', () => {
    const items = parseBanner(home)
    expect(items[0].text).toMatch(/WISER/)
    const c = classify(items)
    expect(c.cyclone).toBe('none')
    expect(c.rain).toBe('none')
    expect(c.others).toHaveLength(1)
  })

  it('cyclone and rain bulletin pages are empty', () => {
    expect(parseBulletin(fixture('2026-10-16-cyclone-en.html'))?.lines ?? []).toEqual([])
    expect(parseBulletin(fixture('2026-10-16-trw.html'))).toBeUndefined()
  })

  it('reads rainfall per station', () => {
    const r = parseRainfall(fixture('2026-10-16-latest-weather.html'))
    expect(r.last24h?.period).toMatch(/15 October 2026 07 AM to 16 October 2026 07 AM/)
    expect(r.last3h?.period).toMatch(/Last 3hrs Rainfall/)
    expect(r.last24h?.stations.length).toBe(16) // 25 stations on the page, 9 with no reading that day
    expect(r.last24h?.stations.some((s) => s.station === 'Grand Bassin')).toBe(false)
    expect(r.last24h?.stations.filter((s) => s.station.startsWith('Port Louis'))).toHaveLength(1)
    expect(r.last24h?.stations.find((s) => s.station === 'Bell Village')?.mm).toBe(0.1)
  })

  it('reads max wind, temperature and humidity per station', () => {
    const x = parseStationExtras(fixture('2026-10-16-latest-weather.html'))
    expect(x.wind.find((w) => w.station === 'Bell Village')?.kmh).toBe(37)
    expect(x.temp.find((w) => w.station === 'Bell Village')).toMatchObject({ max: 28, min: 22 })
    expect(x.humidity.find((w) => w.station === 'Bell Village')?.pct).toBe(46)
    expect(x.windPeriod).toMatch(/Maximum wind speed/)
  })

  it('reads current conditions', () => {
    const c = parseConditions(home)
    const vacoas = c.find((x) => x.place === 'Vacoas')
    expect(vacoas).toMatchObject({ tempC: 19, sky: 'partly cloudy day', humidity: '83%' })
  })

  it('reads the 24 h forecast', () => {
    const f = parseForecast(fixture('2026-10-16-forecast-en.html'))
    expect(f?.issued).toMatch(/04h30 on Friday 16 October 2026/)
    expect(f?.next24h[0]).toMatch(/^Partly cloudy/)
  })

  it('reads the French forecast', () => {
    const f = parseForecast(fixture('2026-10-16-forecast-fr.html'))
    expect(f?.issued).toMatch(/émis à 04h30 vendredi 16 octobre 2026/)
    expect(f?.next24h[0]).toMatch(/^Mi-couvert/)
    expect(f?.next24h.some((l) => /Marées/.test(l))).toBe(false)
  })
})

describe('7-day forecast', () => {
  it('reads one card per day', async () => {
    const { parseSevenDay } = await import('./mmsPages.ts')
    const days = parseSevenDay(fixture('2026-10-16-7day.html'))
    expect(days).toHaveLength(7)
    expect(days[0]).toMatchObject({ date: 'Fri, Oct 16', condition: 'Few passing showers mainly E, S & CP', maxC: 29, minC: 16, probability: 'High' })
    expect(days[0].detail).toMatch(/Wind ESE25G50/)
  })
})

describe('archived MMS pages', () => {
  it('Cyclone Belal, 16 Jan 2024: Class IV (banner in French, Rodrigues item ignored)', () => {
    const html = fixture('2024-01-16-belal-cyclone-en.html')
    const items = parseBanner(html)
    expect(items.map((i) => i.text)).toEqual([
      'Un avertissement de cyclone de Classe 4 est en vigueur a Maurice.',
      'Une veille de fortes pluies à Rodrigues.',
    ])
    const b = parseBulletin(html)!
    expect(b.title).toBe('Cyclone Warning Bulletin Mauritius (English Version)')
    expect(b.issuedAt).toBe('2024-01-16T00:10:00.000Z')
    const c = classify(items, b.lines)
    expect(c.cyclone).toBe('class4')
    expect(c.rain).toBe('none')
  })

  it('heavy rain warning with a region', () => {
    const c = classify(parseBanner(fixture('2024-01-06-heavy-rain-warning.html')))
    expect(c).toMatchObject({ rain: 'heavyRainWarning', rainArea: 'the South and Central Plateau' })
  })

  it('heavy rain watch', () => {
    expect(classify(parseBanner(fixture('2024-01-06-heavy-rain-watch.html'))).rain).toBe('heavyRainWatch')
  })
})

describe('text classifiers', () => {
  it.each([
    ['A cyclone warning class II is in force in Mauritius', 'class2'],
    ['A cyclone warning class III is in force in Mauritius', 'class3'],
    ['Un avertissement de cyclone de Classe 1 est en vigueur a Maurice.', 'class1'],
    ['A cyclone warning class I is in force in Rodrigues', undefined],
    ['The cyclone warning class III has been lifted. A safety bulletin is in force.', 'safetyBulletin'],
  ])('%s', (text, level) => expect(cycloneFromText(text)).toBe(level))

  it.each([
    ['A torrential rain warning is in force in Mauritius', 'torrentialRainWarning'],
    ['Avis de pluies torrentielles en vigueur a Maurice', 'torrentialRainWarning'],
    ['Heavy Rain Watch for Mauritius', 'heavyRainWatch'],
    ['The torrential rain warning has been lifted', undefined],
  ])('%s', (text, level) => expect(rainFromText(text)?.level).toBe(level))

  it('parses issue time as Mauritius time', () => {
    expect(parseIssued('Second cyclone bulletin issued at 16h10 on Monday 15 January 2024.')).toBe('2024-01-15T12:10:00.000Z')
  })
})
