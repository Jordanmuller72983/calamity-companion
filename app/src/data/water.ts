import { useTranslation } from 'react-i18next'
import type { WaterStatusLive } from './liveTypes'
import { waterStatus } from './reservoirs'

export type WaterLevel = 'ok' | 'below' | 'low' | 'critical'

export function waterLevel(pct: number): WaterLevel {
  const s = waterStatus(pct)
  if (s !== 'ok') return s
  return pct < 50 ? 'below' : 'ok'
}

export function useDateFmt() {
  const { i18n } = useTranslation()
  const locale = i18n.language === 'en' ? 'en-GB' : 'fr-FR'
  return (iso: string) => new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
}

export interface WaterAlert {
  id: string
  level: 'stop' | 'caution'
  text: string
}

/** Alerts for the top of the screen when a reservoir drops below 30% (low) or 20% (critical). */
export function useWaterAlerts(water?: WaterStatusLive): WaterAlert[] {
  const { t } = useTranslation()
  return (water?.reservoirs ?? []).flatMap((r): WaterAlert[] => {
    const last = r.readings[r.readings.length - 1]
    if (!last) return []
    const s = waterStatus(last.pct)
    if (s === 'critical') return [{ id: r.id, level: 'stop', text: t('water.criticalAlert', { name: r.name }) }]
    if (s === 'low') return [{ id: r.id, level: 'caution', text: t('water.lowAlert', { name: r.name }) }]
    return []
  })
}
