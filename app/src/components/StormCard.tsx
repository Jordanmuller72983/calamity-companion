import { Button, Skeleton } from 'antd-mobile'
import { lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import type { LiveStatus } from '../data/liveTypes'
import { useMapLabels } from '../data/mapLabels'
import { Card } from './Card'
import { HeroIcon } from './HeroIcon'

const MapView = lazy(() => import('./MapView'))

/** Shown on the Now screen whenever a storm is being tracked. */
export function StormCard({ live, onOpenMap }: { live: LiveStatus; onOpenMap: () => void }) {
  const { t } = useTranslation()
  const labels = useMapLabels()
  const c = live.cyclone
  return (
    <Card className="storm-card" title={t('map.stormTitle')} icon={<HeroIcon kind="cyclone" size={18} />} extra={<Button size="small" onClick={onOpenMap}>{t('map.title')}</Button>}>
      {c && (
        <div className="storm-facts">
          <strong>{t('map.storm', { name: [c.intensity, c.name].filter(Boolean).join(' '), km: c.distanceKm })}</strong>
          {c.movement && <span>{t('map.heading', { towards: c.movement.towards, speed: c.movement.speedKmh })}</span>}
          {c.where && <span className="muted">{c.where}{c.at ? ` · ${c.at}` : ''}</span>}
        </div>
      )}
      <div className="storm-map">
        <Suspense fallback={<Skeleton animated className="map-skeleton" />}>
          <MapView live={live} labels={labels} focus="cyclone" layers={{ cyclone: true, reservoirs: false, reports: false }} interactive={false} />
        </Suspense>
      </div>
      <p className="map-sources">{t('map.trackSource')}</p>
    </Card>
  )
}
