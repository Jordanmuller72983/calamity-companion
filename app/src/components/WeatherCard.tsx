import { Skeleton } from 'antd-mobile'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useJson } from '../data/useJson'
import type { Conditions, LiveStatus, TownsStatus, TownWeather } from '../data/liveTypes'
import { isWet, isWindy, skyOf } from '../data/sky'
import { Card } from './Card'
import { Moonlit, WeatherIcon } from './WeatherIcon'

const OUTER_ISLANDS = /rodrigues|agalega/i

/**
 * Night in Mauritius: Open-Meteo's sunrise/sunset flag, else MMS's own "… night" sky words,
 * else the clock (dark from about 18:00 to 06:00 all year).
 */
function isNight(towns: TownWeather[], conditions: Conditions[], now = Date.now()) {
  const flag = towns.find((w) => w.isDay !== undefined)?.isDay
  if (flag !== undefined) return !flag
  const mms = conditions.find((c) => / (day|night)$/.test(c.sky))
  if (mms) return mms.sky.endsWith(' night')
  const hour = new Date(now + 4 * 3600 * 1000).getUTCHours()
  return hour >= 18 || hour < 6
}

function Town({ w, nightFallback }: { w: TownWeather; nightFallback: boolean }) {
  const { t } = useTranslation()
  const sky = skyOf(w.code)
  const night = w.isDay === undefined ? nightFallback : !w.isDay
  const wet = isWet(sky)
  const tint = wet ? 'sky-wet' : night ? 'sky-night' : sky === 'clear' || sky === 'partly' ? 'sky-sun' : ''
  const classes = [
    'town',
    tint,
    wet && 'wet',
    sky === 'drizzle' && 'light',
    (sky === 'heavyRain' || sky === 'thunder') && 'heavy',
    isWindy(w.windKmh, w.gustKmh) && 'windy',
  ]
  return (
    <li className={classes.filter(Boolean).join(' ')} title={`${w.humidity}% · ${w.rainMm} mm`}>
      <span className="town-name">{w.name}</span>
      <span className="town-sky">{t(`weather.sky.${sky === 'clear' && night ? 'clearNight' : sky}`)}</span>
      <span className={`town-wind ${w.gustKmh >= 60 ? 'strong' : ''}`}>
        {w.windKmh} km/h
        {w.gustKmh > w.windKmh + 5 ? ` · ${t('weather.gusts', { n: w.gustKmh })}` : ''}
      </span>
      <span className="town-now">
        <WeatherIcon sky={sky} night={night} size={28} />
        <span className="town-temp">{w.tempC}°</span>
      </span>
    </li>
  )
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

const MAX_RESULTS = 8

/** For matching "riviere" to "Rivière" and "trou d eau" to "Trou d’Eau Douce". */
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[’'-]/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * The town cards with a search bar on top. Typing swaps the cards for matching places, from these towns and a
 * longer list that is fetched the first time someone uses the search; clearing it brings the towns back.
 * MMS stations (Vacoas, Plaisance, Port Louis) are found too, with their measurement rather than a model estimate.
 */
function TownsSection({ main, measured, night }: { main: TownWeather[]; measured: Conditions[]; night: boolean }) {
  const { t } = useTranslation()
  const [wanted, setWanted] = useState(false)
  const [query, setQuery] = useState('')
  const more = useJson<TownsStatus>(wanted ? '/api/towns?set=more' : null, 30 * 60 * 1000)
  const q = fold(query)
  const all = [...main, ...(more.data?.towns ?? [])]
  // From the start of any word: "riv" finds Grande Rivière Noire, but "r" alone doesn't match every name.
  const matches = (name: string) =>
    fold(name)
      .split(' ')
      .some((_, i, words) => words.slice(i).join(' ').startsWith(q))
  const found = q ? all.filter((w) => matches(w.name)) : []
  const stations = q ? measured.filter((c) => matches(c.place)) : []
  const shown = found.slice(0, MAX_RESULTS)

  return (
    <>
      <div className="towns-search-box">
        <svg
          className="towns-search-icon"
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.6-3.6" />
        </svg>
        <input
          type="search"
          className="towns-search"
          placeholder={t('weather.morePlaces.search')}
          aria-label={t('weather.morePlaces.search')}
          value={query}
          onFocus={() => setWanted(true)}
          onChange={(e) => {
            setWanted(true)
            setQuery(e.target.value)
          }}
        />
      </div>
      {!q ? (
        <ul className="towns">
          {main.map((w) => (
            <Town key={w.name} w={w} nightFallback={night} />
          ))}
        </ul>
      ) : (
        <div aria-live="polite">
          {stations.length > 0 && (
            <>
              <h4 className="towns-region">{t('weather.measured')}</h4>
              <ul className="places">
                {stations.map((c) => (
                  <Place key={c.place} c={c} />
                ))}
              </ul>
              {shown.length > 0 && <h4 className="towns-region">{t('weather.moreTowns')}</h4>}
            </>
          )}
          {shown.length > 0 && (
            <ul className="towns">
              {shown.map((w) => (
                <Town key={w.name} w={w} nightFallback={night} />
              ))}
            </ul>
          )}
          {found.length > MAX_RESULTS && (
            <p className="empty-note">
              {t('weather.morePlaces.narrow', {
                n: found.length - MAX_RESULTS,
              })}
            </p>
          )}
          {found.length === 0 &&
            stations.length === 0 &&
            (more.data ? (
              <p className="empty-note">{t('weather.morePlaces.none', { q: query.trim() })}</p>
            ) : more.error ? (
              <p className="empty-note">
                {t('weather.morePlaces.error')}{' '}
                <button type="button" className="link-btn" onClick={() => void more.reload()}>
                  {t('weather.morePlaces.retry')}
                </button>
              </p>
            ) : (
              <Skeleton.Paragraph lineCount={2} animated />
            ))}
        </div>
      )}
    </>
  )
}

export function WeatherCard({ data, towns, loading }: { data?: LiveStatus; towns?: TownsStatus; loading: boolean }) {
  const { t, i18n } = useTranslation()
  const forecast = (i18n.language !== 'en' && data?.forecastFr) || data?.forecast
  const conditions = data?.conditions ?? []
  const mainland = conditions.filter((c) => !OUTER_ISLANDS.test(c.place))
  const outer = conditions.filter((c) => OUTER_ISLANDS.test(c.place))
  const night = isNight(towns?.towns ?? [], conditions)

  return (
    <Card className="weather-card" title={t('weather.title')} icon={night ? <Moonlit /> : <Sun />}>
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
              <TownsSection main={towns.towns} measured={mainland} night={night} />
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
