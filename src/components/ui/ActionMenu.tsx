import { useId, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'

interface ActionMenuProps {
  ariaLabel?: string
  children: ReactNode
  label: string
}

export function ActionMenu({ ariaLabel, children, label }: ActionMenuProps) {
  const contentId = useId()
  const menuRef = useRef<HTMLDetailsElement>(null)
  const [isOpen, setIsOpen] = useState(false)

  function closeMenu() {
    setIsOpen(false)
  }

  function handleBlur(event: FocusEvent<HTMLDetailsElement>) {
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
