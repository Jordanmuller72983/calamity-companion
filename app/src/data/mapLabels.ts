import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { MapLabels } from '../components/MapView'
import { useDateFmt } from './water'

export function useAgoText() {
  const { t } = useTranslation()
  return (iso: string, now = Date.now()) => {
    const mins = Math.floor((now - new Date(iso).getTime()) / 60000)
    if (mins < 1) return t('ago.now')
    if (mins < 60) return t('ago.min', { n: mins })
    if (mins < 48 * 60) return t('ago.hour', { n: Math.floor(mins / 60) })
    return t('ago.day', { n: Math.floor(mins / 1440) })
  }
}

export function useMapLabels(): MapLabels {
  const { t, i18n } = useTranslation()
  const fmt = useDateFmt()
  const ago = useAgoText()
  return useMemo(
    () => ({
      capacity: t('map.capacity'),
      noFigure: t('map.noFigure'),
      levelOn: (_pct: number, date: string) => t('map.levelOn', { date: fmt(date) }),
      source: t('map.source'),
      reportKind: (k) => t(`report.kinds.${k}`),
      reportedAgo: (iso) => ago(iso),
      cyclone: (c) => t('map.storm', { name: c.name ?? t('cyclone'), km: c.distanceKm }),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [i18n.language],
  )
}
