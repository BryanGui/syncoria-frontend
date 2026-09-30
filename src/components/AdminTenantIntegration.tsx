import { useEffect, useId, useState, type FormEvent } from 'react'

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
  getProviderConnectionState,
  upsertProviderRecord,
} from '../tenantProviders/state'
import { getProviderLabel } from '../providers/catalog'
import { ProviderLogo } from './ProviderLogo'
import { ActionMenu } from './ui/ActionMenu'

interface AdminTenantIntegrationProps {
  apiBaseUrl: string | null
  tenantId: string
  tenantStatus: string
  onSessionExpired: () => void
}

interface ProviderDefinition {
  secretLabel: string
  credentialTypes: readonly [
    { value: string; label: string },
    ...Array<{ value: string; label: string }>,
  ]
}

function getProviderDefinition(provider: string): ProviderDefinition {
  if (provider === 'notion') {
    return {
      secretLabel: 'Token Notion',
      credentialTypes: [{ value: 'integration_token', label: 'Token' }],
    }
  }
  if (provider === 'n8n') {
    return {
      secretLabel: 'Clé API n8n',
      credentialTypes: [{ value: 'api_key', label: 'Clé API' }],
    }
  }
  return {
    secretLabel: 'Identifiant de connexion',
    credentialTypes: [{ value: 'api_key', label: 'Clé API' }],
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
    return 'Une connexion active existe déjà pour cet outil.'
  }
  if (result.status === 'invalid') return 'Vérifiez les informations saisies.'
  if (result.status === 'not_found') return 'Cette connexion n’existe plus.'
  return 'La modification n’a pas pu être enregistrée.'
}

interface ProviderRowProps {
  apiBaseUrl: string | null
  providerRecord: AdminProviderRecord
  tenantId: string
  onProviderChanged: (provider: AdminProviderRecord) => void
  onSessionExpired: () => void
  expanded: boolean
  onExpand: () => void
  onToggle: () => void
}

function ProviderRow({
  apiBaseUrl,
  providerRecord,
  tenantId,
  onProviderChanged,
  onSessionExpired,
  expanded,
  onExpand,
  onToggle,
}: ProviderRowProps) {
  const provider = providerRecord.provider
  const { secretLabel, credentialTypes } = getProviderDefinition(provider)
  const title = getProviderLabel(provider)
  const detailsId = useId()
  const [formMode, setFormMode] = useState<FormMode>(null)
  const [name, setName] = useState('')
  const [configurationValue, setConfigurationValue] = useState('')
  const [secret, setSecret] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [isDisabling, setIsDisabling] = useState(false)
  const [confirmDisable, setConfirmDisable] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const connectionState = getProviderConnectionState(providerRecord)
  const credentialTypeLabel = credentialTypes.find(
    ({ value }) => value === providerRecord.credential_type,
  )?.label ?? 'À préciser'
  const configurationLabel = provider === 'notion'
    ? 'Référence workspace'
    : 'URL de base'
  const currentConfiguration = provider === 'notion'
    ? providerRecord.configuration.workspace_reference
    : providerRecord.configuration.base_url
  const displayName = providerRecord.name.trim().toLocaleLowerCase('fr-FR') !== title.toLocaleLowerCase('fr-FR')
    ? providerRecord.name
    : null
  const statusLabel = isVerifying ? 'Vérification…'
    : providerRecord.status !== 'active' ? 'Inactif'
      : connectionState === 'ok' ? 'Connecté'
        : connectionState === 'error' ? 'Erreur de vérification'
          : connectionState === 'not_configured' ? 'Non configuré'
            : 'À vérifier'

  function closeForm() {
    if (isSubmitting) return
    setSecret('')
    setErrorMessage(null)
    setFormMode(null)
  }

  function openEditForm() {
    onExpand()
    setConfirmDisable(false)
    setName(providerRecord.name)
    setConfigurationValue(currentConfiguration ?? '')
    setSecret('')
    setErrorMessage(null)
    setFormMode('edit')
  }

  function openCredentialForm() {
    onExpand()
    setConfirmDisable(false)
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
      setErrorMessage('Renseignez les nouveaux identifiants.')
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
    onExpand()
    setConfirmDisable(false)
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
      setConfirmDisable(false)
    } else {
      setErrorMessage(result.status === 'not_found'
        ? 'Cette connexion n’existe plus.'
        : 'La connexion n’a pas pu être désactivée.')
    }
    setIsDisabling(false)
  }

  async function reactivateConnection() {
    onExpand()
    setConfirmDisable(false)
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
    <article className="source-connection">
      <div className="source-connection__row">
        <button
          aria-controls={detailsId}
          aria-expanded={expanded}
          aria-label={`Détails de la connexion ${providerRecord.name}`}
          className="source-connection__toggle"
          onClick={onToggle}
          type="button"
        >
          <ProviderLogo provider={provider} />
          <span className="source-connection__identity">
            <strong>{title}</strong>
            {displayName ? <span>{displayName}</span> : null}
          </span>
          <span aria-live="polite" className={`source-connection__status source-connection__status--${providerRecord.status !== 'active' ? 'inactive' : connectionState}`}>
            {statusLabel}
          </span>
        </button>
        <div className="source-connection__menu">
          <ActionMenu ariaLabel={`Actions pour ${providerRecord.name}`} label="⋯" portal>
            {providerRecord.status !== 'active' ? (
              <button disabled={isSubmitting} onClick={() => void reactivateConnection()} type="button">
                {isSubmitting ? 'Réactivation…' : 'Activer'}
              </button>
            ) : (
              <>
                <button disabled={isSubmitting} onClick={openEditForm} type="button">Modifier</button>
                <button disabled={isSubmitting} onClick={openCredentialForm} type="button">Modifier les identifiants</button>
                <button disabled={isVerifying || !providerRecord.credential_configured} onClick={() => void verifyConnection()} type="button">
                  {isVerifying ? 'Vérification…' : 'Vérifier la connexion'}
                </button>
                <button disabled={isDisabling || isVerifying} onClick={() => {
                  onExpand()
                  setFormMode(null)
                  setErrorMessage(null)
                  setConfirmDisable(true)
                }} type="button">Désactiver</button>
              </>
            )}
          </ActionMenu>
        </div>
      </div>

      <div className="source-connection__details" hidden={!expanded} id={detailsId}>
        <dl>
          {providerRecord.configuration.workspace_reference ? (
            <div><dt>Workspace</dt><dd>{providerRecord.configuration.workspace_reference}</dd></div>
          ) : null}
          {providerRecord.configuration.base_url ? (
            <div><dt>URL de base</dt><dd>{providerRecord.configuration.base_url}</dd></div>
          ) : null}
          <div><dt>Identifiants</dt><dd>{providerRecord.credential_configured ? 'Configurés' : 'Non configurés'}</dd></div>
          {providerRecord.credential_type ? (
            <div><dt>Type d’identifiant</dt><dd>{credentialTypeLabel}</dd></div>
          ) : null}
          {providerRecord.last_verified_at ? (
            <div><dt>Dernière vérification</dt><dd>{formatVerificationDate(providerRecord.last_verified_at)}</dd></div>
          ) : null}
          {providerRecord.last_verification_http_status !== null ? (
            <div><dt>Réponse</dt><dd>HTTP {providerRecord.last_verification_http_status}</dd></div>
          ) : providerRecord.last_verification_code ? (
            <div><dt>Code</dt><dd>{providerRecord.last_verification_code}</dd></div>
          ) : null}
          {providerRecord.last_verification_message ? (
            <div><dt>Message</dt><dd>{providerRecord.last_verification_message}</dd></div>
          ) : null}
        </dl>

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
              <button className="secondary-button" disabled={isSubmitting} onClick={closeForm} type="button">Annuler</button>
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
            <p className="provider-form__help">Les identifiants actuels ne sont jamais affichés.</p>
            {errorMessage ? <p className="provider-form__error" role="alert">{errorMessage}</p> : null}
            <div className="provider-form__actions">
              <button className="secondary-button" disabled={isSubmitting} onClick={closeForm} type="button">Annuler</button>
              <button className="primary-button" disabled={isSubmitting} type="submit">
                {isSubmitting ? 'Remplacement…' : 'Remplacer'}
              </button>
            </div>
          </form>
        ) : confirmDisable ? (
          <div aria-label={`Désactiver ${providerRecord.name}`} className="source-connection__confirmation" role="alertdialog">
            <strong>Désactiver cette connexion ?</strong>
            <p>Cette action désactive la connexion. Vous pourrez la réactiver ensuite.</p>
            {errorMessage ? <p className="provider-form__error" role="alert">{errorMessage}</p> : null}
            <div className="provider-form__actions">
              <button className="secondary-button" disabled={isDisabling} onClick={() => setConfirmDisable(false)} type="button">Annuler</button>
              <button className="danger-button" disabled={isDisabling} onClick={() => void disableConnection()} type="button">
                {isDisabling ? 'Désactivation…' : 'Confirmer la désactivation'}
              </button>
            </div>
          </div>
        ) : errorMessage ? <p className="provider-form__error" role="alert">{errorMessage}</p> : null}
      </div>
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
  const [credentialType, setCredentialType] = useState(
    getProviderDefinition('notion').credentialTypes[0].value,
  )
  const [name, setName] = useState('')
  const [configurationValue, setConfigurationValue] = useState('')
  const [secret, setSecret] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const { credentialTypes, secretLabel } = getProviderDefinition(provider)
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
      credential_type: credentialType,
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
          <h4>Connecter un outil</h4>
          <p>La connexion apparaîtra après sa création côté backend.</p>
        </div>
      </div>
      <label>
        Outil
        <select
          disabled={isSubmitting}
          onChange={(event) => {
            const nextProvider = event.target.value as AdminProvider
            setProvider(nextProvider)
            setCredentialType(
              getProviderDefinition(nextProvider).credentialTypes[0].value,
            )
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
        Type d’identifiant
        <select
          disabled={isSubmitting}
          onChange={(event) => setCredentialType(event.target.value)}
          value={credentialType}
        >
          {credentialTypes.map(({ label, value }) => (
            <option key={value} value={value}>{label}</option>
          ))}
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
          {isSubmitting ? 'Création…' : 'Créer la connexion'}
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
  const [expandedProviderId, setExpandedProviderId] = useState<string | null>(null)

  useEffect(() => {
    if (tenantStatus === 'archived') {
      setProviders([])
      setIsAddingProvider(false)
      setExpandedProviderId(null)
      setLoadState('loaded')
      return undefined
    }

    const abortController = new AbortController()
    let isActive = true
    setProviders([])
    setIsAddingProvider(false)
    setExpandedProviderId(null)
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
          <h3 id="tenant-integration-title">Sources</h3>
          <p>Gérez les outils et services connectés à cet espace.</p>
        </div>
        {tenantStatus === 'active' && loadState === 'loaded' && !isAddingProvider ? (
          <button
            className="primary-button"
            onClick={() => setIsAddingProvider(true)}
            type="button"
          >
            + Connecter un outil
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
          <p>Chargement des connexions…</p>
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
              <p>Aucune connexion configurée.</p>
            </div>
          ) : providers.length > 0 ? (
            <div className="source-connections">
              {providers.map((providerRecord) => (
                <ProviderRow
                  apiBaseUrl={apiBaseUrl}
                  expanded={expandedProviderId === providerRecord.id}
                  key={providerRecord.id}
                  onExpand={() => setExpandedProviderId(providerRecord.id)}
                  onProviderChanged={updateProvider}
                  onSessionExpired={onSessionExpired}
                  onToggle={() => setExpandedProviderId((current) => current === providerRecord.id ? null : providerRecord.id)}
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
