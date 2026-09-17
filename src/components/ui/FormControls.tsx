import { cloneElement, isValidElement, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

interface AccessibleControlProps {
  'aria-describedby'?: string
  'aria-invalid'?: boolean
}

interface FormFieldProps {
  children: ReactNode
  hint?: ReactNode
  error?: ReactNode
  htmlFor: string
  label: string
}

export function FormField({ children, error, hint, htmlFor, label }: FormFieldProps) {
  const hintId = `${htmlFor}-hint`
  const errorId = `${htmlFor}-error`
  const describedBy = error ? errorId : hint ? hintId : undefined
  const control = isValidElement<AccessibleControlProps>(children)
    ? cloneElement(children, {
      'aria-describedby': describedBy,
      'aria-invalid': error ? true : undefined,
    })
    : children
  return (
    <div className="ui-form-field">
      <label className="ui-form-field__label" htmlFor={htmlFor}>{label}</label>
      {control}
      {hint && !error ? <span className="ui-form-field__hint" id={hintId}>{hint}</span> : null}
      {error ? <span className="ui-form-field__error" id={errorId} role="alert">{error}</span> : null}
    </div>
  )
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`ui-input ${props.className ?? ''}`.trim()} />
}

export function SelectInput(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`ui-input ${props.className ?? ''}`.trim()} />
}

export function TextareaInput(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`ui-input ui-input--textarea ${props.className ?? ''}`.trim()} />
}
