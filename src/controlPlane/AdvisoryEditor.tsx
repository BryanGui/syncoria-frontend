import {
  Button,
  Panel,
  FormField,
  TextInput,
  SelectInput,
  TextareaInput,
  Notification,
} from '../components/ui'
import { useState } from 'react'
import { advisorySpecs } from '../api/advisory'
import type {
  AdvisoryDossier,
  AdvisoryRecord,
  AdvisoryResource,
  AdvisoryValue,
} from '../api/advisory'
import { advisoryLabel } from './advisoryLabels'

interface Props {
  resource: AdvisoryResource
  record: AdvisoryRecord | null
  dossier: AdvisoryDossier
  busy: boolean
  error: string | null
  onCancel: () => void
  onSave: (payload: Record<string, AdvisoryValue>) => void
}
function localDate(value: string): string {
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16)
}
export function AdvisoryEditor({
  resource,
  record,
  dossier,
  busy,
  error,
  onCancel,
  onSave,
}: Props) {
  const spec = advisorySpecs[resource]
  const [values, setValues] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(
      spec.fields.map((field) => {
        const value =
          record?.[field.key] ??
          field.defaultValue ??
          (field.type === 'enum' ? field.options![0] : '')
        return [
          field.key,
          field.type === 'date' && typeof value === 'string' && value
            ? localDate(value)
            : (value ?? ''),
        ]
      }),
    ),
  )
  return (
    <Panel
      className="cp-panel advisory-editor"
      aria-labelledby="advisory-editor-title"
    >
      <h2 id="advisory-editor-title">
        {record ? 'Modifier' : 'Créer'} · {spec.label}
      </h2>
      <p>
        Synthèses professionnelles uniquement. Aucun mot de passe, clé API,
        token, conversation brute ou document métier.
      </p>
      {resource === 'provider_access' && (
        <p>
          URL HTTPS sans paramètres ni fragment. Les credentials techniques
          restent gérés par le backend.
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault()
          const payload: Record<string, AdvisoryValue> = {}
          for (const field of spec.fields) {
            const value = values[field.key]
            payload[field.key] =
              value === '' && field.nullable
                ? null
                : field.type === 'date' && typeof value === 'string' && value
                  ? new Date(value).toISOString()
                  : value
          }
          onSave(payload)
        }}
      >
        <fieldset disabled={busy}>
          <div className="advisory-form-grid">
            {spec.fields.map((field) => (
              <div
                key={field.key}
                className={
                  field.max && field.max > 320 ? 'advisory-wide' : undefined
                }
              >
                <FormField
                  htmlFor={`advisory-${resource}-${field.key}`}
                  label={
                    field.label +
                    (field.nullable || field.allowEmpty ? ' (facultatif)' : '')
                  }
                >
                  {field.type === 'boolean' ? (
                    <input
                      id={`advisory-${resource}-${field.key}`}
                      type="checkbox"
                      checked={values[field.key] === true}
                      onChange={(event) =>
                        setValues((previous) => ({
                          ...previous,
                          [field.key]: event.target.checked,
                        }))
                      }
                    />
                  ) : field.type === 'enum' || field.type === 'reference' ? (
                    <SelectInput
                      id={`advisory-${resource}-${field.key}`}
                      value={String(values[field.key])}
                      required={!field.nullable}
                      onChange={(event) =>
                        setValues((previous) => ({
                          ...previous,
                          [field.key]: event.target.value,
                        }))
                      }
                    >
                      {field.nullable && <option value="">Aucun lien</option>}
                      {field.type === 'enum'
                        ? field.options!.map((value) => (
                            <option key={value} value={value}>
                              {advisoryLabel(value)}
                            </option>
                          ))
                        : dossier[field.target!].map((row) => (
                            <option
                              key={String(
                                row[advisorySpecs[field.target!].id!],
                              )}
                              value={String(
                                row[advisorySpecs[field.target!].id!],
                              )}
                            >
                              {String(row.title)}
                            </option>
                          ))}
                    </SelectInput>
                  ) : field.max &&
                    field.max > 320 &&
                    field.key !== 'login_url' ? (
                    <TextareaInput
                      id={`advisory-${resource}-${field.key}`}
                      rows={3}
                      value={String(values[field.key])}
                      maxLength={field.max}
                      required={!field.nullable && !field.allowEmpty}
                      onChange={(event) =>
                        setValues((previous) => ({
                          ...previous,
                          [field.key]: event.target.value,
                        }))
                      }
                    />
                  ) : (
                    <TextInput
                      id={`advisory-${resource}-${field.key}`}
                      type={
                        field.type === 'date'
                          ? 'datetime-local'
                          : field.key === 'email'
                            ? 'email'
                            : field.key === 'login_url'
                              ? 'url'
                              : 'text'
                      }
                      value={String(values[field.key])}
                      maxLength={field.max}
                      required={!field.nullable && !field.allowEmpty}
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
          <div className="advisory-form-actions">
            <Button
              size="standard"
              variant="primary"
              loading={busy}
              type="submit"
            >
              {busy ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
            <Button size="standard" type="button" onClick={onCancel}>
              Annuler
            </Button>
          </div>
        </fieldset>
      </form>
    </Panel>
  )
}
