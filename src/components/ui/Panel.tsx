import type { HTMLAttributes, ReactNode } from 'react'

interface PanelProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode
  as?: 'article' | 'div' | 'section'
}

export function Panel({ as = 'section', children, className = '', ...props }: PanelProps) {
  const Component = as
  return <Component {...props} className={`ui-panel ${className}`.trim()}>{children}</Component>
}

interface SectionProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode
}

export function Section({ children, className = '', ...props }: SectionProps) {
  return <section {...props} className={`ui-section ${className}`.trim()}>{children}</section>
}

interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  title: string
}

export function EmptyState({ children, className = '', title, ...props }: EmptyStateProps) {
  return (
    <div {...props} className={`ui-empty-state ${className}`.trim()}>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  )
}
