import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseRss, parseRssDate } from './news.ts'

describe('press feeds', () => {
  it('reads French RSS dates (Defimedia)', () => {
    expect(parseRssDate('ven, 16 Oct 2026 10:14:12 +0400')).toBe('2026-10-16T06:14:12.000Z')
    expect(parseRssDate('Wed, 14 Oct 2026 06:02:00 GMT')).toBe('2026-10-14T06:02:00.000Z')
  })

  it('keeps only weather/warning headlines from the real Defimedia feed', () => {
    const items = parseRss(readFileSync(join(__dirname, 'fixtures', '2026-10-16-defimedia-rss.xml'), 'utf8'), 'Defimedia')
    // 156 items in the feed that day; only the CWA one is about weather/water.
    expect(items.map((i) => i.title)).toContain('Malgré le couvre-feu : la CWA mobilisée pour assurer l’approvisionnement en eau')
    expect(items.some((i) => /autobus prendront fin/.test(i.title))).toBe(false) // curfew, not weather
    expect(items.every((i) => i.url.startsWith('https://defimedia.info/'))).toBe(true)
  })

  it('tags topics and cleans Google News titles (L’Express)', () => {
    const xml = `<rss><channel>
      <item><title>Cyclone Imelda : classe 2, les écoles fermées et les autobus en service - lexpress.mu</title><link>https://news.google.com/x</link><pubDate>Mon, 12 Jan 2026 08:00:00 GMT</pubDate></item>
      <item><title>Recherche - lexpress.mu</title><link>https://news.google.com/y</link><pubDate>Mon, 12 Jan 2026 08:00:00 GMT</pubDate></item>
    </channel></rss>`
    const items = parseRss(xml, "L'Express")
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('Cyclone Imelda : classe 2, les écoles fermées et les autobus en service')
    expect(items[0].topics).toEqual(expect.arrayContaining(['school', 'transport', 'warning']))
  })
})
