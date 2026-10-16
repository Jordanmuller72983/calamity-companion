import { Skeleton } from 'antd-mobile'
import { useTranslation } from 'react-i18next'
import type { NewsStatus } from '../data/liveTypes'
import { useAgoText } from '../data/mapLabels'
import { Card } from './Card'

export function PressCard({ news }: { news?: NewsStatus }) {
  const { t } = useTranslation()
  const ago = useAgoText()
  return (
    <Card className="press-card" title={t('press.title')} icon={<Paper />}>
      <p className="card-sub">{t('press.note')}</p>
      {!news ? (
        <Skeleton.Paragraph lineCount={3} animated />
      ) : news.items.length === 0 ? (
        <p className="empty-note">{t('press.none')}</p>
      ) : (
        <ul className="press-list">
          {news.items.slice(0, 6).map((n) => (
            <li key={n.url}>
              <a href={n.url} target="_blank" rel="noreferrer">
                {n.title}
              </a>
              <span>
                {n.source} · {ago(n.publishedAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function Paper() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M5 4h11v16H6a2 2 0 0 1-2-2V5a1 1 0 0 1 1-1Zm11 4h3v10a2 2 0 0 1-2 2M8 8h5M8 12h5M8 16h3" />
    </svg>
  )
}
