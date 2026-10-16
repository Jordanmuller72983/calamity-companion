import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bearingFromWord, distanceKm, parsePosition } from './cyclone.ts'
import { parseBulletin } from './mms.ts'
import { percentagesFromText } from './water.ts'

describe('cyclone position from the MMS bulletin', () => {
  it('Belal, 16 Jan 2024 04h10', () => {
    const b = parseBulletin(readFileSync(join(__dirname, 'fixtures', '2024-01-16-belal-cyclone-en.html'), 'utf8'))!
    const p = parsePosition(b.lines)!
    expect(p).toMatchObject({
      name: 'Belal',
      intensity: 'Severe Tropical Storm',
      lat: -21.5,
      lon: 57.5,
      movement: { towards: 'easterly', bearing: 90, speedKmh: 15 },
      where: 'about 90 km almost to the south of Souillac'.replace(/^about /, ''),
      at: '04h00',
    })
    expect(distanceKm(p)).toBeGreaterThan(140)
    expect(distanceKm(p)).toBeLessThan(160)
  })

  it.each([
    ['westerly', 270],
    ['south-westerly', 225],
    ['west-south-westerly', 247.5],
    ['north-north-easterly', 22.5],
    ['southerly', 180],
  ])('%s → %d°', (w, deg) => expect(bearingFromWord(w)).toBe(deg))
})

describe('reservoir levels from CWA communiqué text', () => {
  it('reads the 30 July 2026 communiqué wording', () => {
    const text = "Mare aux Vacoas, principal réservoir du pays, est actuellement à 41% de sa capacité. La Nicolière pourrait être à sec"
    expect(percentagesFromText(text)).toEqual({ 'mare-aux-vacoas': 41 })
  })
  it('handles decimals with commas and several reservoirs', () => {
    expect(percentagesFromText('Mare-aux-Vacoas : 35,7 % ; Midlands : 81,1 % ; La Ferme 38.1%')).toEqual({
      'mare-aux-vacoas': 35.7,
      midlands: 81.1,
      'la-ferme': 38.1,
    })
  })
})
