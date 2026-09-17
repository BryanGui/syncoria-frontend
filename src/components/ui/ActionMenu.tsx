import type { ReactNode } from 'react'

interface ActionMenuProps {
  children: ReactNode
  label: string
}

export function ActionMenu({ children, label }: ActionMenuProps) {
  return (
    <details className="ui-action-menu">
      <summary>{label}<span aria-hidden="true">⌄</span></summary>
      <div className="ui-action-menu__content">{children}</div>
    </details>
  )
}
