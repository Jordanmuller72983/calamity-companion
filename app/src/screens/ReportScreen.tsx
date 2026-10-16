import { Button, ImageUploader, Result, Selector, Skeleton, TextArea, Toast, type ImageUploadItem } from 'antd-mobile'
import { EnvironmentOutline } from 'antd-mobile-icons'
import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { authoritiesFor, lookupPlace, mailtoLink, type MailDraft } from '../data/authorities'
import { REPORT_KINDS, type Report, type ReportKind } from '../data/liveTypes'
import { useAgoText, useMapLabels } from '../data/mapLabels'
import { AdminReports } from '../components/AdminReports'
import { getAdminKey } from '../data/admin'
import './ReportScreen.css'

const MapView = lazy(() => import('../components/MapView'))

/** Shrink a photo to at most 1280px and JPEG, so reports stay small on slow networks. */
async function toJpeg(file: File): Promise<string> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.75)
}

interface Props {
  enabled: boolean
  demo: boolean
  demoWarning?: string
  reports?: Report[]
  onSent: () => void
}

export function ReportScreen({ enabled, demo, demoWarning, reports, onSent }: Props) {
  const { t } = useTranslation()
  const labels = useMapLabels()
  const ago = useAgoText()
  const [kind, setKind] = useState<ReportKind | undefined>()
  const [where, setWhere] = useState<[number, number] | undefined>()
  const [note, setNote] = useState('')
  const [photos, setPhotos] = useState<ImageUploadItem[]>([])
  const [locating, setLocating] = useState(false)
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState<MailDraft | null>(null)
  const [admin] = useState(getAdminKey)

  if (!enabled) {
    return (
      <div className="report report-closed">
        <h1 className="page-title">{t('report.title')}</h1>
        <Result status="info" title={t('report.closed')} description={t('report.danger')} />
        {admin && <AdminReports adminKey={admin} />}
      </div>
    )
  }

  const locate = () => {
    if (!navigator.geolocation) {
      Toast.show({ content: t('report.locError') })
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setWhere([Number(p.coords.longitude.toFixed(5)), Number(p.coords.latitude.toFixed(5))])
        setLocating(false)
      },
      () => {
        setLocating(false)
        Toast.show({ content: t('report.locError') })
      },
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }

  const send = async () => {
    if (!kind) {
      Toast.show({ content: t('report.needKind') })
      return
    }
    if (!where) {
      Toast.show({ content: t('report.needPlace') })
      return
    }
    setSending(true)
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, lon: where[0], lat: where[1], note, photo: photos[0]?.url, demo, demoWarning }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error)
      const report = body as Report
      onSent()
      // Street name for the email (best effort, a few seconds at most).
      const place = await lookupPlace(report.lat, report.lon)
      setDone({ kind: report.kind, lat: report.lat, lon: report.lon, note: report.note, place, at: report.createdAt })
    } catch (e) {
      Toast.show({ content: (e as Error).message })
    } finally {
      setSending(false)
    }
  }

  if (done) {
    const contacts = authoritiesFor(done.kind)
    const withEmail = contacts.filter((c) => c.email)
    return (
      <div className="report">
        <Result
          status="success"
          title={t('report.sent')}
          description={
            <>
              <div className="contacts">
                <p className="contacts-title">{t('reportSent.emailTitle')}</p>
                <p className="contacts-help">{t('reportSent.emailHelp')}</p>
                {withEmail.length > 1 && (
                  <a className="adm-button adm-button-primary adm-button-fill-solid adm-button-block email-all" href={mailtoLink(withEmail, done)}>
                    ✉ {t('reportSent.emailAll', { n: withEmail.length })}
                  </a>
                )}
                <ul>
                  {contacts.map((c) => (
                    <li key={c.id}>
                      <strong>{c.name}</strong>
                      <span className="contact-btns">
                        {c.email && (
                          <a className="contact-btn contact-email" href={mailtoLink([c], done)} title={c.email}>
                            ✉ {t('reportSent.email')}
                          </a>
                        )}
                        {c.phone && (
                          <a className="contact-btn" href={`tel:${c.phone.replace(/\s/g, '')}`}>
                            {t('reportSent.call', { phone: c.phone })}
                          </a>
                        )}
                        {c.whatsapp && (
                          <a className="contact-btn contact-wa" href={`https://wa.me/230${c.whatsapp}`} target="_blank" rel="noreferrer">
                            {t('reportSent.whatsapp')}
                          </a>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <p>{t('report.danger')}</p>
              <Button
                color="primary"
                onClick={() => {
                  setDone(null)
                  setKind(undefined)
                  setWhere(undefined)
                  setNote('')
                  setPhotos([])
                }}
              >
                {t('report.another')}
              </Button>
            </>
          }
        />
      </div>
    )
  }

  return (
    <div className="report">
      <div className="report-form">
        <h1 className="page-title">{t('report.title')}</h1>
        <p className="report-intro">{t('report.intro')}</p>
        {demo && <p className="report-demo">{t('report.demo')}</p>}
        <div className="report-danger">
          {t('report.danger')}{' '}
          <a href="tel:999">999</a> · <a href="tel:114">114</a>
        </div>

        <h2>{t('report.what')}</h2>
        <Selector
          className="kind-selector"
          columns={2}
          value={kind ? [kind] : []}
          onChange={(v) => setKind(v[0])}
          options={REPORT_KINDS.map((k) => ({ label: t(`report.kinds.${k}`), value: k }))}
        />

        <h2>{t('report.where')}</h2>
        <div className="where-row">
          <Button onClick={locate} loading={locating} loadingText={t('report.locating')}>
            <EnvironmentOutline /> {t('report.useLocation')}
          </Button>
          <span className="muted">{t('report.tapMap')}</span>
        </div>
        <div className="pick-map">
          <Suspense fallback={<Skeleton animated className="map-skeleton" />}>
            <MapView labels={labels} reports={reports} layers={{ cyclone: false, reservoirs: false, reports: true }} pick={{ value: where, onPick: setWhere }} />
          </Suspense>
        </div>
        {where && (
          <p className="muted coords">
            {where[1].toFixed(4)}, {where[0].toFixed(4)}
          </p>
        )}

        <h2>{t('report.note')}</h2>
        <TextArea placeholder={t('report.notePlaceholder')} value={note} onChange={setNote} maxLength={500} showCount rows={3} />

        <h2>{t('report.photo')}</h2>
        <ImageUploader value={photos} onChange={setPhotos} maxCount={1} accept="image/*" upload={async (file) => ({ url: await toJpeg(file) })} />

        <Button block color="primary" size="large" className="send-btn" loading={sending} onClick={send}>
          {t('report.send')}
        </Button>
      </div>

      {admin ? (
        <AdminReports adminKey={admin} />
      ) : (
        <aside className="report-recent">
          <h2>{t('report.recent')}</h2>
          {!reports?.length && <p className="muted">{t('report.none')}</p>}
          <ul>
            {reports?.slice(0, 12).map((r) => (
              <li key={r.id}>
                <strong>{t(`report.kinds.${r.kind}`)}</strong>
                <span className="muted"> · {ago(r.createdAt)}</span>
                {r.note && <p>{r.note}</p>}
              </li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  )
}
