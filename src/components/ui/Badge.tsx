import type { ReactNode } from 'react'

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'error' | 'info'

interface BadgeProps {
  children: ReactNode
  tone?: BadgeTone
  dot?: boolean
}

export function Badge({ children, dot = false, tone = 'neutral' }: BadgeProps) {
  return (
    <span className={`ui-badge ui-badge--${tone}`}>
      {dot ? <span aria-hidden="true" className="ui-badge__dot" /> : null}
      {children}
    </span>
  )
}
