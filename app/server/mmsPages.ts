// Reads every page in the MMS website menu, live, and turns it into simple content blocks the app can render.
// The menu itself is read live from the MMS home page, so new MMS pages show up automatically.

import { HTMLElement, parse } from 'node-html-parser'
import { MMS_BASE, decodeEntities, fixMojibake } from './mms.ts'

export type Block =
  | { type: 'h'; text: string }
  | { type: 'p'; text: string }
  | { type: 'table'; rows: string[][] }
  | { type: 'img'; src: string; alt?: string }
  | { type: 'animation'; frames: string[]; label?: string }
  | { type: 'iconmap'; background: string; width: number; height: number; periods: { name: string; icons: { x: number; y: number; title: string; src: string }[] }[] }
  | { type: 'days'; days: ForecastDay[] }
  | { type: 'link'; href: string; text: string }
  | { type: 'empty'; text: string }

export interface ForecastDay {
  date: string
  condition: string
  icon?: string
  maxC?: number
  minC?: number
  probability?: string
  detail?: string
}

export interface MmsPage {
  path: string
  title: string
  url: string
  fetchedAt: string
  blocks: Block[]
}

export interface MenuPage {
  path: string
  title: string
}
export interface MenuSection {
  title: string
  pages: MenuPage[]
}

const TEXT_TTL = 5 * 60 * 1000
const INFO_TTL = 6 * 60 * 60 * 1000
const MENU_TTL = 24 * 60 * 60 * 1000

export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'CalamityCompanion/0.1 (personal public-safety project)' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  return new TextDecoder('utf-8').decode(await res.arrayBuffer())
}

const clean = (s: string) => fixMojibake(decodeEntities(s)).replace(/[\s ]+/g, ' ').trim()
const toPath = (url: string) => url.replace(/^https?:\/\/metservice\.intnet\.mu\/?/i, '')
const abs = (src: string) => new URL(src.trim(), `${MMS_BASE}/`).href

/** Images are served through our own proxy: MMS is http-only and the app may be served over https. */
export const proxied = (src: string) => `/api/mms/image?src=${encodeURIComponent(abs(src))}`

// ---------- menu ----------

/** Rename the bare "English / French / Creole" bulletin entries so they make sense on their own. */
function labelFor(path: string, title: string): string {
  const m = path.match(/^cyclone-bulletin-(english|french|creole)-(mauritius|rodrigues)\.php$/)
  if (!m) return title
  const lang = { english: 'English', french: 'French', creole: 'Kreol' }[m[1]]
  return `Cyclone bulletin ${m[2] === 'mauritius' ? 'Mauritius' : 'Rodrigues'} (${lang})`
}

export function parseMenu(homeHtml: string): MenuSection[] {
  const root = parse(homeHtml)
  const sections: MenuSection[] = []
  for (const main of root.querySelectorAll('a.main')) {
    const li = main.parentNode as HTMLElement
    const pages: MenuPage[] = []
    for (const a of li.querySelectorAll('ul a')) {
      const href = a.getAttribute('href') ?? ''
      if (!/^https?:\/\/metservice\.intnet\.mu\//i.test(href) || !/\.php$/.test(href)) continue
      const path = toPath(href)
      if (!pages.some((p) => p.path === path)) pages.push({ path, title: labelFor(path, clean(a.text)) })
    }
    if (pages.length) sections.push({ title: clean(main.text), pages })
  }
  return sections
}

let menuCache: { at: number; menu: MenuSection[] } | undefined

export async function getMenu(): Promise<MenuSection[]> {
  if (menuCache && Date.now() - menuCache.at < MENU_TTL) return menuCache.menu
  const menu = parseMenu(await fetchText(`${MMS_BASE}/index.php`))
  if (menu.length) menuCache = { at: Date.now(), menu }
  return menu
}

/** Only pages in the live MMS menu can be requested (plus the index), so this isn't an open proxy. */
export async function isAllowedPath(path: string): Promise<boolean> {
  const menu = await getMenu()
  return menu.some((s) => s.pages.some((p) => p.path === path))
}

// ---------- page content ----------

function contentRoot(html: string): HTMLElement | undefined {
  const root = parse(html, { comment: false })
  const left = root.querySelector('.left_content')
  if (!left) return undefined
  // Drop the warning banner and the app advert MMS shows on some pages.
  left.querySelectorAll('.warning, script, style').forEach((n) => n.remove())
  left.querySelectorAll('a[href*="myt.mu"]').forEach((n) => n.remove())
  return left
}

function tableRows(table: HTMLElement): string[][] {
  // Use only rows that belong to this table, not to nested tables.
  const rows = table.querySelectorAll('tr').filter((tr) => tr.closest('table') === table)
  return rows
    .map((tr) => tr.querySelectorAll('td, th').filter((c) => c.closest('tr') === tr).map((c) => clean(c.text)))
    .filter((r) => r.some(Boolean))
}

function walk(node: HTMLElement, out: Block[]) {
  for (const child of node.childNodes) {
    if (!(child instanceof HTMLElement)) {
      const text = clean(child.rawText)
      if (text.length > 1) out.push({ type: 'p', text })
      continue
    }
    const tag = child.tagName?.toLowerCase()
    if (tag === 'h1') continue // page title, shown separately
    if (/^h[2-6]$/.test(tag)) {
      const text = clean(child.text)
      if (text) out.push({ type: 'h', text })
      continue
    }
    if (tag === 'table') {
      // Some MMS pages nest a whole table inside one cell: use the innermost table that has the data.
      const inner = child.querySelectorAll('table')
      const target = inner.length && tableRows(child).length <= 2 ? inner[inner.length - 1] : child
      const rows = tableRows(target)
      if (rows.length) out.push({ type: 'table', rows })
      continue
    }
    if (tag === 'img') {
      const src = child.getAttribute('src')
      if (src && !/icons-|banner/.test(src)) out.push({ type: 'img', src: proxied(src), alt: child.getAttribute('title') ?? undefined })
      continue
    }
    if (tag === 'iframe') {
      const src = child.getAttribute('src')
      if (src) out.push({ type: 'link', href: abs(src), text: 'Open on MMS website' })
      continue
    }
    if (tag === 'a') {
      const href = child.getAttribute('href') ?? ''
      const text = clean(child.text)
      if (/\.pdf$/i.test(href)) out.push({ type: 'link', href: abs(href), text: text || 'PDF' })
      else if (child.querySelector('img')) walk(child, out)
      else if (text) out.push({ type: 'p', text })
      continue
    }
    if (tag === 'p' || tag === 'li' || tag === 'span' || tag === 'strong') {
      if (child.querySelector('table, img, iframe, div, h1, h2, h3')) walk(child, out)
      else {
        const text = clean(child.text)
        if (text) out.push({ type: tag === 'strong' ? 'h' : 'p', text })
      }
      continue
    }
    walk(child, out)
  }
}

/** Generic reader: headings, paragraphs, tables, images and PDF links in page order. */
export function parseContent(html: string): { title: string; blocks: Block[] } {
  const left = contentRoot(html)
  if (!left) return { title: '', blocks: [] }
  const h1 = left.querySelector('h1')
  const title = h1 ? clean(h1.text) : ''
  const blocks: Block[] = []
  walk(left, blocks)
  // Collapse consecutive duplicates (MMS repeats bulletin headlines) and stray separators.
  const out = blocks.filter((b, i) => {
    const prev = blocks[i - 1]
    if (b.type === 'p' && /^[-–|•\s]*$/.test(b.text)) return false
    return !(prev && 'text' in prev && 'text' in b && prev.type === b.type && prev.text === b.text)
  })
  return { title, blocks: out }
}

/** Satellite/radar animation pages list their frames in <img> tags or a JS array. */
export function parseFrames(html: string): string[] {
  const urls = [...html.matchAll(/["'](https?:\/\/metservice\.intnet\.mu\/mmsimages\/[^"']+\.(?:jpe?g|png|gif))["']/gi)].map((m) => m[1])
  return [...new Set(urls)].map(proxied)
}

/** "Weather map" pages position forecast icons over a map of Mauritius. */
export function parseIconMap(html: string) {
  const root = parse(html)
  const bgDiv = root.querySelectorAll('div').find((d) => /background-image:url\('([^']+)'\)/.test(d.getAttribute('style') ?? ''))
  const style = bgDiv?.getAttribute('style') ?? ''
  const bg = style.match(/background-image:url\('([^']+)'\)/)?.[1]
  const width = Number(style.match(/width:(\d+)px/)?.[1] ?? 658)
  const height = Number(style.match(/height:(\d+)px/)?.[1] ?? 511)
  const icons = (bgDiv?.querySelectorAll(':scope > div') ?? []).flatMap((d) => {
    const s = d.getAttribute('style') ?? ''
    const top = Number(s.match(/top:\s*(\d+)px/)?.[1])
    const left = Number(s.match(/left:\s*(\d+)px/)?.[1])
    const img = d.querySelector('img')
    if (!img || Number.isNaN(top) || Number.isNaN(left)) return []
    return [{ x: left / width, y: top / height, title: img.getAttribute('title') ?? '', src: proxied(img.getAttribute('src') ?? '') }]
  })
  return { background: bg ? proxied(bg) : '', width, height, icons }
}

/** 7-day probabilistic forecast: one block per day. */
export function parseSevenDay(html: string): ForecastDay[] {
  return html
    .split('class="fdaynew"')
    .slice(1)
    .map((chunk) => {
      const text = (re: RegExp) => {
        const m = chunk.match(re)
        return m ? clean(m[1].replace(/<[^>]+>/g, ' ')) : undefined
      }
      const temps = [...chunk.matchAll(/class="ftemp">\s*(-?\d+)/g)].map((m) => Number(m[1]))
      const icon = chunk.match(/class="weather_icon"><img src="([^"]+)"/)?.[1]
      return {
        date: text(/^>([^<]*)</) ?? '',
        condition: text(/class="fconditionnew">([\s\S]*?)<\/p>/) ?? '',
        icon: icon ? proxied(icon) : undefined,
        maxC: temps[0],
        minC: temps[1],
        probability: text(/Prob:\s*<span class="fgrey">([\s\S]*?)<\/span>/),
        detail: text(/<p><span class="fgrey">([\s\S]*?)<\/span><\/p>/),
      }
    })
    .filter((d) => d.date)
}

// ---------- page loader with per-page cache ----------

const pageCache = new Map<string, { at: number; page: MmsPage }>()

const isInfoPage = (path: string) => /\/|climate|sun-moon|names|system|precautions/.test(path) && !/bulletin/.test(path)

export async function getPage(path: string): Promise<MmsPage> {
  const ttl = isInfoPage(path) ? INFO_TTL : TEXT_TTL
  const hit = pageCache.get(path)
  if (hit && Date.now() - hit.at < ttl) return hit.page

  const url = `${MMS_BASE}/${path}`
  const html = await fetchText(url)
  const { title, blocks } = parseContent(html)

  // Pages whose real content lives in an embedded page.
  if (path === 'maps.php') {
    const periods = await Promise.all(
      [
        ['Morning', 'morning-new.php'],
        ['Afternoon', 'afternoon-new.php'],
        ['Night', 'night-new.php'],
      ].map(async ([name, p]) => {
        try {
          return { name, ...parseIconMap(await fetchText(`${MMS_BASE}/${p}`)) }
        } catch {
          return undefined
        }
      }),
    )
    const ok = periods.filter((p): p is NonNullable<typeof p> => !!p && p.icons.length > 0)
    blocks.length = 0
    if (ok.length)
      blocks.push({
        type: 'iconmap',
        background: ok[0].background,
        width: ok[0].width,
        height: ok[0].height,
        periods: ok.map((p) => ({ name: p.name, icons: p.icons })),
      })
  }
  if (path === 'probabilistic-forecast.php') {
    const days = parseSevenDay(html)
    if (days.length) blocks.splice(0, blocks.length, { type: 'days', days })
  }
  for (const [i, b] of blocks.entries()) {
    if (b.type === 'link' && /(satellite|radar)-images\.php$/.test(b.href)) {
      const frames = parseFrames(await fetchText(b.href).catch(() => ''))
      blocks[i] = frames.length
        ? { type: 'animation', frames, label: /radar/.test(b.href) ? 'Radar' : 'Satellite' }
        : { type: 'empty', text: 'MMS is not publishing images for this animation right now.' }
    }
  }
  if (!blocks.some((b) => b.type !== 'h')) blocks.push({ type: 'empty', text: 'Nothing is published on this page right now.' })

  const page: MmsPage = { path, title: title || path, url, fetchedAt: new Date().toISOString(), blocks }
  pageCache.set(path, { at: Date.now(), page })
  return page
}
