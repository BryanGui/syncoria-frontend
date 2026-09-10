import { useEffect, useRef, useState } from 'react'

import {
  fetchAdminTenantIngestion,
  fetchLatestAdminTenantIngestion,
  launchAdminTenantIngestion,
  supportsInitialIngestionProvider,
  type AdminInitialIngestion,
  type AdminInitialIngestionSource,
} from '../api/adminTenantIngestions'
import {
  fetchAdminTenantProviders,
  type AdminProviderRecord,
} from '../api/adminTenantProviders'
import {
  getInitialIngestionStatusLabel,
  getProgressCountLabel,
  getProgressWidth,
  isInitialIngestionActive,
  isLaunchResponseCurrent,
} from '../tenantIngestion'

const POLLING_INTERVAL_MS = 5_000

interface AdminTenantIngestionProps {
  apiBaseUrl: string | null
  tenantId: string
  tenantSlug: string
  tenantStatus: string
  onSessionExpired: () => void
}

function formatDate(value: string | null): string {
  if (value === null) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date indisponible'
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function formatDuration(startedAt: string, completedAt: string | null): string {
  if (completedAt === null) return 'En cours'
  const duration = new Date(completedAt).getTime() - new Date(startedAt).getTime()
  if (!Number.isFinite(duration) || duration < 0) return 'Durée indisponible'
  const seconds = Math.floor(duration / 1_000)
  const minutes = Math.floor(seconds / 60)
  if (minutes === 0) return `${seconds} s`
  return `${minutes} min ${seconds % 60} s`
}

function formatProvider(tenantSlug: string, providerType: string): string {
  return `${tenantSlug} · ${providerType}`
}

function ProgressBar({
  expected,
  processed,
  label,
}: {
  expected: number | null
  processed: number
  label: string
}) {
  const width = getProgressWidth(processed, expected)
  const isIndeterminate = width === null

  return (
    <div
      aria-label={label}
      aria-valuemax={expected === null || expected <= 0 ? undefined : expected}
      aria-valuemin={expected === null || expected <= 0 ? undefined : 0}
      aria-valuenow={expected === null || expected <= 0 ? undefined : processed}
      className={isIndeterminate ? 'ingestion-progress ingestion-progress--indeterminate' : 'ingestion-progress'}
      role="progressbar"
    >
      <span
        className="ingestion-progress__value"
        style={width === null ? undefined : { width: `${width}%` }}
      />
    </div>
  )
}

function SourceCard({ source }: { source: AdminInitialIngestionSource }) {
  const expected = source.observed_record_count
  return (
    <article className="ingestion-source">
      <div className="ingestion-source__header">
        <h4>{source.source_name}</h4>
        <span className={`ingestion-status ingestion-status--${source.status}`}>
          {getInitialIngestionStatusLabel(source.status)}
        </span>
      </div>
      <ProgressBar
        expected={expected}
        label={`Progression de ${source.source_name}`}
        processed={source.items_processed}
      />
      <div className="ingestion-source__counts">
        <span>{getProgressCountLabel(source.items_processed, expected)}</span>
        <span>{source.items_inserted} insérés · {source.items_duplicate} doublons</span>
      </div>
      <dl className="ingestion-source__details">
        <div><dt>Début</dt><dd>{formatDate(source.started_at)}</dd></div>
        <div><dt>Durée</dt><dd>{source.started_at === null ? '—' : formatDuration(source.started_at, source.completed_at)}</dd></div>
        {source.run_id !== null ? <div><dt>Dernier run</dt><dd>{source.run_id}</dd></div> : null}
      </dl>
      {source.error_code !== null ? (
        <p className="ingestion-source__error" role="alert">Erreur : {source.error_code}</p>
      ) : null}
    </article>
  )
}

export function AdminTenantIngestion({
  apiBaseUrl,
  tenantId,
  tenantSlug,
  tenantStatus,
  onSessionExpired,
}: AdminTenantIngestionProps) {
  const [providers, setProviders] = useState<AdminProviderRecord[]>([])
  const [selectedProviderId, setSelectedProviderId] = useState('')
  const [providerState, setProviderState] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [operationState, setOperationState] = useState<'idle' | 'loading' | 'none' | 'error'>('idle')
  const [operation, setOperation] = useState<AdminInitialIngestion | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isLaunching, setIsLaunching] = useState(false)
  const selectedProviderIdRef = useRef(selectedProviderId)

  const selectedProvider = providers.find((provider) => provider.id === selectedProviderId) ?? null
  const isSelectedProviderSupported = selectedProvider !== null
    && supportsInitialIngestionProvider(selectedProvider.provider)

  useEffect(() => {
    selectedProviderIdRef.current = selectedProviderId
  }, [selectedProviderId])

  useEffect(() => {
    if (tenantStatus !== 'active') {
      setProviders([])
      setSelectedProviderId('')
      setOperation(null)
      setProviderState('loaded')
      return undefined
    }
    const abortController = new AbortController()
    let isCurrent = true
    setProviderState('loading')
    setOperation(null)
    void fetchAdminTenantProviders(apiBaseUrl, tenantId, abortController.signal).then((result) => {
      if (!isCurrent) return
      if (result.status === 'unauthenticated') {
        onSessionExpired()
        return
      }
      if (result.status !== 'loaded') {
        setProviderState('error')
        return
      }
      setProviders(result.providers)
      setSelectedProviderId((currentId) => {
        const nextProviderId = result.providers.some((provider) => provider.id === currentId)
          ? currentId
          : (result.providers[0]?.id ?? '')
        selectedProviderIdRef.current = nextProviderId
        return nextProviderId
      })
      setProviderState('loaded')
    })
    return () => {
      isCurrent = false
      abortController.abort()
    }
  }, [apiBaseUrl, onSessionExpired, tenantId, tenantStatus])

  useEffect(() => {
    if (selectedProvider === null || tenantStatus !== 'active') {
      setOperationState('idle')
      return undefined
    }
    const abortController = new AbortController()
    let isCurrent = true
    setOperation(null)
    setErrorMessage(null)
    setOperationState('loading')
    void fetchLatestAdminTenantIngestion(
      apiBaseUrl,
      tenantId,
      selectedProvider.id,
      abortController.signal,
    ).then((result) => {
      if (!isCurrent) return
      if (result.status === 'unauthenticated') {
        onSessionExpired()
        return
      }
      if (result.status === 'loaded') {
        setOperation(result.operation)
        setOperationState('idle')
      } else if (result.status === 'not_found') {
        setOperationState('none')
      } else {
        setOperationState('error')
        setErrorMessage('L’état d’ingestion ne peut pas être chargé pour le moment.')
      }
    })
    return () => {
      isCurrent = false
      abortController.abort()
    }
  }, [apiBaseUrl, onSessionExpired, selectedProvider, tenantId, tenantStatus])

  useEffect(() => {
    if (selectedProvider === null || operation === null || !isInitialIngestionActive(operation.status)) {
      return undefined
    }
    let isCurrent = true
    const refreshOperation = () => {
      void fetchAdminTenantIngestion(
        apiBaseUrl,
        tenantId,
        selectedProvider.id,
        operation.correlation_id,
      ).then((result) => {
        if (!isCurrent) return
        if (result.status === 'unauthenticated') {
          onSessionExpired()
          return
        }
        if (result.status === 'loaded') {
          setOperation(result.operation)
          setErrorMessage(null)
        } else {
          setErrorMessage('La mise à jour de l’ingestion est momentanément indisponible.')
        }
      })
    }
    const timer = window.setInterval(refreshOperation, POLLING_INTERVAL_MS)
    return () => {
      isCurrent = false
      window.clearInterval(timer)
    }
  }, [apiBaseUrl, onSessionExpired, operation, selectedProvider, tenantId])

  async function launchIngestion() {
    if (
      selectedProvider === null
      || !supportsInitialIngestionProvider(selectedProvider.provider)
      || isLaunching
      || (operation !== null && isInitialIngestionActive(operation.status))
    ) return
    const launchedProviderId = selectedProvider.id
    setIsLaunching(true)
    setErrorMessage(null)
    const result = await launchAdminTenantIngestion(
      apiBaseUrl,
      tenantId,
      launchedProviderId,
      selectedProvider.provider,
    )
    setIsLaunching(false)
    if (!isLaunchResponseCurrent(selectedProviderIdRef.current, launchedProviderId)) return
    if (result.status === 'unauthenticated') {
      onSessionExpired()
      return
    }
    if (result.status === 'loaded') {
      setOperation(result.operation)
      setOperationState('idle')
      return
    }
    setErrorMessage(result.status === 'conflict'
      ? 'Une ingestion est déjà en cours pour ce provider.'
      : 'L’ingestion ne peut pas être lancée pour le moment.')
  }

  if (tenantStatus !== 'active') {
    return (
      <section className="tenant-ingestion" aria-labelledby="tenant-ingestion-title">
        <h3 id="tenant-ingestion-title">Ingestion</h3>
        <p className="ingestion-empty">Client archivé : l’ingestion n’est pas disponible.</p>
      </section>
    )
  }

  return (
    <section aria-labelledby="tenant-ingestion-title" className="tenant-ingestion">
      <div className="tenant-ingestion__heading">
        {selectedProvider !== null ? (
          <button
            className="primary-button"
            disabled={isLaunching || !isSelectedProviderSupported || selectedProvider.status !== 'active' || (operation !== null && isInitialIngestionActive(operation.status))}
            onClick={() => void launchIngestion()}
            type="button"
          >
            {isLaunching ? 'Lancement…' : 'Lancer l’ingestion'}
          </button>
        ) : null}
        <div>
          <h3 id="tenant-ingestion-title">Ingestion</h3>
          <p>Copie brute initiale des sources retenues vers Syncoria.</p>
        </div>
      </div>

      {providerState === 'loading' ? (
        <div aria-live="polite" className="ingestion-empty"><span className="session-loading__indicator" aria-hidden="true" />Chargement des providers…</div>
      ) : providerState === 'error' ? (
        <p className="ingestion-error" role="alert">Les providers ne peuvent pas être chargés pour le moment.</p>
      ) : providers.length === 0 ? (
        <p className="ingestion-empty">Aucun provider configuré pour ce tenant.</p>
      ) : selectedProvider === null ? null : (
        <>
          <label className="ingestion-provider-select">
            Provider record concerné
            <select
              disabled={isLaunching}
              onChange={(event) => {
                selectedProviderIdRef.current = event.target.value
                setSelectedProviderId(event.target.value)
              }}
              value={selectedProviderId}
            >
              {providers.map((provider) => <option key={provider.id} value={provider.id}>{formatProvider(tenantSlug, provider.provider)}</option>)}
            </select>
          </label>
          {!isSelectedProviderSupported ? (
            <p className="ingestion-notice">L’ingestion initiale n’est pas encore disponible pour ce provider.</p>
          ) : null}
          {errorMessage !== null ? <p className="ingestion-error" role="alert">{errorMessage}</p> : null}
          {operationState === 'loading' ? <p className="ingestion-empty">Chargement de la dernière ingestion…</p> : null}
          {operationState === 'none' ? <p className="ingestion-empty">Aucune ingestion n’a encore été lancée pour ce provider.</p> : null}
          {operation !== null ? (
            <div className="ingestion-operation">
              <div className="ingestion-operation__summary">
                <div>
                  <p className="provider-card__eyebrow">Statut global</p>
                  <strong className={`ingestion-status ingestion-status--${operation.status}`}>{getInitialIngestionStatusLabel(operation.status)}</strong>
                </div>
                <div><span>Début</span><strong>{formatDate(operation.started_at)}</strong></div>
                <div><span>Durée</span><strong>{formatDuration(operation.started_at, operation.completed_at)}</strong></div>
                <div><span>Sources</span><strong>{operation.sources_total}</strong></div>
              </div>
              <div className="ingestion-operation__progress">
                <div className="ingestion-operation__progress-heading">
                  <h4>Progression globale</h4>
                  <span>{getProgressCountLabel(operation.items_processed, operation.items_expected)}</span>
                </div>
                <ProgressBar expected={operation.items_expected} label="Progression globale" processed={operation.items_processed} />
                <p>{operation.items_inserted} insérés · {operation.items_duplicate} doublons · {operation.items_rejected} rejetés</p>
              </div>
              <div className="ingestion-source-grid">
                {operation.sources.map((source) => <SourceCard key={source.external_source_id} source={source} />)}
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}
