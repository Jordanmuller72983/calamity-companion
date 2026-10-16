import { NoticeBar } from 'antd-mobile'
import {
  CheckCircleFill,
  ClockCircleOutline,
  CloseCircleFill,
  ExclamationCircleFill,
  ExclamationTriangleOutline,
  InformationCircleOutline,
  PhoneFill,
} from 'antd-mobile-icons'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AreaTicker } from '../components/AreaTicker'
import { Card } from '../components/Card'
import { PressCard } from '../components/PressCard'
import { topicHeadline } from '../data/news'
import { curfewReports, disruptionsByTopic, withDisruption } from '../data/disruptions'
import { FacebookUpdates } from '../components/FacebookUpdates'
import { HeroIcon, Wave, type HeroKind } from '../components/HeroIcon'
import { HEAVY_MM, RainfallCard } from '../components/RainfallCard'
import { StormCard } from '../components/StormCard'
import { TopicIcon } from '../components/TopicIcon'
import { WaterCard } from '../components/WaterCard'
import { useWaterAlerts } from '../data/water'
import { WeatherCard } from '../components/WeatherCard'
import type { LiveStatus, NewsStatus, TownsStatus, WaterStatusLive } from '../data/liveTypes'
import { stormCentre } from '../data/storm'
import { useText } from '../i18n'
import type { ResolvedWarning } from '../rules/resolve'
import { rules } from '../rules/resolve'
import { TOPICS, type TopicStatus } from '../rules/types'
import './NowScreen.css'

export type DataMode = 'live' | 'belal' | 'demo'

const STATUS_ICON: Record<TopicStatus, typeof CheckCircleFill> = {
  ok: CheckCircleFill,
  caution: ExclamationCircleFill,
  stop: CloseCircleFill,
}

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Indian/Mauritius' })

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { timeZone: 'Indian/Mauritius', dateStyle: 'medium', timeStyle: 'short' })

function useAgo() {
  const { t } = useTranslation()
  return (iso: string, now: number) => {
    const mins = Math.floor((now - new Date(iso).getTime()) / 60000)
    if (mins < 1) return t('ago.now')
    if (mins < 60) return t('ago.min', { n: mins })
    if (mins < 48 * 60) return t('ago.hour', { n: Math.floor(mins / 60) })
    return t('ago.day', { n: Math.floor(mins / 1440) })
  }
}

function Alert({ level, icon, children }: { level: 'stop' | 'caution' | 'info'; icon: ReactNode; children: ReactNode }) {
  return (
    <div className={`alert alert-${level}`} role={level === 'info' ? 'status' : 'alert'}>
      <span className="alert-icon">{icon}</span>
      <div>{children}</div>
    </div>
  )
}

interface Props {
  warning: ResolvedWarning
  /** When the warning shown was fetched (live) or built (demo). */
  fetchedAt?: string
  live?: LiveStatus
  loading: boolean
  offline: boolean
  mode: DataMode
  now: number
  modeControl: ReactNode
  water?: WaterStatusLive
  news?: NewsStatus
  towns?: TownsStatus
  reportEnabled: boolean
  onOpenMap: () => void
  onReport: () => void
}

export function NowScreen({ warning, fetchedAt, live, loading, offline, mode, now, modeControl, water, news, towns, reportEnabled, onOpenMap, onReport }: Props) {
  const { t } = useTranslation()
  const tx = useText()
  const ago = useAgo()
  const waterAlerts = useWaterAlerts(water)
  const { primary } = warning

  const heroKind: HeroKind =
    primary.severity === 0 ? 'clear' : primary.kind === 'rain' ? 'rain' : primary.kind === 'cyclone' ? 'cyclone' : 'clear'

  const cycloneChip =
    warning.cyclone === 'none' ? t('noCyclone') : `${t('cyclone')}: ${tx(rules.warnings[warning.cyclone].shortName)}`
  const rainChip = warning.rain === 'none' ? t('noRain') : tx(rules.warnings[warning.rain].shortName)
  const rainArea = mode === 'demo' ? undefined : live?.snapshot.rainArea
  // Non-weather disruptions reported in the press (live mode only).
  const disrupted = mode === 'live' ? disruptionsByTopic(news) : {}
  const curfew = mode === 'live' ? curfewReports(news) : []
  const heavyStations = (live?.rainfall.last3h?.stations ?? []).filter((s) => s.mm >= HEAVY_MM).sort((a, b) => b.mm - a.mm)

  return (
    <div className="now">
      <div className="notes">
        {mode === 'belal' && <Alert level="info" icon={<InformationCircleOutline />}>{t('mode.archiveNote')}</Alert>}
        {mode === 'demo' && <Alert level="info" icon={<InformationCircleOutline />}>{t('mode.demoNote')}</Alert>}
        {offline && <Alert level="caution" icon={<ExclamationTriangleOutline />}>{t('offline')}</Alert>}
        {warning.stale && <Alert level="stop" icon={<ClockCircleOutline />}>{t('stale')}</Alert>}
      </div>

      <div className="col-main">
        <section className={`hero sev-${primary.severity}`} role="status" aria-live="polite">
          <Wave className="hero-wave" />
          <div className="hero-top">
            <div className="hero-chips">
              <span className="chip">{cycloneChip}</span>
              <span className="chip">{rainChip}</span>
            </div>
            {mode === 'live' && live && (
              <span className="live-pill">
                <i /> {t('mode.liveBadge')}
              </span>
            )}
          </div>
          <div className="hero-body">
            <div>
              <h1 className="hero-headline">{tx(primary.headline)}</h1>
              <p className="hero-instruction">{tx(primary.instruction)}</p>
              {rainArea && <p className="hero-area">{t('area', { area: rainArea })}</p>}
            </div>
            <HeroIcon kind={heroKind} />
          </div>
          {fetchedAt && (
            <p className="hero-meta">
              {mode === 'belal' && live?.bulletin?.issuedAt
                ? t('bulletin.issued', { time: fmtDateTime(live.bulletin.issuedAt) })
                : t('updated', { ago: ago(fetchedAt, now) })}{' '}
              · Mauritius Meteorological Services
            </p>
          )}
        </section>

        <div className="alerts">
          {curfew.length > 0 && (
            <Alert level="caution" icon={<ExclamationTriangleOutline />}>
              <strong>{t('disruption.curfewTitle')}</strong>
              {curfew.map((d) => (
                <div key={d.url} className="curfew-line">
                  <a href={d.url} target="_blank" rel="noreferrer">“{d.title}”</a> · {d.source}, {ago(d.publishedAt, now)}
                </div>
              ))}
              <div className="curfew-note">{t('disruption.note')}</div>
            </Alert>
          )}
          {warning.rainStillOn && (
            <Alert level="stop" icon={<ExclamationTriangleOutline />}>
              <strong>{t('rainStillOn')}</strong>
            </Alert>
          )}
          {heavyStations.slice(0, 2).map((s) => (
            <Alert key={s.station} level={s.mm >= 100 ? 'stop' : 'caution'} icon={<ExclamationTriangleOutline />}>
              {t('rainfall.alert', { station: s.station, mm: s.mm })}
            </Alert>
          ))}
          {waterAlerts.map((a) => (
            <Alert key={a.id} level={a.level} icon={<ExclamationTriangleOutline />}>
              {a.text}
            </Alert>
          ))}
          {warning.changes.length > 0 && warning.changedAt && (
            <NoticeBar
              className="change-bar"
              color="info"
              wrap
              content={
                <>
                  {t('changedAt', { time: formatTime(warning.changedAt) })}
                  {warning.changes.map((c) => (
                    <div key={c.signal}>
                      {t(c.signal)}: {tx(c.from)} → <strong>{tx(c.to)}</strong>
                    </div>
                  ))}
                </>
              }
            />
          )}
        </div>

        {reportEnabled && (
          <button className="report-cta" onClick={onReport}>
            <span className="report-cta-icon">!</span>
            <span>
              <strong>{t('report.title')}</strong>
              <span>{t('report.cta')}</span>
            </span>
          </button>
        )}

        <div className="tiles">
          {TOPICS.map((topic) => {
            const shown = withDisruption(warning.topics[topic], topic === 'school' || topic === 'transport' ? disrupted[topic] : undefined)
            const { status, detail, basis, sources } = shown
            const press = 'press' in shown ? shown.press : undefined
            const StatusIcon = STATUS_ICON[status]
            const statusWord = t(`status.${topic}.${status}`)
            return (
              <article key={topic} className={`tile tile-${status}`} aria-label={`${t(`topics.${topic}`)}: ${statusWord}. ${tx(detail)}`}>
                <div className="tile-head">
                  <span className="tile-icon">
                    <TopicIcon topic={topic} size={20} />
                  </span>
                  <span className="tile-topic">{t(`topics.${topic}`)}</span>
                </div>
                <div className={`status-pill status-${status}`}>
                  <StatusIcon aria-hidden="true" />
                  <span>{statusWord}</span>
                </div>
                {press ? (
                  <ul className="tile-disruptions">
                    {press.map((d) => (
                      <li key={d.url} className={`dis-${d.state}`}>
                        <strong>
                          {t(`disruption.service.${d.service}`)}: {t(`disruption.state.${d.state}`)}
                        </strong>
                        <a href={d.url} target="_blank" rel="noreferrer">
                          “{d.title}”
                        </a>
                        <span>
                          {d.source} · {ago(d.publishedAt, now)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="tile-detail">{tx(detail)}</p>
                )}
                {press && <span className="basis basis-press">{t('disruption.basis')}</span>}
                {!press && basis !== 'normal' &&
                  (sources[0]?.url ? (
                    <a className={`basis basis-${basis}`} href={sources[0].url} target="_blank" rel="noreferrer" title={sources.map((s) => s.name).join('\n')}>
                      {t(`basis.${basis}`)}
                    </a>
                  ) : (
                    <span className={`basis basis-${basis}`}>{t(`basis.${basis}`)}</span>
                  ))}
                {(() => {
                  const h = topic !== 'outside' && mode === 'live' && !press ? topicHeadline(news, topic) : undefined
                  return (
                    h && (
                      <a className="tile-press" href={h.url} target="_blank" rel="noreferrer">
                        <span>{t('press.onTopic')} · {h.source}</span>
                        {h.title}
                      </a>
                    )
                  )
                })()}
              </article>
            )
          })}
        </div>

        {live && mode !== 'demo' && stormCentre(live) && <StormCard live={live} onOpenMap={onOpenMap} />}

        {live && mode !== 'belal' && live.areas.length > 0 && <AreaTicker areas={live.areas} periods={live.areaPeriods} />}

        {mode === 'live' && <FacebookUpdates which="metro" className="metro-card" />}

        {mode !== 'belal' && <PressCard news={news} />}

        <Card className="donow" title={t('doNow')}>
          <ol className="donow-list">
            {warning.doNow.map((item, i) => (
              <li key={i}>
                <span className="donow-num">{i + 1}</span>
                <span>{tx(item)}</span>
              </li>
            ))}
          </ol>
        </Card>

        {mode !== 'belal' && <RainfallCard last3h={live?.rainfall.last3h} last24h={live?.rainfall.last24h} loading={loading} />}

        <WaterCard water={water} onOpenMap={onOpenMap} />

        {mode === 'live' && <FacebookUpdates which="cwa" className="cwa-card" />}
      </div>

      <aside className="col-side">
        <WeatherCard data={live} towns={mode === 'belal' ? undefined : towns} loading={loading} />

        <Card className="emergency" title={t('emergency')} icon={<PhoneFill />}>
          <div className="emergency-row">
            {[
              { label: t('police'), num: '999', service: 'police' },
              { label: t('samu'), num: '114', service: 'samu' },
              { label: t('fire'), num: '115', service: 'fire' },
            ].map(({ label, num, service }) => (
              <a key={num} className={`call-btn call-${service}`} href={`tel:${num}`}>
                <strong>{num}</strong>
                <span>{label}</span>
              </a>
            ))}
          </div>
          <p className="emergency-alt">{t('emergencyNumbers.alt')}</p>
          {/* Numbers from each body's official site, checked 16 Oct 2026 (see server/authorities.json). */}
          <h3 className="emergency-sub">{t('emergencyNumbers.more')}</h3>
          <ul className="emergency-list">
            {[
              { num: '130', label: t('emergencyNumbers.ceb'), hint: '24/7' },
              { num: '170', label: t('emergencyNumbers.cwa'), whatsapp: '55000025' },
              { num: '467 2184', label: t('emergencyNumbers.rda'), whatsapp: '57093032' },
              { num: '207 3900', label: t('emergencyNumbers.ndrrmc') },
              { num: '651 5105', label: t('emergencyNumbers.mms') },
              { num: '148', label: t('emergencyNumbers.anon') },
            ].map(({ num, label, hint, whatsapp }) => (
              <li key={num}>
                <span className="emergency-label">
                  {label}
                  {hint && <small> · {hint}</small>}
                </span>
                <span className="emergency-actions">
                  {whatsapp && (
                    <a className="wa-btn" href={`https://wa.me/230${whatsapp}`} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${label}`}>
                      WhatsApp
                    </a>
                  )}
                  <a className="tel-btn" href={`tel:${num.replace(/\s/g, '')}`}>
                    <PhoneFill /> {num}
                  </a>
                </span>
              </li>
            ))}
          </ul>
        </Card>

        {live?.bulletin && mode !== 'demo' && (
          <Card className="bulletin" title={t('bulletin.title')}>
            <p className="card-sub">
              {t('bulletin.english')}
              {live.bulletin.issuedAt && ` · ${t('bulletin.issued', { time: fmtDateTime(live.bulletin.issuedAt) })}`}
            </p>
            <div className="bulletin-text" lang="en">
              {live.bulletin.lines.slice(0, 14).map((l, i) => (
                <p key={i}>{l}</p>
              ))}
            </div>
            <a className="link-btn" href={live.bulletin.url} target="_blank" rel="noreferrer">
              {t('bulletin.read')} ↗
            </a>
          </Card>
        )}

        {live && live.notices.length > 0 && mode !== 'demo' && (
          <Card className="notices" title={t('notices')}>
            <ul>
              {live.notices.map((n, i) => (
                <li key={i}>
                  {n.href ? (
                    <a href={n.href} target="_blank" rel="noreferrer">
                      {n.text}
                    </a>
                  ) : (
                    n.text
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </aside>

      <footer className="page-foot">
        {!warning.verified && <p className="prototype-note">{t('prototype')}</p>}
        <p>{t('source')}</p>
        <div className="mode-row">{modeControl}</div>
      </footer>
    </div>
  )
}
