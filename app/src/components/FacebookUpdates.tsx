import { useTranslation } from 'react-i18next'
import { Card } from './Card'

// Official pages, as linked from each organisation's own website. We link to them rather than embed them:
// Facebook's Page Plugin often shows an empty box to people who aren't logged in or block its cookies,
// and we don't scrape Facebook (its terms forbid it).
const FACEBOOK_PAGES = {
  metro: { page: 'https://www.facebook.com/mauritiusmetroexpress/', from: 'https://mauritiusmetroexpress.mu/' },
  cwa: { page: 'https://www.facebook.com/cwa170', from: 'https://cwa.govmu.org/' },
} as const

/** A compact pointer to an official Facebook page, where the organisation posts its own service updates. */
export function FacebookUpdates({ which, className }: { which: keyof typeof FACEBOOK_PAGES; className?: string }) {
  const { t } = useTranslation()
  const { page } = FACEBOOK_PAGES[which]

  return (
    <Card className={`fb-card ${className ?? ''}`} title={t(`fb.${which}.title`)}>
      <div className="fb-row">
        <p className="card-sub">{t(`fb.${which}.intro`)}</p>
        <a className="fb-open" href={page} target="_blank" rel="noreferrer">
          {t('fb.open')} ↗
        </a>
      </div>
    </Card>
  )
}
