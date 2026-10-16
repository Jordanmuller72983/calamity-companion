import { ErrorBlock, Segmented, Skeleton } from 'antd-mobile'
import { LeftOutline, RightOutline } from 'antd-mobile-icons'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAgoText } from '../data/mapLabels'
import { useJson } from '../data/useJson'
import './MmsScreen.css'

// Mirrors server/mmsPages.ts
type Block =
  | { type: 'h'; text: string }
  | { type: 'p'; text: string }
  | { type: 'table'; rows: string[][] }
  | { type: 'img'; src: string; alt?: string }
  | { type: 'animation'; frames: string[]; label?: string }
  | { type: 'iconmap'; background: string; width: number; height: number; periods: { name: string; icons: { x: number; y: number; title: string; src: string }[] }[] }
  | { type: 'days'; days: { date: string; condition: string; icon?: string; maxC?: number; minC?: number; probability?: string; detail?: string }[] }
  | { type: 'link'; href: string; text: string }
  | { type: 'empty'; text: string }

interface MmsPage {
  path: string
  title: string
  url: string
  fetchedAt: string
  blocks: Block[]
}
interface MenuSection {
  title: string
  pages: { path: string; title: string }[]
}

function Animation({ frames, label }: { frames: string[]; label?: string }) {
  const { t } = useTranslation()
  const [i, setI] = useState(frames.length - 1)
  const [playing, setPlaying] = useState(true)
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => setI((x) => (x + 1) % frames.length), 900)
    return () => clearInterval(id)
  }, [playing, frames.length])
  return (
    <figure className="anim">
      <img src={frames[i]} alt={`${label ?? ''} ${i + 1}/${frames.length}`} />
      <figcaption>
        <button className="anim-btn" onClick={() => setPlaying(!playing)}>{playing ? t('mms.pause') : t('mms.play')}</button>
        <input
          type="range"
          min={0}
          max={frames.length - 1}
          value={i}
          onChange={(e) => {
            setPlaying(false)
            setI(Number(e.target.value))
          }}
          aria-label={t('mms.frame', { i: i + 1, n: frames.length })}
        />
        <span>{t('mms.frame', { i: i + 1, n: frames.length })}</span>
      </figcaption>
    </figure>
  )
}

function IconMap({ block }: { block: Extract<Block, { type: 'iconmap' }> }) {
  const [period, setPeriod] = useState(0)
  const p = block.periods[period]
  return (
    <div className="iconmap-wrap">
      <Segmented value={period} onChange={(v) => setPeriod(Number(v))} options={block.periods.map((x, i) => ({ label: x.name, value: i }))} />
      <div className="iconmap" style={{ aspectRatio: `${block.width} / ${block.height}`, backgroundImage: `url("${block.background}")` }}>
        {p.icons.map((ic, i) => (
          <img key={i} src={ic.src} alt={ic.title} title={ic.title} style={{ left: `${ic.x * 100}%`, top: `${ic.y * 100}%` }} />
        ))}
      </div>
    </div>
  )
}

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="mms-blocks">
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'h':
            return <h3 key={i}>{b.text}</h3>
          case 'p':
            return <p key={i}>{b.text}</p>
          case 'table':
            return (
              <div key={i} className="mms-table-wrap">
                <table className="mms-table">
                  <tbody>
                    {b.rows.map((r, ri) => (
                      <tr key={ri} className={ri === 0 ? 'head' : undefined}>
                        {r.map((c, ci) => (ri === 0 ? <th key={ci}>{c}</th> : <td key={ci}>{c}</td>))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          case 'img':
            return <img key={i} className="mms-img" src={b.src} alt={b.alt ?? ''} loading="lazy" />
          case 'animation':
            return <Animation key={i} frames={b.frames} label={b.label} />
          case 'iconmap':
            return <IconMap key={i} block={b} />
          case 'days':
            return (
              <ul key={i} className="days">
                {b.days.map((d) => (
                  <li key={d.date} className="day">
                    <div className="day-date">{d.date}</div>
                    {d.icon && <img src={d.icon} alt="" />}
                    <div className="day-temps">
                      <strong>{d.maxC}°</strong> <span>{d.minC}°</span>
                    </div>
                    <div className="day-cond">{d.condition}</div>
                    {d.probability && <div className={`day-prob prob-${d.probability.toLowerCase()}`}>{d.probability}</div>}
                    {d.detail && <p className="day-detail">{d.detail.replace(d.condition, '').replace(/^\s*\./, '').trim()}</p>}
                  </li>
                ))}
              </ul>
            )
          case 'link':
            return (
              <a key={i} className="mms-link" href={b.href} target="_blank" rel="noreferrer">
                {b.text} ↗
              </a>
            )
          case 'empty':
            return <p key={i} className="mms-empty">{b.text}</p>
        }
      })}
    </div>
  )
}

export function MmsScreen({ initialPath }: { initialPath?: string }) {
  const { t } = useTranslation()
  const ago = useAgoText()
  const menu = useJson<MenuSection[]>('/api/mms/menu')
  // Laptops show list and page side by side, so open a page straight away.
  const [path, setPathState] = useState<string | undefined>(
    () =>
      initialPath ??
      new URLSearchParams(window.location.search).get('page') ??
      (window.matchMedia('(min-width: 1024px)').matches ? 'current-cyclone.php' : undefined),
  )
  // Keep the open page in the URL so it can be shared (?tab=mms&page=satellite-imagery.php).
  const setPath = (p: string | undefined) => {
    setPathState(p)
    const url = new URL(window.location.href)
    if (p) url.searchParams.set('page', p)
    else url.searchParams.delete('page')
    window.history.replaceState(null, '', url)
  }
  const [openSection, setOpenSection] = useState<string | undefined>()
  const page = useJson<MmsPage>(path ? `/api/mms/page?path=${encodeURIComponent(path)}` : null, 5 * 60 * 1000)

  const sectionOf = (p?: string) => menu.data?.find((s) => s.pages.some((x) => x.path === p))?.title
  const current = openSection ?? sectionOf(path) ?? menu.data?.[1]?.title ?? menu.data?.[0]?.title

  return (
    <div className={`mms ${path ? 'has-page' : ''}`}>
      <nav className="mms-nav" aria-label={t('mms.title')}>
        <h1 className="page-title">{t('mms.title')}</h1>
        <p className="mms-sub">{t('mms.subtitle')}</p>
        {menu.loading && <Skeleton.Paragraph lineCount={8} animated />}
        {menu.error && <ErrorBlock status="disconnected" title={t('mms.error')} description={menu.error} />}
        <div className="mms-sections">
          {menu.data?.map((s) => (
            <section key={s.title} className={`mms-section ${current === s.title ? 'open' : ''}`}>
              <button className="mms-section-btn" onClick={() => setOpenSection(current === s.title ? '' : s.title)} aria-expanded={current === s.title}>
                {s.title}
                <span className="count">{s.pages.length}</span>
              </button>
              {current === s.title && (
                <ul>
                  {s.pages.map((p) => (
                    <li key={p.path}>
                      <button className={`mms-page-btn ${p.path === path ? 'active' : ''}`} onClick={() => setPath(p.path)}>
                        {p.title}
                        <RightOutline />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </nav>

      <article className="mms-page">
        {path && (
          <button className="mms-back" onClick={() => setPath(undefined)}>
            <LeftOutline /> {t('mms.back')}
          </button>
        )}
        {!path && <p className="mms-hint">{t('mms.subtitle')}</p>}
        {path && page.loading && <Skeleton.Paragraph lineCount={10} animated />}
        {path && page.error && <ErrorBlock status="disconnected" title={t('mms.error')} description={page.error} />}
        {path && page.data && page.data.path === path && (
          <>
            <header className="mms-page-head">
              <span className="mms-crumb">{sectionOf(path)}</span>
              <h2>{page.data.title}</h2>
              <p className="mms-meta">
                {t('mms.read', { ago: ago(page.data.fetchedAt) })} · {t('mms.original')}{' '}
                <a href={page.data.url} target="_blank" rel="noreferrer">
                  {t('mms.open')} ↗
                </a>
              </p>
            </header>
            <Blocks blocks={page.data.blocks} />
          </>
        )}
      </article>
    </div>
  )
}
