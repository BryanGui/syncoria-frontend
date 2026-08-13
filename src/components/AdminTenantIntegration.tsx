import { useEffect, useState, type FormEvent } from 'react'

import {
  createAdminTenantProvider,
  deleteAdminTenantProvider,
  fetchAdminTenantProviders,
  replaceAdminTenantProviderCredential,
  updateAdminTenantProvider,
  verifyAdminTenantProvider,
  type AdminProvider,
  type AdminProviderMutationResult,
  type AdminProviderRecord,
} from '../api/adminTenantProviders'
import {
  applyProviderVerification,
  buildProviderConfiguration,
  getProviderConnectionLabel,
  getProviderConnectionState,
  upsertProviderRecord,
} from '../tenantProviders/state'

interface AdminTenantIntegrationProps {
  apiBaseUrl: string | null
  tenantId: string
  tenantStatus: string
  onSessionExpired: () => void
}

interface ProviderDefinition {
  title: string
  secretLabel: string
  secretReplacementLabel: string
}

function getProviderDefinition(provider: AdminProvider): ProviderDefinition {
  return provider === 'notion'
    ? {
      title: 'Notion',
      secretLabel: 'Token Notion',
      secretReplacementLabel: 'Remplacer le token',
    }
    : {
      title: 'n8n',
      secretLabel: 'Clé API n8n',
      secretReplacementLabel: 'Remplacer la clé',
    }
}

type FormMode = 'edit' | 'credential' | null

function formatVerificationDate(value: string | null): string {
  if (value === null) return 'Jamais'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date indisponible'
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function mutationErrorMessage(result: AdminProviderMutationResult): string {
  if (result.status === 'conflict') {
    return 'Une connexion active existe déjà pour ce provider.'
  }
  if (result.status === 'invalid') return 'Vérifiez les informations saisies.'
  if (result.status === 'not_found') return 'Cette connexion n’existe plus.'
  return 'La modification n’a pas pu être enregistrée.'
}

interface ProviderCardProps {
  apiBaseUrl: string | null
  providerRecord: AdminProviderRecord
  tenantId: string
  onProviderChanged: (provider: AdminProviderRecord) => void
  onSessionExpired: () => void
}

function ProviderCard({
  apiBaseUrl,
  providerRecord,
  tenantId,
  onProviderChanged,
  onSessionExpired,
}: ProviderCardProps) {
  const provider = providerRecord.provider
  const { title, secretLabel, secretReplacementLabel } = getProviderDefinition(provider)
  const [formMode, setFormMode] = useState<FormMode>(null)
  const [name, setName] = useState('')
  const [configurationValue, setConfigurationValue] = useState('')
  const [secret, setSecret] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [isDisabling, setIsDisabling] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const connectionState = getProviderConnectionState(providerRecord)
  const configurationLabel = provider === 'notion'
    ? 'Référence workspace'
    : 'URL de base'
  const currentConfiguration = provider === 'notion'
    ? providerRecord.configuration.workspace_reference
    : providerRecord.configuration.base_url

  function closeForm() {
    if (isSubmitting) return
    setSecret('')
    setErrorMessage(null)
    setFormMode(null)
  }

  function openEditForm() {
    setName(providerRecord.name)
    setConfigurationValue(currentConfiguration ?? '')
    setSecret('')
    setErrorMessage(null)
    setFormMode('edit')
  }

  function openCredentialForm() {
    setSecret('')
    setErrorMessage(null)
    setFormMode('credential')
  }

  async function handleMutationResult(result: AdminProviderMutationResult) {
    setSecret('')
    if (result.status === 'unauthenticated') {
      onSessionExpired()
      return
    }
    if (result.status !== 'saved') {
      setErrorMessage(mutationErrorMessage(result))
      return
    }
    onProviderChanged(result.provider)
    setFormMode(null)
    setErrorMessage(null)
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedName = name.trim()
    const normalizedConfiguration = configurationValue.trim()
    if (
      normalizedName.length === 0
      || (provider === 'n8n' && normalizedConfiguration.length === 0)
    ) {
      setErrorMessage('Renseignez tous les champs obligatoires.')
      return
    }

    setIsSubmitting(true)
    setErrorMessage(null)
    const configuration = buildProviderConfiguration(
      provider,
      normalizedConfiguration,
    )
    const result = await updateAdminTenantProvider(
      apiBaseUrl,
      tenantId,
      providerRecord.id,
      { name: normalizedName, configuration },
    )
    await handleMutationResult(result)
    setIsSubmitting(false)
  }

  async function submitCredential(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (secret.length === 0) {
      setErrorMessage('Renseignez le nouveau credential.')
      return
    }
    setIsSubmitting(true)
    setErrorMessage(null)
    const result = await replaceAdminTenantProviderCredential(
      apiBaseUrl,
      tenantId,
      providerRecord.id,
      secret,
    )
    await handleMutationResult(result)
    setIsSubmitting(false)
  }

  async function verifyConnection() {
    setIsVerifying(true)
    setErrorMessage(null)
    const result = await verifyAdminTenantProvider(
      apiBaseUrl,
      tenantId,
      providerRecord.id,
    )
    if (result.status === 'unauthenticated') {
      onSessionExpired()
    } else if (result.status === 'verified') {
      onProviderChanged(applyProviderVerification(providerRecord, result.verification))
    } else if (result.status === 'conflict') {
      setErrorMessage('La connexion a été modifiée. Relancez la vérification.')
    } else if (result.status === 'not_found') {
      setErrorMessage('Cette connexion n’existe plus.')
    } else {
      setErrorMessage('La vérification n’a pas pu être lancée.')
    }
    setIsVerifying(false)
  }

  async function disableConnection() {
    setIsDisabling(true)
    setErrorMessage(null)
    const result = await deleteAdminTenantProvider(
      apiBaseUrl,
      tenantId,
      providerRecord.id,
    )
    if (result.status === 'unauthenticated') {
      onSessionExpired()
    } else if (result.status === 'deleted') {
      onProviderChanged({
        ...providerRecord,
        status: 'disabled',
        last_verified_at: null,
        last_verification_status: null,
        last_verification_http_status: null,
        last_verification_code: null,
        last_verification_message: null,
      })
      closeForm()
    } else {
      setErrorMessage(result.status === 'not_found'
        ? 'Cette connexion n’existe plus.'
        : 'La connexion n’a pas pu être désactivée.')
    }
    setIsDisabling(false)
  }

  async function reactivateConnection() {
    setIsSubmitting(true)
    setErrorMessage(null)
    const result = await updateAdminTenantProvider(
      apiBaseUrl,
      tenantId,
      providerRecord.id,
      { status: 'active' },
    )
    await handleMutationResult(result)
    setIsSubmitting(false)
  }

  return (
    <article className="provider-card">
      <div className="provider-card__header">
        <div>
          <p className="provider-card__eyebrow">Provider</p>
          <h4>{title}</h4>
        </div>
        <span className={providerRecord.status === 'active'
          ? 'tenant-status tenant-status--active'
          : 'tenant-status'}>
          {providerRecord.status}
        </span>
      </div>

      <dl className="provider-card__details">
        <div>
          <dt>Connexion</dt>
          <dd className={`provider-connection provider-connection--${connectionState}`}>
            {getProviderConnectionLabel(connectionState)}
          </dd>
        </div>
        <div>
          <dt>Nom</dt>
          <dd>{providerRecord.name}</dd>
        </div>
        <div>
          <dt>Credential</dt>
          <dd>{providerRecord.credential_configured ? 'Configuré' : 'Non configuré'}</dd>
        </div>
        <div>
          <dt>{configurationLabel}</dt>
          <dd>{currentConfiguration || '—'}</dd>
        </div>
        <div>
          <dt>Dernière vérification</dt>
          <dd>{formatVerificationDate(providerRecord.last_verified_at)}</dd>
        </div>
      </dl>

      {providerRecord.last_verified_at !== null ? (
        <div
          aria-live="polite"
          className={`provider-verification provider-verification--${connectionState}`}
        >
          <strong>{connectionState === 'ok' ? 'Connexion vérifiée' : 'Échec de la vérification'}</strong>
          {providerRecord.last_verification_message ? (
            <p>{providerRecord.last_verification_message}</p>
          ) : null}
          {providerRecord.last_verification_http_status !== null ? (
            <span>HTTP {providerRecord.last_verification_http_status}</span>
          ) : providerRecord.last_verification_code ? (
            <span>{providerRecord.last_verification_code}</span>
          ) : null}
        </div>
      ) : null}

      {formMode === 'edit' ? (
        <form className="provider-form" onSubmit={submitForm}>
          <label>
            Nom
            <input
              disabled={isSubmitting}
              maxLength={200}
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </label>
          <label>
            {configurationLabel}{provider === 'notion' ? ' (facultatif)' : ''}
            <input
              autoCapitalize="none"
              disabled={isSubmitting}
              onChange={(event) => setConfigurationValue(event.target.value)}
              placeholder={provider === 'n8n' ? 'https://instance.example.com' : undefined}
              spellCheck={false}
              type={provider === 'n8n' ? 'url' : 'text'}
              value={configurationValue}
            />
          </label>
          {errorMessage ? <p className="provider-form__error" role="alert">{errorMessage}</p> : null}
          <div className="provider-form__actions">
            <button className="secondary-button" disabled={isSubmitting} onClick={closeForm} type="button">
              Annuler
            </button>
            <button className="primary-button" disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      ) : formMode === 'credential' ? (
        <form className="provider-form" onSubmit={submitCredential}>
          <label>
            Nouveau {secretLabel.toLocaleLowerCase('fr-FR')}
            <input
              autoComplete="new-password"
              autoFocus
              disabled={isSubmitting}
              onChange={(event) => setSecret(event.target.value)}
              type="password"
              value={secret}
            />
          </label>
          <p className="provider-form__help">Le credential actuel n’est jamais affiché.</p>
          {errorMessage ? <p className="provider-form__error" role="alert">{errorMessage}</p> : null}
          <div className="provider-form__actions">
            <button className="secondary-button" disabled={isSubmitting} onClick={closeForm} type="button">
              Annuler
            </button>
            <button className="primary-button" disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Remplacement…' : 'Remplacer'}
            </button>
          </div>
        </form>
      ) : (
        <>
          {errorMessage ? <p className="provider-form__error" role="alert">{errorMessage}</p> : null}
          <div className="provider-card__actions">
            {providerRecord.status !== 'active' ? (
              <button
                className="primary-button"
                disabled={isSubmitting}
                onClick={reactivateConnection}
                type="button"
              >
                {isSubmitting ? 'Réactivation…' : 'Réactiver'}
              </button>
            ) : (
              <>
                <button className="secondary-button" onClick={openEditForm} type="button">
                  Modifier
                </button>
                <button className="secondary-button" onClick={openCredentialForm} type="button">
                  {secretReplacementLabel}
                </button>
                <button
                  className="primary-button"
                  disabled={isVerifying || !providerRecord.credential_configured}
                  onClick={verifyConnection}
                  type="button"
                >
                  {isVerifying ? 'Vérification…' : 'Vérifier la connexion'}
                </button>
                <button
                  className="provider-card__disable"
                  disabled={isDisabling || isVerifying}
                  onClick={disableConnection}
                  type="button"
                >
                  {isDisabling ? 'Désactivation…' : 'Désactiver'}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </article>
  )
}

interface ProviderCreationFormProps {
  apiBaseUrl: string | null
  tenantId: string
  onCancel: () => void
  onCreated: (provider: AdminProviderRecord) => void
  onSessionExpired: () => void
}

function ProviderCreationForm({
  apiBaseUrl,
  tenantId,
  onCancel,
  onCreated,
  onSessionExpired,
}: ProviderCreationFormProps) {
  const [provider, setProvider] = useState<AdminProvider>('notion')
  const [name, setName] = useState('')
  const [configurationValue, setConfigurationValue] = useState('')
  const [secret, setSecret] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const { secretLabel } = getProviderDefinition(provider)
  const configurationLabel = provider === 'notion'
    ? 'Référence workspace (facultatif)'
    : 'URL de base'

  function cancelCreation() {
    if (isSubmitting) return
    setSecret('')
    onCancel()
  }

  async function submitCreation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedName = name.trim()
    const normalizedConfiguration = configurationValue.trim()
    if (
      normalizedName.length === 0
      || secret.length === 0
      || (provider === 'n8n' && normalizedConfiguration.length === 0)
    ) {
      setErrorMessage('Renseignez tous les champs obligatoires.')
      return
    }

    setIsSubmitting(true)
    setErrorMessage(null)
    const result = await createAdminTenantProvider(apiBaseUrl, tenantId, {
      provider,
      name: normalizedName,
      configuration: buildProviderConfiguration(provider, normalizedConfiguration),
      secret,
    })
    setSecret('')
    setIsSubmitting(false)
    if (result.status === 'unauthenticated') {
      onSessionExpired()
      return
    }
    if (result.status !== 'saved') {
      setErrorMessage(mutationErrorMessage(result))
      return
    }
    onCreated(result.provider)
  }

  return (
    <form className="provider-form provider-form--creation" onSubmit={submitCreation}>
      <div className="provider-form__heading">
        <div>
          <h4>Ajouter un provider</h4>
          <p>La connexion apparaîtra après sa création côté backend.</p>
        </div>
      </div>
      <label>
        Provider
        <select
          disabled={isSubmitting}
          onChange={(event) => {
            setProvider(event.target.value as AdminProvider)
            setConfigurationValue('')
            setSecret('')
            setErrorMessage(null)
          }}
          value={provider}
        >
          <option value="notion">Notion</option>
          <option value="n8n">n8n</option>
        </select>
      </label>
      <label>
        Nom
        <input
          disabled={isSubmitting}
          maxLength={200}
          onChange={(event) => setName(event.target.value)}
          value={name}
        />
      </label>
      <label>
        {configurationLabel}
        <input
          autoCapitalize="none"
          disabled={isSubmitting}
          onChange={(event) => setConfigurationValue(event.target.value)}
          placeholder={provider === 'n8n' ? 'https://instance.example.com' : undefined}
          spellCheck={false}
          type={provider === 'n8n' ? 'url' : 'text'}
          value={configurationValue}
        />
      </label>
      <label>
        {secretLabel}
        <input
          autoComplete="new-password"
          disabled={isSubmitting}
          onChange={(event) => setSecret(event.target.value)}
          type="password"
          value={secret}
        />
      </label>
      {errorMessage ? <p className="provider-form__error" role="alert">{errorMessage}</p> : null}
      <div className="provider-form__actions">
        <button className="secondary-button" disabled={isSubmitting} onClick={cancelCreation} type="button">
          Annuler
        </button>
        <button className="primary-button" disabled={isSubmitting} type="submit">
          {isSubmitting ? 'Création…' : 'Créer le provider'}
        </button>
      </div>
    </form>
  )
}

export function AdminTenantIntegration({
  apiBaseUrl,
  tenantId,
  tenantStatus,
  onSessionExpired,
}: AdminTenantIntegrationProps) {
  const [providers, setProviders] = useState<AdminProviderRecord[]>([])
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [reloadKey, setReloadKey] = useState(0)
  const [isAddingProvider, setIsAddingProvider] = useState(false)

  useEffect(() => {
    if (tenantStatus === 'archived') {
      setProviders([])
      setIsAddingProvider(false)
      setLoadState('loaded')
      return undefined
    }

    const abortController = new AbortController()
    let isActive = true
    setProviders([])
    setIsAddingProvider(false)
    setLoadState('loading')
    void fetchAdminTenantProviders(
      apiBaseUrl,
      tenantId,
      abortController.signal,
    ).then((result) => {
      if (!isActive) return
      if (result.status === 'unauthenticated') {
        onSessionExpired()
        return
      }
      if (result.status === 'loaded') {
        setProviders(result.providers)
        setLoadState('loaded')
      } else {
        setLoadState('error')
      }
    })
    return () => {
      isActive = false
      abortController.abort()
    }
  }, [apiBaseUrl, onSessionExpired, reloadKey, tenantId, tenantStatus])

  function updateProvider(provider: AdminProviderRecord) {
    setProviders((currentProviders) => upsertProviderRecord(currentProviders, provider))
  }

  function addProvider(provider: AdminProviderRecord) {
    updateProvider(provider)
    setIsAddingProvider(false)
  }

  return (
    <section aria-labelledby="tenant-integration-title" className="tenant-integration">
      <div className="tenant-integration__heading">
        <div>
          <h3 id="tenant-integration-title">Intégration</h3>
          <p>Configurez les connexions externes et vérifiez leur authentification.</p>
        </div>
        {tenantStatus === 'active' && loadState === 'loaded' && !isAddingProvider ? (
          <button
            className="primary-button"
            onClick={() => setIsAddingProvider(true)}
            type="button"
          >
            + Ajouter un provider
          </button>
        ) : null}
      </div>
      {tenantStatus === 'archived' ? (
        <div className="provider-list-state provider-list-state--archived">
          <strong>Client archivé.</strong>
          <p>
            Les intégrations sont désactivées et les credentials ont été révoqués.
            Réactivez le client pour configurer de nouvelles connexions.
          </p>
        </div>
      ) : loadState === 'loading' ? (
        <div aria-live="polite" className="provider-list-state">
          <span className="session-loading__indicator" aria-hidden="true" />
          <p>Chargement des providers…</p>
        </div>
      ) : loadState === 'error' ? (
        <div className="provider-list-state" role="alert">
          <p>Les connexions ne peuvent pas être chargées pour le moment.</p>
          <button className="secondary-button" onClick={() => setReloadKey((key) => key + 1)} type="button">
            Réessayer
          </button>
        </div>
      ) : (
        <>
          {isAddingProvider ? (
            <ProviderCreationForm
              apiBaseUrl={apiBaseUrl}
              onCancel={() => setIsAddingProvider(false)}
              onCreated={addProvider}
              onSessionExpired={onSessionExpired}
              tenantId={tenantId}
            />
          ) : null}
          {providers.length === 0 && !isAddingProvider ? (
            <div className="provider-list-state provider-list-state--empty">
              <p>Aucun provider configuré.</p>
            </div>
          ) : providers.length > 0 ? (
            <div className="provider-grid">
              {providers.map((providerRecord) => (
                <ProviderCard
                  apiBaseUrl={apiBaseUrl}
                  key={providerRecord.id}
                  onProviderChanged={updateProvider}
                  onSessionExpired={onSessionExpired}
                  providerRecord={providerRecord}
                  tenantId={tenantId}
                />
              ))}
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}
