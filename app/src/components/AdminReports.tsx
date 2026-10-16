import { Button, Toast } from 'antd-mobile'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { forgetAdminKey } from '../data/admin'
import type { Report } from '../data/liveTypes'
import { useAgoText } from '../data/mapLabels'
import { useJson } from '../data/useJson'

// Unique per page load, so the owner's lists never come from the shared 30-second CDN cache.
const LOAD_ID = Math.random().toString(36).slice(2)

/** Report manager for the owner: live and test reports with Delete, available even when no warning is in force. */
export function AdminReports({ adminKey }: { adminKey: string }) {
  const { t } = useTranslation()
  const ago = useAgoText()
  // Bumped after each delete so the lists reload straight away.
  const [version, setVersion] = useState(0)
  const fresh = `${LOAD_ID}-${version}`
  const live = useJson<Report[]>(`/api/reports?scope=live&fresh=${fresh}`)
  const test = useJson<Report[]>(`/api/reports?scope=demo&fresh=${fresh}`)

  const remove = async (id: string) => {
    if (!window.confirm(t('report.deleteConfirm'))) return
    const res = await fetch(`/api/reports/${id}`, { method: 'DELETE', headers: { 'x-admin-key': adminKey } })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) Toast.show({ content: body.error ?? String(res.status) })
    setVersion((v) => v + 1)
  }

  const list = (title: string, items?: Report[]) => (
    <section className="admin-list">
      <h3>
        {title} <span className="muted">({items?.length ?? '…'})</span>
      </h3>
      {items?.length === 0 && <p className="muted">{t('report.none')}</p>}
      <ul>
        {items?.map((r) => (
          <li key={r.id}>
            <div>
              <strong>{t(`report.kinds.${r.kind}`)}</strong>
              <span className="muted">
                {' '}
                · {ago(r.createdAt)} · {r.lat.toFixed(4)}, {r.lon.toFixed(4)}
              </span>
              {r.note && <p>{r.note}</p>}
              {r.photo && (
                <a href={r.photo} target="_blank" rel="noreferrer">
                  {t('report.photo')}
                </a>
              )}
            </div>
            <button className="delete-btn" onClick={() => void remove(r.id)}>
              {t('report.delete')}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )

  return (
    <aside className="report-recent admin-reports">
      <h2>{t('admin.title')}</h2>
      <p className="muted">{t('admin.intro')}</p>
      {list(t('admin.live'), live.data)}
      {list(t('admin.test'), test.data)}
      <Button
        size="small"
        fill="outline"
        onClick={() => {
          forgetAdminKey()
          window.location.reload()
        }}
      >
        {t('admin.signOut')}
      </Button>
    </aside>
  )
}
