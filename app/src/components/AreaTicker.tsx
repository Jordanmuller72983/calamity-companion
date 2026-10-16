import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AreaReading } from '../data/liveTypes'
import './AreaTicker.css'

const rainLevel = (mm3?: number, mm24?: number) =>
  (mm3 ?? 0) >= 50 || (mm24 ?? 0) >= 100 ? 'stop' : (mm3 ?? 0) >= 20 || (mm24 ?? 0) >= 50 ? 'caution' : 'ok'
// 120 km/h gusts is the MMS cyclone criterion; 60 km/h is when things start to fly.
const windLevel = (kmh?: number) => ((kmh ?? 0) >= 120 ? 'stop' : (kmh ?? 0) >= 60 ? 'caution' : 'ok')

function AreaCard({ a, duplicate }: { a: AreaReading; duplicate?: boolean }) {
  const { t } = useTranslation()
  const rl = rainLevel(a.rain3h, a.rain24h)
  const wl = windLevel(a.windMaxKmh)
  return (
    <li className={`area ${duplicate ? 'area-dup' : ''}`} aria-hidden={duplicate || undefined}>
      <div className="area-head">
        <span className="area-name">{a.name}</span>
        {a.tempNow !== undefined ? <span className="area-temp">{a.tempNow}°</span> : a.tempMax !== undefined && <span className="area-temp small">{a.tempMax}°/{a.tempMin}°</span>}
      </div>
      {a.sky && <div className="area-sky">{a.sky.replace(/ day| night/, '')}</div>}
      <div className={`area-row lv-${rl}`}>
        <Drop />
        <span className="area-label">{t('areas.rain')}</span>
        <span className="area-val">
          {a.rain3h ?? '–'} <small>mm / 3 h</small>
        </span>
      </div>
      <div className="area-sub">{t('areas.day', { mm: a.rain24h ?? '–' })}</div>
      <div className={`area-row lv-${wl}`}>
        <Wind />
        <span className="area-label">{t('areas.wind')}</span>
        <span className="area-val">
          {a.windMaxKmh ?? '–'} <small>km/h</small>
        </span>
      </div>
      {a.windNow && <div className="area-sub">{t('areas.windNow', { wind: a.windNow })}</div>}
    </li>
  )
}

export function AreaTicker({ areas, periods }: { areas: AreaReading[]; periods: { rain3h?: string; rain24h?: string; wind?: string } }) {
  const { t } = useTranslation()
  const [paused, setPaused] = useState(false)
  if (!areas.length) return null
  // ~3.5 s per place, so names are readable as they pass.
  const duration = `${Math.max(areas.length * 3.5, 20)}s`

  return (
    <section className={`ticker ${paused ? 'paused' : ''}`} aria-label={t('areas.title')}>
      <header className="ticker-head">
        <h2>{t('areas.title')}</h2>
        <button className="ticker-btn" onClick={() => setPaused(!paused)} aria-pressed={paused}>
          {paused ? `▶ ${t('mms.play')}` : `❚❚ ${t('mms.pause')}`}
        </button>
      </header>
      <div className="ticker-viewport" tabIndex={0}>
        <ul className="ticker-track" style={{ animationDuration: duration }}>
          {areas.map((a) => (
            <AreaCard key={a.name} a={a} />
          ))}
          {/* Second copy for a seamless loop; hidden from screen readers. */}
          {areas.map((a) => (
            <AreaCard key={`dup-${a.name}`} a={a} duplicate />
          ))}
        </ul>
      </div>
      <p className="ticker-foot">{[periods.rain3h, periods.wind].filter(Boolean).join(' · ')}</p>
    </section>
  )
}

function Drop() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z" />
    </svg>
  )
}
function Wind() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M3 8h10a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h7" />
    </svg>
  )
}
