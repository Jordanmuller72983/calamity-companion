import { Result } from 'antd-mobile'
import { ClockCircleOutline } from 'antd-mobile-icons'
import { useTranslation } from 'react-i18next'

export function ComingSoon({ message }: { message: string }) {
  const { t } = useTranslation()
  return (
    <Result
      icon={<ClockCircleOutline />}
      status="waiting"
      title={t('comingSoon')}
      description={message}
    />
  )
}
