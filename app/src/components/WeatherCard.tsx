import { Skeleton } from 'antd-mobile'
import { useTranslation } from 'react-i18next'
import type { Conditions, LiveStatus, TownsStatus } from '../data/liveTypes'
import { Card } from './Card'

const OUTER_ISLANDS = /rodrigues|agalega/i

// WMO weather codes (used by Open-Meteo) → a short sky word.
function skyKey(code: number): string {
  if (code === 0) return 'clear'
  if (code <= 2) return 'partly'
  if (code === 3) return 'cloudy'
  if (code === 45 || code === 48) return 'fog'
  if (code >= 51 && code <= 57) return 'drizzle'
  if (code >= 61 && code <= 67) return code >= 65 ? 'heavyRain' : 'rain'
  if (code >= 80 && code <= 82) return code === 82 ? 'heavyRain' : 'showers'
  if (code >= 95) return 'thunder'
  return 'cloudy'
}

function Place({ c }: { c: Conditions }) {
  return (
    <li>
      <span className="place-temp">{c.tempC}°</span>
      <span className="place-name">{c.place.replace(/\s*\(.*\)/, '').replace('Rodrigues-', 'Rodrigues · ')}</span>
      <span className="place-sky">
        {c.sky.replace(/ day| night/, '')}
        {c.wind ? ` · ${c.wind}` : ''}
      </span>
    </li>
  )
}

export function WeatherCard({ data, towns, loading }: { data?: LiveStatus; towns?: TownsStatus; loading: boolean }) {
  const { t, i18n } = useTranslation()
  const forecast = (i18n.language !== 'en' && data?.forecastFr) || data?.forecast
  const conditions = data?.conditions ?? []
  const mainland = conditions.filter((c) => !OUTER_ISLANDS.test(c.place))
  const outer = conditions.filter((c) => OUTER_ISLANDS.test(c.place))

  return (
    <Card className="weather-card" title={t('weather.title')} icon={<Sun />}>
      {loading && !data ? (
        <Skeleton.Paragraph lineCount={3} animated />
      ) : (
        <>
          <h3 className="weather-sub">{t('weather.measured')}</h3>
          <ul className="places">
            {mainland.map((p) => (
              <Place key={p.place} c={p} />
            ))}
          </ul>

          {towns && towns.towns.length > 0 && (
            <>
              <h3 className="weather-sub">{t('weather.moreTowns')}</h3>
              <ul className="towns">
                {towns.towns.map((w) => (
                  <li key={w.name} title={`${w.humidity}% · ${w.rainMm} mm`}>
                    <span className="town-name">{w.name}</span>
                    <span className="town-temp">{w.tempC}°</span>
                    <span className="town-sky">{t(`weather.sky.${skyKey(w.code)}`)}</span>
                    <span className={`town-wind ${w.gustKmh >= 60 ? 'strong' : ''}`}>
                      {w.windKmh} km/h{w.gustKmh > w.windKmh + 5 ? ` · ${t('weather.gusts', { n: w.gustKmh })}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="towns-note">{t('weather.estimateNote')}</p>
            </>
          )}

          {outer.length > 0 && (
            <>
              <h3 className="weather-sub">{t('weather.outer')}</h3>
              <ul className="places">
                {outer.map((p) => (
                  <Place key={p.place} c={p} />
                ))}
              </ul>
            </>
          )}

          {forecast && forecast.next24h.length > 0 && (
            <div className="forecast">
              <h3>{t('weather.forecast')}</h3>
              {forecast.next24h.slice(0, 2).map((l, i) => (
                <p key={i}>{l}</p>
              ))}
              <a className="link-btn" href={forecast.url} target="_blank" rel="noreferrer">
                {forecast.issued.replace(/\.$/, '')}
              </a>
            </div>
          )}
        </>
      )}
    </Card>
  )
}

function Sun() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}
