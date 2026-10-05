import { useEffect, useId, useRef, useState } from 'react'
import {
  Button,
  FormField,
  Notification,
  SelectInput,
  TextareaInput,
  TextInput,
} from '../components/ui'
import type { ProspectingResult } from '../api/adminProspecting'
import { PROSPECT_STATUS_LABELS, type CompanyInput, type ContactInput } from './model'
import { PROSPECTING_ERRORS } from './state'
import type { Field } from './formFields'

interface Props<T, R> {
  title: string
  initial: T
  fields: Field<T>[]
  onSave: (input: T, signal: AbortSignal) => Promise<ProspectingResult<R>>
  onSaved: (record: R) => void
  onSessionExpired: () => void
  onCancel?: () => void
}
export function ProspectingForm<T extends CompanyInput | ContactInput, R>({
  title,
  initial,
  fields,
  onSave,
  onSaved,
  onSessionExpired,
  onCancel,
}: Props<T, R>) {
  const formId = useId()
  const [values, setValues] = useState(() =>
    Object.fromEntries(
      fields.map((field) => [field.key, String(initial[field.key] ?? '')]),
    ),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pending = useRef<AbortController | null>(null)
  useEffect(() => () => pending.current?.abort(), [])
  return (
    <form
      className="prospecting-form"
      aria-label={title}
      onSubmit={async (event) => {
        event.preventDefault()
        if (pending.current && !pending.current.signal.aborted) return
        const controller = new AbortController()
        pending.current = controller
        setBusy(true)
        setError(null)
        const input = Object.fromEntries(
          fields.map((field) => [
            field.key,
            values[field.key].trim() || (field.required ? '' : null),
          ]),
        ) as unknown as T
        const result = await onSave(input, controller.signal)
        if (controller.signal.aborted) return
        pending.current = null
        setBusy(false)
        if (result.status === 'unauthenticated') {
          onSessionExpired()
          return
        }
        if (result.status !== 'loaded') {
          setError(PROSPECTING_ERRORS[result.status])
          return
        }
        onSaved(result.value)
      }}
    >
      <h2>{title}</h2>
      <fieldset disabled={busy}>
        <div className="prospecting-form-grid">
          {fields.map((field) => (
            <div
              key={field.key}
              className={field.type === 'notes' ? 'prospecting-wide' : undefined}
            >
              <FormField
                htmlFor={`${formId}-${field.key}`}
                label={field.label + (field.required ? '' : ' (facultatif)')}
              >
                {field.type === 'status' ? (
                  <SelectInput
                    id={`${formId}-${field.key}`}
                    value={values[field.key]}
                    onChange={(event) =>
                      setValues((previous) => ({
                        ...previous,
                        [field.key]: event.target.value,
                      }))
                    }
                  >
                    {Object.entries(PROSPECT_STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </SelectInput>
                ) : field.type === 'notes' ? (
                  <TextareaInput
                    id={`${formId}-${field.key}`}
                    rows={4}
                    maxLength={field.max}
                    value={values[field.key]}
                    onChange={(event) =>
                      setValues((previous) => ({
                        ...previous,
                        [field.key]: event.target.value,
                      }))
                    }
                  />
                ) : (
                  <TextInput
                    id={`${formId}-${field.key}`}
                    type={field.type ?? 'text'}
                    value={values[field.key]}
                    required={field.required}
                    maxLength={field.max}
                    pattern={field.required ? '.*\\S.*' : undefined}
                    onChange={(event) =>
                      setValues((previous) => ({
                        ...previous,
                        [field.key]: event.target.value,
                      }))
                    }
                  />
                )}
              </FormField>
            </div>
          ))}
        </div>
        {error && <Notification tone="error">{error}</Notification>}
        <div className="prospecting-actions">
          <Button type="submit" variant="primary" loading={busy}>
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
          {onCancel && (
            <Button type="button" onClick={onCancel}>
              Annuler
            </Button>
          )}
        </div>
      </fieldset>
    </form>
  )
}
