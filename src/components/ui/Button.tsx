import type { ComponentPropsWithoutRef } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'compact' | 'standard'

export interface ButtonProps extends ComponentPropsWithoutRef<'button'> {
  size?: ButtonSize
  variant?: ButtonVariant
  loading?: boolean
}

export function Button({
  children,
  className = '',
  disabled = false,
  loading = false,
  size = 'standard',
  variant = 'secondary',
  ...props
}: ButtonProps) {
  const classes = [
    'ui-button',
    `ui-button--${variant}`,
    `ui-button--${size}`,
    loading ? 'ui-button--loading' : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <button
      {...props}
      aria-busy={loading || undefined}
      className={classes}
      disabled={disabled || loading}
      type={props.type ?? 'button'}
    >
      {loading ? <span aria-hidden="true" className="ui-button__spinner" /> : null}
      {children}
    </button>
  )
}
