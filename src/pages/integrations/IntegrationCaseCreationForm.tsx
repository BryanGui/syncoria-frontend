import { useState, type FormEvent } from 'react'

import {
  createIntegrationCase,
  type CreateIntegrationCaseDraft,
  type IntegrationCase,
} from '../../api/integrationCases'
import type { AdminTenant } from '../../api/adminTenants'
import {
  INITIAL_INTEGRATION_CASE_DRAFT,
  validateIntegrationCaseDraft,
} from '../../integrationCases/form'


interface IntegrationCaseCreationFormProps {
  apiBaseUrl: string | null
  onCancel: () => void
  onCreated: (integrationCase: IntegrationCase) => void
  onSessionExpired: () => void
  tenants: AdminTenant[] | null
  tenantsUnavailable: boolean
}


export function IntegrationCaseCreationForm({
  apiBaseUrl,
  onCancel,
  onCreated,
  onSessionExpired,
  tenants,
  tenantsUnavailable,
}: IntegrationCaseCreationFormProps) {
  const [draft, setDraft] = useState<CreateIntegrationCaseDraft>(
    INITIAL_INTEGRATION_CASE_DRAFT,
  )
  const [status, setStatus] = useState<
    'idle' | 'submitting' | 'invalid' | 'error'
  >('idle')
  const validation = validateIntegrationCaseDraft(draft)

  function updateDraft(changes: Partial<CreateIntegrationCaseDraft>) {
    setDraft({ ...draft, ...changes })
    setStatus('idle')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (validation.tenantError || validation.sourceError || validation.objectiveError) {
      setStatus('invalid')
      return
    }
    setStatus('submitting')
    const result = await createIntegrationCase(apiBaseUrl, validation.normalizedDraft)
    if (result.status === 'unauthenticated') {
      onSessionExpired()
      return
    }
    if (result.status !== 'loaded') {
      setStatus(result.status === 'invalid' ? 'invalid' : 'error')
      return
    }
    setDraft(INITIAL_INTEGRATION_CASE_DRAFT)
    onCreated(result.integrationCase)
  }

  return (
    <form className="integration-form integration-form--creation" onSubmit={submit}>
      <div className="integration-form__heading">
        <div><h3>Nouvelle intégration</h3><p>Crée une fiche en brouillon dans le sandbox.</p></div>
        <button
          aria-label="Fermer le formulaire"
          className="tenant-creation-form__close"
          disabled={status === 'submitting'}
          onClick={onCancel}
          type="button"
        >×</button>
      </div>
      <div className="integration-form__grid">
        <label>
          Client / tenant
          <select
            disabled={status === 'submitting' || tenants === null}
            onChange={(event) => updateDraft({ tenantId: event.target.value })}
            value={draft.tenantId}
          >
            <option value="">Sélectionner un client</option>
            {tenants?.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
            ))}
          </select>
        </label>
        <label>
          Source
          <input
            disabled={status === 'submitting'}
            maxLength={64}
            onChange={(event) => updateDraft({ sourceSystem: event.target.value })}
            placeholder="provider"
            value={draft.sourceSystem}
          />
        </label>
        <label>
          Référence source
          <input
            disabled={status === 'submitting'}
            maxLength={2048}
            onChange={(event) => updateDraft({ sourceReference: event.target.value })}
            value={draft.sourceReference}
          />
        </label>
        <label>
          Environnement
          <input disabled readOnly value="sandbox" />
        </label>
        <label className="integration-form__wide">
          Objectif
          <textarea
            disabled={status === 'submitting'}
            maxLength={4000}
            onChange={(event) => updateDraft({ objective: event.target.value })}
            value={draft.objective}
          />
        </label>
        <label className="integration-form__wide">
          Instructions
          <textarea
            disabled={status === 'submitting'}
            maxLength={10000}
            onChange={(event) => updateDraft({ instructions: event.target.value })}
            value={draft.instructions}
          />
        </label>
      </div>
      {status === 'invalid' ? (
        <p className="integration-form__error" role="alert">
          Vérifiez le client, la source et l’objectif.
        </p>
      ) : status === 'error' || tenantsUnavailable ? (
        <p className="integration-form__error" role="alert">
          La fiche ne peut pas être créée pour le moment.
        </p>
      ) : null}
      <button
        className="primary-button"
        disabled={status === 'submitting' || tenants === null}
        type="submit"
      >
        {status === 'submitting' ? 'Création…' : 'Créer la fiche'}
      </button>
    </form>
  )
}
