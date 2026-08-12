import { useReducer, useState, type FormEvent } from 'react'

import {
  addIntegrationCaseJsonInput,
  configureIntegrationCaseCredential,
  type IntegrationCase,
} from '../../api/integrationCases'
import {
  credentialFormReducer,
  INITIAL_CREDENTIAL_FORM_STATE,
} from '../../integrationCases/form'


interface IntegrationCaseDetailProps {
  apiBaseUrl: string | null
  integrationCase: IntegrationCase
  onBack: () => void
  onSessionExpired: () => void
  onUpdated: (integrationCase: IntegrationCase) => void
}

const MAX_JSON_INPUT_BYTES = 262144


export function IntegrationCaseDetail({
  apiBaseUrl,
  integrationCase,
  onBack,
  onSessionExpired,
  onUpdated,
}: IntegrationCaseDetailProps) {
  const [isCredentialFormOpen, setIsCredentialFormOpen] = useState(false)
  const [credentialState, dispatchCredential] = useReducer(
    credentialFormReducer,
    INITIAL_CREDENTIAL_FORM_STATE,
  )
  const [jsonFile, setJsonFile] = useState<File | null>(null)
  const [jsonStatus, setJsonStatus] = useState<
    'idle' | 'submitting' | 'invalid' | 'error'
  >('idle')
  const [jsonInputKey, setJsonInputKey] = useState(0)

  async function submitCredential(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!credentialState.name.trim() || !credentialState.secret.trim()) {
      dispatchCredential({ type: 'reject', status: 'invalid' })
      return
    }
    dispatchCredential({ type: 'submit' })
    const result = await configureIntegrationCaseCredential(
      apiBaseUrl,
      integrationCase.id,
      { name: credentialState.name.trim(), secret: credentialState.secret },
    )
    if (result.status === 'unauthenticated') {
      dispatchCredential({ type: 'complete' })
      onSessionExpired()
      return
    }
    if (result.status !== 'loaded') {
      dispatchCredential({
        type: 'reject',
        status: result.status === 'invalid' ? 'invalid' : 'error',
      })
      return
    }
    dispatchCredential({ type: 'complete' })
    setIsCredentialFormOpen(false)
    onUpdated(result.integrationCase)
  }

  async function submitJsonInput(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (
      jsonFile === null
      || !jsonFile.name.toLowerCase().endsWith('.json')
      || (jsonFile.type !== '' && jsonFile.type !== 'application/json')
      || jsonFile.size > MAX_JSON_INPUT_BYTES
    ) {
      setJsonStatus('invalid')
      return
    }
    setJsonStatus('submitting')
    let payload: unknown
    try {
      payload = JSON.parse(await jsonFile.text())
    } catch {
      setJsonStatus('invalid')
      return
    }
    const result = await addIntegrationCaseJsonInput(
      apiBaseUrl,
      integrationCase.id,
      { filename: jsonFile.name, payload },
    )
    if (result.status === 'unauthenticated') {
      onSessionExpired()
      return
    }
    if (result.status !== 'loaded') {
      setJsonStatus(result.status === 'invalid' ? 'invalid' : 'error')
      return
    }
    setJsonFile(null)
    setJsonInputKey((currentKey) => currentKey + 1)
    setJsonStatus('idle')
    onUpdated(result.integrationCase)
  }

  return (
    <section className="integration-detail">
      <button className="back-button" onClick={onBack} type="button">
        ← Retour aux intégrations
      </button>
      <article className="integration-card integration-card--summary">
        <div>
          <p className="integration-card__eyebrow">Informations générales</p>
          <h2>{integrationCase.tenantName}</h2>
        </div>
        <dl className="integration-summary">
          <div><dt>Source</dt><dd>{integrationCase.sourceSystem}</dd></div>
          <div><dt>Environnement</dt><dd>{integrationCase.environment}</dd></div>
          <div><dt>Statut</dt><dd>{integrationCase.status}</dd></div>
          <div><dt>Objectif</dt><dd>{integrationCase.objective}</dd></div>
          {integrationCase.sourceReference ? (
            <div><dt>Référence source</dt><dd>{integrationCase.sourceReference}</dd></div>
          ) : null}
          {integrationCase.instructions ? (
            <div><dt>Instructions</dt><dd>{integrationCase.instructions}</dd></div>
          ) : null}
        </dl>
      </article>

      <div className="integration-detail__grid">
        <article className="integration-card">
          <div className="integration-card__header">
            <div>
              <p className="integration-card__eyebrow">Credential</p>
              <h2>{integrationCase.credential.configured
                ? 'Credential configuré'
                : 'Non configuré'}</h2>
              {integrationCase.credential.name ? <p>{integrationCase.credential.name}</p> : null}
            </div>
            {!integrationCase.credential.configured ? (
              <button
                className="secondary-button"
                onClick={() => setIsCredentialFormOpen(true)}
                type="button"
              >Configurer</button>
            ) : null}
          </div>
          {isCredentialFormOpen ? (
            <form className="integration-form" onSubmit={submitCredential}>
              <label>
                Nom du credential
                <input
                  disabled={credentialState.status === 'submitting'}
                  maxLength={200}
                  onChange={(event) => dispatchCredential({
                    type: 'change_name',
                    name: event.target.value,
                  })}
                  value={credentialState.name}
                />
              </label>
              <label>
                Secret
                <input
                  autoComplete="new-password"
                  disabled={credentialState.status === 'submitting'}
                  maxLength={16384}
                  onChange={(event) => dispatchCredential({
                    type: 'change_secret',
                    secret: event.target.value,
                  })}
                  type="password"
                  value={credentialState.secret}
                />
              </label>
              {credentialState.status === 'invalid' ? (
                <p className="integration-form__error" role="alert">Renseignez un nom et un secret valides.</p>
              ) : credentialState.status === 'error' ? (
                <p className="integration-form__error" role="alert">Le credential ne peut pas être configuré.</p>
              ) : null}
              <button
                className="primary-button"
                disabled={credentialState.status === 'submitting'}
                type="submit"
              >
                {credentialState.status === 'submitting' ? 'Configuration…' : 'Enregistrer le credential'}
              </button>
            </form>
          ) : null}
        </article>

        <article className="integration-card">
          <p className="integration-card__eyebrow">Fichiers complémentaires</p>
          <h2>{integrationCase.jsonInputCount === 0
            ? 'Aucun JSON ajouté'
            : `${integrationCase.jsonInputCount} JSON ajouté${integrationCase.jsonInputCount > 1 ? 's' : ''}`}</h2>
          {integrationCase.jsonInputs.length > 0 ? (
            <ul className="integration-json-list">
              {integrationCase.jsonInputs.map((jsonInput) => (
                <li key={jsonInput.id}>{jsonInput.filename}<span>Ajouté</span></li>
              ))}
            </ul>
          ) : null}
          <form className="integration-form" onSubmit={submitJsonInput}>
            <label>
              Ajouter un JSON
              <input
                accept=".json,application/json"
                disabled={jsonStatus === 'submitting'}
                key={jsonInputKey}
                onChange={(event) => {
                  setJsonFile(event.target.files?.[0] ?? null)
                  setJsonStatus('idle')
                }}
                type="file"
              />
            </label>
            {jsonStatus === 'invalid' ? (
              <p className="integration-form__error" role="alert">Choisissez un petit fichier JSON valide.</p>
            ) : jsonStatus === 'error' ? (
              <p className="integration-form__error" role="alert">Le JSON ne peut pas être ajouté.</p>
            ) : null}
            <button
              className="secondary-button"
              disabled={jsonStatus === 'submitting'}
              type="submit"
            >{jsonStatus === 'submitting' ? 'Ajout…' : 'Ajouter le JSON'}</button>
          </form>
        </article>
      </div>
    </section>
  )
}
