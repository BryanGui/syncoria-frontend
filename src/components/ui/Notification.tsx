import { useEffect } from 'react'
import type { ReactNode } from 'react'

export type NotificationTone = 'success' | 'error' | 'info'

interface NotificationProps {
  children: ReactNode
  onDismiss?: () => void
  timeoutMs?: number
  title?: string
  tone?: NotificationTone
}

export function Notification({
  children,
  onDismiss,
  timeoutMs = 6000,
  title,
  tone = 'info',
}: NotificationProps) {
  useEffect(() => {
    if (!onDismiss || timeoutMs <= 0) return
    const timeout = window.setTimeout(onDismiss, timeoutMs)
    return () => window.clearTimeout(timeout)
  }, [onDismiss, timeoutMs])

  return (
    <div className={`ui-notification ui-notification--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <div>
        {title ? <strong>{title}</strong> : null}
        <span>{children}</span>
      </div>
      {onDismiss ? (
        <button aria-label="Fermer la notification" className="ui-notification__dismiss" onClick={onDismiss} type="button">
          ×
        </button>
      ) : null}
    </div>
  )
}
