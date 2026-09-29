import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent as ReactFocusEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface ActionMenuProps {
  ariaLabel?: string
  children: ReactNode
  label: string
  portal?: boolean
}

function PortalActionMenu({ ariaLabel, children, label }: ActionMenuProps) {
  const contentId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState<CSSProperties | null>(null)
  const closeMenu = useCallback(() => setIsOpen(false), [])

  useLayoutEffect(() => {
    if (!isOpen) return
    const trigger = triggerRef.current
    const content = contentRef.current
    if (!trigger || !content) return

    function updatePosition() {
      if (!trigger || !content) return
      const anchor = trigger.getBoundingClientRect()
      const menu = content.getBoundingClientRect()
      const margin = 8
      const gap = 4
      const below = window.innerHeight - anchor.bottom - gap - margin
      const above = anchor.top - gap - margin
      const opensBelow = menu.height <= below || below >= above
      const visibleHeight = Math.min(menu.height, window.innerHeight - margin * 2)
      const preferredTop = opensBelow ? anchor.bottom + gap : anchor.top - gap - visibleHeight
      const top = Math.max(margin, Math.min(preferredTop, window.innerHeight - visibleHeight - margin))
      const left = Math.max(margin, Math.min(anchor.right - menu.width, window.innerWidth - menu.width - margin))
      setPosition({
        top,
        left,
        maxHeight: Math.max(0, window.innerHeight - margin * 2),
      })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    function isInside(target: EventTarget | null) {
      return target instanceof Node && (
        triggerRef.current?.contains(target) || contentRef.current?.contains(target)
      )
    }
    function handlePointerDown(event: PointerEvent) {
      if (!isInside(event.target)) closeMenu()
    }
    function handleFocusIn(event: globalThis.FocusEvent) {
      if (!isInside(event.target)) closeMenu()
    }
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeMenu()
      triggerRef.current?.focus()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('focusin', handleFocusIn)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('focusin', handleFocusIn)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, closeMenu])

  function focusNextAfterTrigger() {
    const focusables = Array.from(document.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary',
    )).filter((element) => !contentRef.current?.contains(element) && element.getClientRects().length > 0)
    const index = focusables.indexOf(triggerRef.current as HTMLElement)
    focusables[index + 1]?.focus()
  }

  function handlePortalKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab') return
    const items = Array.from(contentRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]') ?? [])
    if (event.shiftKey && document.activeElement === items[0]) {
      event.preventDefault()
      triggerRef.current?.focus()
    } else if (!event.shiftKey && document.activeElement === items.at(-1)) {
      event.preventDefault()
      closeMenu()
      focusNextAfterTrigger()
    }
  }

  return (
    <div className="ui-action-menu ui-action-menu--portal">
      <button
        aria-controls={contentId}
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        className="ui-action-menu__trigger"
        onClick={(event) => {
          event.stopPropagation()
          setPosition(null)
          setIsOpen((open) => !open)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Tab' && !event.shiftKey && isOpen) {
            event.preventDefault()
            contentRef.current?.querySelector<HTMLElement>('button:not([disabled]), a[href]')?.focus()
          }
        }}
        ref={triggerRef}
        type="button"
      >{label}<span aria-hidden="true">⌄</span></button>
      {isOpen ? createPortal(
        <div
          className="ui-action-menu__content ui-action-menu__content--portal"
          id={contentId}
          onClick={(event) => {
            event.stopPropagation()
            if ((event.target as HTMLElement).closest('button, a, [role="menuitem"]')) {
              closeMenu()
              window.setTimeout(() => {
                if (document.activeElement === document.body || !document.activeElement?.isConnected) {
                  triggerRef.current?.focus()
                }
              }, 0)
            }
          }}
          onKeyDown={handlePortalKeyDown}
          ref={contentRef}
          style={position ?? { visibility: 'hidden', top: 0, left: 0 }}
        >{children}</div>,
        document.body,
      ) : null}
    </div>
  )
}

function InlineActionMenu({ ariaLabel, children, label }: ActionMenuProps) {
  const contentId = useId()
  const menuRef = useRef<HTMLDetailsElement>(null)
  const [isOpen, setIsOpen] = useState(false)

  function closeMenu() {
    setIsOpen(false)
  }

  function handleBlur(event: ReactFocusEvent<HTMLDetailsElement>) {
    window.setTimeout(() => {
      if (!menuRef.current?.contains(document.activeElement)) {
        closeMenu()
      }
    }, 0)
    event.stopPropagation()
  }

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    event.stopPropagation()
    if ((event.target as HTMLElement).closest('button, a, input, select, textarea, [role="menuitem"]')) {
      closeMenu()
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDetailsElement>) {
    if (event.key !== 'Escape') return
    event.preventDefault()
    closeMenu()
    menuRef.current?.querySelector('summary')?.focus()
  }

  return (
    <details
      className="ui-action-menu"
      onBlur={handleBlur}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={handleKeyDown}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
      open={isOpen}
      ref={menuRef}
    >
      <summary aria-controls={contentId} aria-expanded={isOpen} aria-label={ariaLabel}>{label}<span aria-hidden="true">⌄</span></summary>
      <div className="ui-action-menu__content" id={contentId} onClick={handleClick}>{children}</div>
    </details>
  )
}

export function ActionMenu({ ariaLabel, children, label, portal = false }: ActionMenuProps) {
  return portal
    ? <PortalActionMenu ariaLabel={ariaLabel} label={label}>{children}</PortalActionMenu>
    : <InlineActionMenu ariaLabel={ariaLabel} label={label}>{children}</InlineActionMenu>
}
