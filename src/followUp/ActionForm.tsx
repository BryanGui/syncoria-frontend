import { useEffect, useId, useRef, useState } from 'react'
import type { AdminFollowUpApi } from '../api/adminFollowUp'
import type { AdminProspectingApi } from '../api/adminProspecting'
import {
  Button,
  FormField,
  Notification,
  SelectInput,
  TextareaInput,
  TextInput,
} from '../components/ui'
import type { Company } from '../prospecting/model'
import { CompanySelector } from './CompanySelector'
import {
  deadlineChoiceLabel,
  formDeadline,
  initialDeadlineOccurrence,
  parisLocalInstants,
  toParisLocal,
  type ActionFormValues,
} from './dates'
import {
  changedActionFields,
  FOLLOW_UP_STATUS_LABELS,
  type FollowUpAction,
  type FollowUpStatus,
} from './model'
import { FOLLOW_UP_ERRORS } from './state'

export function ActionForm({
  api,
  prospectingApi,
  initial,
  company,
  subjectLabel,
  onSaved,
  onCancel,
  onSessionExpired,
}: {
  api: AdminFollowUpApi
  prospectingApi: AdminProspectingApi
  initial?: FollowUpAction
  company?: Company
  subjectLabel?: string
  onSaved: (action: FollowUpAction) => void
  onCancel: () => void
  onSessionExpired: () => void
}) {
  const id = useId()
  const initialDue = initial?.due_at ?? null
  const [selected, setSelected] = useState<Company | null>(company ?? null)
  const [values, setValues] = useState<ActionFormValues>(() => ({
    title: initial?.title ?? '',
    status: initial?.status ?? 'todo',
    dueLocal: initialDue ? toParisLocal(initialDue) : '',
    occurrence: initialDue ? initialDeadlineOccurrence(initialDue) : '',
    notes: initial?.notes ?? '',
  }))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const pending = useRef<AbortController | null>(null)
  useEffect(() => () => pending.current?.abort(), [])
  const occurrences = parisLocalInstants(values.dueLocal)
  const title = initial ? 'Modifier l’action' : 'Ajouter une action'
  return (
    <form
      aria-label={title}
      className="follow-up-form"
      onSubmit={async (event) => {
        event.preventDefault()
        if (pending.current && !pending.current.signal.aborted) return
        setError(null)
        if (!initial && !selected) {
          setError('Choisissez une entreprise.')
          return
        }
        if (!values.title.trim()) {
          setError('Saisissez un titre pour l’action.')
          return
        }
        let dueAt: string | null
        try {
          dueAt = formDeadline(values, initialDue)
        } catch (failure) {
          setError((failure as Error).message)
          return
        }
        const input = {
          title: values.title.trim(),
          status: values.status,
          due_at: dueAt,
          notes: values.notes.trim() || null,
        }
        const patch = initial ? changedActionFields(input, initial) : null
        if (initial && patch && !Object.keys(patch).length) {
          onSaved(initial)
          return
        }
        const controller = new AbortController()
        pending.current = controller
        setBusy(true)
        const result =
          initial && patch
            ? await api.updateAction(initial.id, patch, controller.signal)
            : await api.createAction(
                {
                  ...input,
                  subject_type: 'prospecting.company',
                  subject_id: selected!.id,
                },
                controller.signal,
              )
        if (controller.signal.aborted) return
        pending.current = null
        setBusy(false)
        if (result.status === 'unauthenticated') {
          onSessionExpired()
          return
        }
        if (result.status !== 'loaded') {
          setError(FOLLOW_UP_ERRORS[result.status])
          return
        }
        onSaved(result.value)
      }}
    >
      <h2>{title}</h2>
      <fieldset disabled={busy}>
        {!initial && !company ? (
          <CompanySelector
            api={prospectingApi}
            selected={selected}
            onSelect={setSelected}
            onSessionExpired={onSessionExpired}
          />
        ) : (
          (company || subjectLabel) && (
            <p>
              {company ? 'Entreprise' : 'Sujet'} :{' '}
              <strong>{company?.name ?? subjectLabel}</strong>
            </p>
          )
        )}
        <div className="follow-up-form-grid">
          <FormField htmlFor={`${id}-title`} label="Titre">
            <TextInput
              id={`${id}-title`}
              autoFocus
              required
              maxLength={200}
              pattern=".*\S.*"
              value={values.title}
              onChange={(event) => setValues({ ...values, title: event.target.value })}
            />
          </FormField>
          <FormField htmlFor={`${id}-status`} label="Statut">
            <SelectInput
              id={`${id}-status`}
              value={values.status}
              onChange={(event) =>
                setValues({ ...values, status: event.target.value as FollowUpStatus })
              }
            >
              {Object.entries(FOLLOW_UP_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectInput>
          </FormField>
          <FormField htmlFor={`${id}-due`} label="Échéance (Europe/Paris, facultatif)">
            <TextInput
              id={`${id}-due`}
              type="datetime-local"
              value={values.dueLocal}
              onChange={(event) =>
                setValues({ ...values, dueLocal: event.target.value, occurrence: '' })
              }
            />
          </FormField>
          {occurrences.length === 2 && (
            <FormField
              htmlFor={`${id}-occurrence`}
              label="Occurrence de l’heure (changement d’heure)"
            >
              <SelectInput
                id={`${id}-occurrence`}
                required
                value={values.occurrence}
                onChange={(event) =>
                  setValues({ ...values, occurrence: event.target.value })
                }
              >
                <option value="">Choisir une occurrence</option>
                {occurrences.map((instant) => (
                  <option key={instant} value={instant}>
                    {deadlineChoiceLabel(instant)}
                  </option>
                ))}
              </SelectInput>
            </FormField>
          )}
          <div className="follow-up-wide">
            <FormField htmlFor={`${id}-notes`} label="Notes (facultatif)">
              <TextareaInput
                id={`${id}-notes`}
                rows={3}
                maxLength={4000}
                value={values.notes}
                onChange={(event) =>
                  setValues({ ...values, notes: event.target.value })
                }
              />
            </FormField>
          </div>
        </div>
        {error && <Notification tone="error">{error}</Notification>}
        <div className="follow-up-actions">
          <Button type="submit" variant="primary" loading={busy}>
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
          <Button onClick={onCancel}>Annuler</Button>
        </div>
      </fieldset>
    </form>
  )
}
