import { ExclamationTriangleOutline, InformationCircleOutline } from 'antd-mobile-icons'
import { useTranslation } from 'react-i18next'
import { curfewReports, curfewSummary, disruptionsByTopic } from '../data/disruptions'
import type { NewsStatus } from '../data/liveTypes'
import { useAgoText } from '../data/mapLabels'
import { usePressText } from '../data/pressText'

/**
 * Always-on summary of what L'Express and Defimedia headlines say matters today: the curfew (hours, last day),
 * schools and transport, then other headlines to act on (water, power, roads, warnings…).
 * Says so when there is nothing, so an empty box never reads as "not checked".
 */
export function KeyHeadlines({ news, now }: { news?: NewsStatus; now: number }) {
  const { t } = useTranslation()
  const ago = useAgoText()
  const { dayFmt, pressState } = usePressText()

  const curfew = curfewReports(news, now)
  const summary = curfewSummary(curfew, now)
  const { school, transport } = disruptionsByTopic(news, now)
  const services = [...(school?.reports ?? []), ...(transport?.reports ?? [])]
  const others = news?.key ?? []
  const disrupted = summary.inForce || !!school || !!transport
  const allFailed = !!news && news.errors.length > 0 && news.items.length === 0 && news.disruptions.length === 0
  const empty = curfew.length === 0 && services.length === 0 && others.length === 0
  const level = disrupted ? 'caution' : 'info'

  const source = (d: { source: string; publishedAt: string }) => (
    <span className="key-src">
      {d.source} · {ago(d.publishedAt)}
    </span>
  )

  return (
    <section className={`alert alert-${level} key-headlines`} role={level === 'info' ? 'status' : 'alert'} aria-live="polite">
      <span className="alert-icon">{disrupted ? <ExclamationTriangleOutline /> : <InformationCircleOutline />}</span>
      <div>
        <strong>{t('key.title')}</strong>

        {!news && <div className="key-line">{t('key.loading')}</div>}
        {allFailed && <div className="key-line">{t('key.unreachable')}</div>}
        {news && !allFailed && empty && <div className="key-line">{t('key.none')}</div>}

        {curfew.length > 0 && (
          <div className="key-group">
            <div className="key-fact">
              {t('disruption.service.curfew')}
              {summary.hours && <> · {summary.hours.replace('–', ' – ')}</>}
              {summary.until && <> · {t(summary.past ? 'key.untilPast' : 'key.until', { date: dayFmt(summary.until) })}</>}
            </div>
            {curfew.map((d) => (
              <div key={d.url} className="key-line">
                <a href={d.url} target="_blank" rel="noreferrer">“{d.title}”</a> {source(d)}
              </div>
            ))}
          </div>
        )}

        {services.map((d) => (
          <div key={d.url + d.service} className="key-group">
            <div className="key-fact">
              {t(`disruption.service.${d.service}`)}: {pressState(d)}
            </div>
            <div className="key-line">
              <a href={d.url} target="_blank" rel="noreferrer">“{d.title}”</a> {source(d)}
            </div>
          </div>
        ))}

        {others.length > 0 && (
          <div className="key-group">
            {(curfew.length > 0 || services.length > 0) && <div className="key-fact">{t('key.other')}</div>}
            {others.map((n) => (
              <div key={n.url} className="key-line">
                <a href={n.url} target="_blank" rel="noreferrer">“{n.title}”</a> {source(n)}
              </div>
            ))}
          </div>
        )}

        <div className="key-note">{t('key.note')}</div>
      </div>
    </section>
  )
}
