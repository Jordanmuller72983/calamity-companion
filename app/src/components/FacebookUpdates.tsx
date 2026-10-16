import { Button } from 'antd-mobile'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card } from './Card'

// Official pages, as linked from each organisation's own website. Shown with Facebook's Page Plugin,
// the embeddable widget Facebook provides for this. We don't scrape Facebook (its terms forbid it).
const FACEBOOK_PAGES = {
  metro: { page: 'https://www.facebook.com/mauritiusmetroexpress/', from: 'https://mauritiusmetroexpress.mu/' },
  cwa: { page: 'https://www.facebook.com/cwa170', from: 'https://cwa.govmu.org/' },
} as const

/** Latest posts from an official Facebook page. Loads only when asked, because Facebook's widget sets cookies. */
export function FacebookUpdates({ which, className }: { which: keyof typeof FACEBOOK_PAGES; className?: string }) {
  const { t, i18n } = useTranslation()
  const [show, setShow] = useState(false)
  const { page } = FACEBOOK_PAGES[which]
  const locale = i18n.language === 'en' ? 'en_GB' : 'fr_FR'
  const src = `https://www.facebook.com/plugins/page.php?href=${encodeURIComponent(page)}&tabs=timeline&width=500&height=520&small_header=true&adapt_container_width=true&hide_cover=true&show_facepile=false&locale=${locale}`

  return (
    <Card
      className={`fb-card ${className ?? ''}`}
      title={t(`fb.${which}.title`)}
      extra={
        <a className="link-btn" href={page} target="_blank" rel="noreferrer">
          {t('fb.open')} ↗
        </a>
      }
    >
      <p className="card-sub">{t(`fb.${which}.intro`)}</p>
      {show ? (
        <iframe className="fb-frame" title={t(`fb.${which}.title`)} src={src} loading="lazy" allow="encrypted-media" />
      ) : (
        <>
          <Button block onClick={() => setShow(true)}>
            {t('fb.show')}
          </Button>
          <p className="fb-privacy">{t('fb.privacy')}</p>
        </>
      )}
    </Card>
  )
}
