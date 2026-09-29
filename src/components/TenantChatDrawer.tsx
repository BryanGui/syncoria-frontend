import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

interface TenantChatDrawerProps {
  onClose: () => void
  triggerRef: RefObject<HTMLButtonElement | null>
}

export function TenantChatDrawer({ onClose, triggerRef }: TenantChatDrawerProps) {
  const [size, setSize] = useState<'normal' | 'wide' | 'minimized'>('normal')
  const closeRef = useRef<HTMLButtonElement>(null)

  const restoreFocus = useCallback(() => {
    const trigger = triggerRef.current
    if (trigger?.getClientRects().length) trigger.focus()
    else trigger?.closest('.tenant-navigation')?.querySelector<HTMLButtonElement>('.tenant-navigation__mobile-toggle')?.focus()
  }, [triggerRef])

  useEffect(() => {
    closeRef.current?.focus()
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
        restoreFocus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, restoreFocus])

  return (
    <aside aria-label="Chat IA" className={`tenant-chat tenant-chat--${size}`}>
      <div className="tenant-chat__header">
        <h3>Chat IA</h3>
        <div className="tenant-chat__actions">
          <button aria-label={size === 'minimized' ? 'Déplier le Chat IA' : 'Réduire le Chat IA'} onClick={() => setSize(size === 'minimized' ? 'normal' : 'minimized')} type="button">{size === 'minimized' ? '▢' : '−'}</button>
          <button aria-label={size === 'wide' ? 'Taille normale du Chat IA' : 'Agrandir le Chat IA'} onClick={() => setSize(size === 'wide' ? 'normal' : 'wide')} type="button">{size === 'wide' ? '▣' : '□'}</button>
          <button aria-label="Fermer le Chat IA" onClick={() => {
            onClose()
            restoreFocus()
          }} ref={closeRef} type="button">×</button>
        </div>
      </div>
      {size !== 'minimized' && <div className="tenant-chat__body">
        <p>Le chat IA sera disponible ici.</p>
        <label className="tenant-chat__input-label" htmlFor="tenant-chat-input">Message</label>
        <textarea disabled id="tenant-chat-input" placeholder="La saisie sera disponible prochainement." rows={2} />
      </div>}
    </aside>
  )
}
