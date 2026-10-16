import { Skeleton } from 'antd-mobile'
import { useTranslation } from 'react-i18next'
import { CRITICAL_PCT, LOW_PCT } from '../data/reservoirs'
import type { WaterStatusLive } from '../data/liveTypes'
import { useDateFmt, waterLevel } from '../data/water'
import { Card } from './Card'

function Meter({ pct, label, sub }: { pct: number; label: string; sub?: string }) {
  const { t } = useTranslation()
  const lv = waterLevel(pct)
  return (
    <div className={`meter meter-${lv}`}>
      <div className="meter-head">
        <span className="meter-name">{label}</span>
        <span className="meter-value">
          {pct.toFixed(1)}%<span className={`pill pill-${lv}`}>{t(`water.status.${lv}`)}</span>
        </span>
      </div>
      <div
        className="meter-track"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={`${label}: ${pct}% (${t(`water.status.${lv}`)})`}
      >
        <span className="meter-fill" style={{ width: `${pct}%` }} />
        <span className="meter-mark" style={{ left: `${CRITICAL_PCT}%` }} title={`${CRITICAL_PCT}%`} />
        <span className="meter-mark" style={{ left: `${LOW_PCT}%` }} title={`${LOW_PCT}%`} />
      </div>
      {sub && <div className="meter-sub">{sub}</div>}
    </div>
  )
}

export function WaterCard({ water, onOpenMap }: { water?: WaterStatusLive; onOpenMap?: () => void }) {
  const { t } = useTranslation()
  const fmt = useDateFmt()
  const withLevels = (water?.reservoirs ?? []).filter((r) => r.readings.length)

  return (
    <Card className="water-card" title={t('water.title')} icon={<Tap />} extra={onOpenMap && <button className="link-btn" onClick={onOpenMap}>{t('waterLive.mapLink')}</button>}>
      {!water ? (
        <Skeleton.Paragraph lineCount={5} animated />
      ) : (
        <>
          <div className="meters">
            <Meter pct={water.all.pct} label={t('water.all')} sub={`${t('water.asOf', { date: fmt(water.all.date) })} · ${t('water.lastYear', { pct: water.all.lastYearPct })}`} />
            {withLevels.map((r) => {
              const last = r.readings[r.readings.length - 1]
              const first = r.readings[0]
              const d = last.pct - first.pct
              const trend = r.readings.length > 1 ? `${d > 0 ? '▲' : '▼'} ${t('water.trend', { d: Math.abs(d).toFixed(1), date: fmt(first.date) })} · ` : ''
              return (
                <Meter
                  key={r.id}
                  pct={last.pct}
                  label={r.name}
                  sub={`${trend}${t('water.asOf', { date: fmt(last.date) })}${last.from === 'cwa' ? ` (${t('waterLive.fromCwa')})` : ''}`}
                />
              )
            })}
          </div>
          <div className="meter-legend" aria-hidden="true">
            <span><i className="tick" /> {CRITICAL_PCT}% {t('water.criticalMark')}</span>
            <span><i className="tick" /> {LOW_PCT}% {t('water.lowMark')}</span>
          </div>
          <p className="outlook">{water.outlook.text}</p>
          {water.notices.length > 0 && (
            <div className="cwa-notices">
              <h3>{t('waterLive.notices')}</h3>
              <ul>
                {water.notices.slice(0, 4).map((n) => (
                  <li key={n.url}>
                    <a href={n.url} target="_blank" rel="noreferrer">{n.title}</a>
                    <span>{fmt(n.date)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <details className="sources">
            <summary>{t('sourcesTitle')}</summary>
            <p>{t('map.reservoirSource')}</p>
            <ul>
              {[...new Map([water.all.source, water.outlook.source, ...withLevels.flatMap((r) => r.readings.map((x) => x.source))].map((s) => [s.url, s])).values()].map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noreferrer">{s.name}</a>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </Card>
  )
}

function Tap() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 9h9a3 3 0 0 1 3 3v1M4 6v6M16 16v1M16 20v1M10 9V6M7 6h6" />
    </svg>
  )
}
