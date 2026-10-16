import { useTranslation } from 'react-i18next'
import type { Disruption } from './liveTypes'

/** Day names in the app's language, for dates read from headlines ("Monday 19 October"). */
export function usePressText() {
  const { t, i18n } = useTranslation()
  const dayFmt = (ymd: string) =>
    new Date(ymd + 'T12:00:00Z').toLocaleDateString(i18n.language === 'en' ? 'en-GB' : 'fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    })
  /** "not running · reduced service from Saturday 17 October" */
  const pressState = (d: Disruption) => {
    const word = t(d.service === 'school' && d.state === 'stopped' ? 'disruption.state.closed' : `disruption.state.${d.state}`)
    if (d.state === 'stopped' && d.resumesOn) {
      const kind = d.service === 'school' ? 'school' : d.normalOn ? 'partial' : 'service'
      return `${word} · ${t(`disruption.resumesOn.${kind}`, { date: dayFmt(d.resumesOn) })}`
    }
    if (d.state === 'limited' && d.normalOn) return `${word} · ${t('disruption.normalOn', { date: dayFmt(d.normalOn) })}`
    return word
  }
  return { dayFmt, pressState }
}
