import { Segmented, Skeleton } from 'antd-mobile'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { RainfallSet } from '../data/liveTypes'
import { Card } from './Card'

export const HEAVY_MM = 50
export const TORRENTIAL_MM = 100
const COLLAPSED = 6

function level(mm: number) {
  if (mm >= TORRENTIAL_MM) return 'torrential'
  if (mm >= HEAVY_MM) return 'heavy'
  return 'normal'
}

interface Props {
  last3h?: RainfallSet
  last24h?: RainfallSet
  loading: boolean
}

export function RainfallCard({ last3h, last24h, loading }: Props) {
  const { t } = useTranslation()
  const [span, setSpan] = useState<'3h' | '24h'>('24h')
  const [all, setAll] = useState(false)
  const set = span === '3h' ? last3h : last24h
  const sorted = [...(set?.stations ?? [])].sort((a, b) => b.mm - a.mm)
  const shown = all ? sorted : sorted.slice(0, COLLAPSED)
  // Scale to at least the torrential level so small amounts look small.
  const max = Math.max(TORRENTIAL_MM, ...sorted.map((s) => s.mm))
  const anyRain = sorted.some((s) => s.mm > 0)

  return (
    <Card
      className="rain-card"
      title={t('rainfall.title')}
      icon={<RainDrop />}
      extra={
        <Segmented
          className="mini-seg"
          value={span}
          onChange={(v) => setSpan(v as '3h' | '24h')}
          options={[
            { label: t('rainfall.last3h'), value: '3h' },
            { label: t('rainfall.last24h'), value: '24h' },
          ]}
        />
      }
    >
      {loading && !set ? (
        <Skeleton.Paragraph lineCount={5} animated />
      ) : (
        <>
          {set?.period && <p className="card-sub">{set.period.replace(/\.$/, '')}</p>}
          {!anyRain && <p className="empty-note">{t('rainfall.none')}</p>}
          <ul className="bars" aria-label={t('rainfall.title')}>
            {shown.map((s) => {
              const lv = level(s.mm)
              return (
                <li key={s.station} className={`bar-row bar-${lv}`} title={`${s.station}: ${s.mm} mm`}>
                  <span className="bar-label">{s.station}</span>
                  <span className="bar-track">
                    <span className="bar-fill" style={{ width: `${Math.max((s.mm / max) * 100, s.mm > 0 ? 1.5 : 0)}%` }} />
                    <span className="bar-mark" style={{ left: `${(HEAVY_MM / max) * 100}%` }} />
                    <span className="bar-mark bar-mark-strong" style={{ left: `${(TORRENTIAL_MM / max) * 100}%` }} />
                  </span>
                  <span className="bar-value">
                    {s.mm} <small>mm</small>
                    {lv !== 'normal' && <span className={`bar-flag bar-flag-${lv}`}>{t(`rainfall.${lv}`)}</span>}
                  </span>
                </li>
              )
            })}
          </ul>
          <div className="card-foot">
            <span className="scale-note">{t('rainfall.scale')}</span>
            {sorted.length > COLLAPSED && (
              <button className="link-btn" onClick={() => setAll(!all)}>
                {all ? t('rainfall.showFewer') : t('rainfall.showAll', { n: sorted.length })}
              </button>
            )}
          </div>
        </>
      )}
    </Card>
  )
}

function RainDrop() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z" />
    </svg>
  )
}
