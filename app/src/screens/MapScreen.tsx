import { Button, Skeleton } from 'antd-mobile'
import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MapLayers } from '../components/MapView'
import { stormCentre } from '../data/storm'
import type { LiveStatus, Report, WaterStatusLive } from '../data/liveTypes'
import { useMapLabels } from '../data/mapLabels'
import './MapScreen.css'

const MapView = lazy(() => import('../components/MapView'))

interface Props {
  live?: LiveStatus
  water?: WaterStatusLive
  reports?: Report[]
}

export function MapScreen({ live, water, reports }: Props) {
  const { t } = useTranslation()
  const labels = useMapLabels()
  const [layers, setLayers] = useState<MapLayers>({ cyclone: true, reservoirs: true, reports: true })
  const hasStorm = !!stormCentre(live)
  // Follow the storm automatically when there is one, until the person chooses otherwise.
  const [chosen, setFocus] = useState<'mauritius' | 'cyclone' | undefined>()
  const focus = chosen ?? (hasStorm ? 'cyclone' : 'mauritius')
  const c = live?.cyclone

  return (
    <div className="map-screen">
      <header className="map-head">
        <h1>{t('map.title')}</h1>
        <div className="layer-chips" role="group">
          {(Object.keys(layers) as (keyof MapLayers)[]).map((k) => (
            <button
              key={k}
              className={`layer-chip layer-${k} ${layers[k] ? 'on' : ''}`}
              aria-pressed={layers[k]}
              onClick={() => setLayers({ ...layers, [k]: !layers[k] })}
            >
              <i />
              {t(`map.layers.${k}`)}
              {k === 'reports' && reports?.length ? ` (${reports.length})` : ''}
            </button>
          ))}
        </div>
      </header>

      <div className={`storm-strip ${hasStorm ? 'active' : ''}`}>
        {hasStorm ? (
          <>
            <div>
              <strong>{c ? t('map.storm', { name: [c.intensity, c.name].filter(Boolean).join(' '), km: c.distanceKm }) : live?.tracks[0]?.features[0]?.properties.name}</strong>
              {c?.movement && <div>{t('map.heading', { towards: c.movement.towards, speed: c.movement.speedKmh })}</div>}
              {c?.where && <div className="muted">{c.where}{c.at ? ` · ${c.at}` : ''}</div>}
            </div>
            <Button size="small" color="danger" fill="solid" onClick={() => setFocus(focus === 'cyclone' ? 'mauritius' : 'cyclone')}>
              {focus === 'cyclone' ? t('map.showMauritius') : t('map.showStorm')}
            </Button>
          </>
        ) : (
          <span>{t('map.noStorm')}</span>
        )}
      </div>

      <div className="map-box">
        <Suspense fallback={<Skeleton className="map-skeleton" animated />}>
          <MapView live={live} water={water} reports={reports} layers={layers} focus={focus} labels={labels} />
        </Suspense>
      </div>

      <div className="map-legend">
        {hasStorm && (
          <>
            <span><i className="lg-line" /> {t('map.legendPast')}</span>
            <span><i className="lg-line dashed" /> {t('map.legendForecast')}</span>
            <span><i className="lg-cone" /> {t('map.legendCone')}</span>
            <span><i className="lg-line heading" /> {t('map.legendHeading')}</span>
          </>
        )}
        <span><i className="lg-dot" style={{ background: '#1d6fd1' }} /> {t('water.status.ok')}</span>
        <span><i className="lg-dot" style={{ background: '#3f78c4' }} /> {t('water.status.below')}</span>
        <span><i className="lg-dot" style={{ background: '#b45309' }} /> {t('water.status.low')} (&lt;30%)</span>
        <span><i className="lg-dot" style={{ background: '#b91c1c' }} /> {t('water.status.critical')} (&lt;20%)</span>
        <span><i className="lg-dot hollow" /> {t('map.noFigure')}</span>
      </div>
      <p className="map-sources">
        {t('map.trackSource')} {t('map.reservoirSource')}
      </p>
    </div>
  )
}
