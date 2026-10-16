import type { ReactNode } from 'react'

interface Props {
  title?: ReactNode
  icon?: ReactNode
  extra?: ReactNode
  className?: string
  children: ReactNode
}

export function Card({ title, icon, extra, className, children }: Props) {
  return (
    <section className={`card ${className ?? ''}`}>
      {title && (
        <header className="card-head">
          <h2 className="card-title">
            {icon && <span className="card-icon">{icon}</span>}
            {title}
          </h2>
          {extra && <div className="card-extra">{extra}</div>}
        </header>
      )}
      {children}
    </section>
  )
}
