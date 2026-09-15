import { useEffect, useRef, useState } from 'react'

import {
  fetchAdminTenantIngestion,
  fetchAdminTenantIngestionHistory,
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

function formatDuration(
  seconds: number | null,
  status: AdminInitialIngestion['status'],
): string {
  if (seconds === null) {
    return isInitialIngestionActive(status) ? 'En cours' : 'Durée indisponible'
  }
  if (!Number.isSafeInteger(seconds) || seconds < 0) return 'Durée indisponible'
  const minutes = Math.floor(seconds / 60)
  if (minutes === 0) return `${seconds} s`
  return `${minutes} min ${seconds % 60} s`
}

function formatProviderType(provider: string): string {
  return provider.length === 0
    ? 'Provider inconnu'
    : `${provider.slice(0, 1).toUpperCase()}${provider.slice(1)}`
}

function formatProvider(provider: AdminProviderRecord): string {
  return `${formatProviderType(provider.provider)} — ${provider.name}`
}

function formatHistoryProvider(
  operation: AdminInitialIngestion,
  providers: AdminProviderRecord[],
): string {
  const provider = providers.find((item) => item.id === operation.tenant_provider_record_id)
  return provider === undefined
    ? formatProviderType(operation.provider)
    : formatProvider(provider)
}

function upsertOperation(
  operations: AdminInitialIngestion[],
  nextOperation: AdminInitialIngestion,
): AdminInitialIngestion[] {
  const index = operations.findIndex(
    (operation) => operation.correlation_id === nextOperation.correlation_id,
  )
  if (index === -1) return [nextOperation, ...operations]
  return operations.map((operation, operationIndex) => (
    operationIndex === index ? nextOperation : operation
  ))
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

function CountSummary({
  operation,
}: {
  operation: AdminInitialIngestion | AdminInitialIngestionSource
}) {
  return (
    <div className="ingestion-count-summary">
      <span>{operation.items_received} lus</span>
      <span>{operation.items_processed} traités</span>
      <span>{operation.items_inserted} insérés</span>
      <span>{operation.items_duplicate} doublons</span>
      <span>{operation.items_rejected} rejetés</span>
      <span>{operation.items_not_attempted} non tentés</span>
    </div>
  )
}

function SourceDetail({ source }: { source: AdminInitialIngestionSource }) {
  return (
    <article className="ingestion-source">
      <div className="ingestion-source__header">
        <div>
          <h5>{source.source_name}</h5>
          <code>{source.external_source_id}</code>
        </div>
        <span className={`ingestion-status ingestion-status--${source.status}`}>
          {getInitialIngestionStatusLabel(source.status)}
        </span>
      </div>
      <CountSummary operation={source} />
      <dl className="ingestion-source__details">
        <div><dt>Volume audité</dt><dd>{source.observed_record_count ?? '—'}</dd></div>
        <div><dt>Début</dt><dd>{formatDate(source.started_at)}</dd></div>
        <div><dt>Fin</dt><dd>{formatDate(source.completed_at)}</dd></div>
        <div><dt>Run technique</dt><dd>{source.run_id ?? '—'}</dd></div>
        <div><dt>Versions</dt><dd>{source.capture_contract_versions.join(', ') || '—'}</dd></div>
      </dl>
      {source.error_code !== null ? (
        <p className="ingestion-source__error" role="alert">Erreur : {source.error_code}</p>
      ) : null}
    </article>
  )
}

function OperationDetail({ operation }: { operation: AdminInitialIngestion }) {
  return (
    <div className="ingestion-history__detail">
      <div className="ingestion-operation__progress-heading">
        <h5>Progression globale</h5>
        <span>{getProgressCountLabel(operation.items_processed, operation.items_expected)}</span>
      </div>
      <ProgressBar
        expected={operation.items_expected}
        label={`Progression de l’ingestion ${operation.correlation_id}`}
        processed={operation.items_processed}
      />
      <CountSummary operation={operation} />
      <dl className="ingestion-history__metadata">
        <div><dt>Correlation ID</dt><dd>{operation.correlation_id}</dd></div>
        <div><dt>Durée</dt><dd>{formatDuration(operation.duration_seconds, operation.status)}</dd></div>
        <div><dt>Versions</dt><dd>{operation.capture_contract_versions.join(', ') || '—'}</dd></div>
        <div><dt>Erreurs</dt><dd>{operation.error_codes.join(', ') || 'Aucune'}</dd></div>
      </dl>
      <div className="ingestion-history__sources">
        <h5>Sources</h5>
        <div className="ingestion-source-grid">
          {operation.sources.map((source) => (
            <SourceDetail key={source.external_source_id} source={source} />
          ))}
        </div>
      </div>
    </div>
  )
}

function HistoryItem({
  expanded,
  operation,
  providerLabel,
  onToggle,
}: {
  expanded: boolean
  operation: AdminInitialIngestion
  providerLabel: string
  onToggle: () => void
}) {
  return (
    <article className="ingestion-history__item">
      <div className="ingestion-history__row">
        <div className="ingestion-history__identity">
          <p className="provider-card__eyebrow">Ingestion {providerLabel}</p>
          <h5>{formatDate(operation.started_at)}</h5>
          <span className={`ingestion-status ingestion-status--${operation.status}`}>
            {getInitialIngestionStatusLabel(operation.status)}
          </span>
        </div>
        <div className="ingestion-history__metrics">
          <span>{operation.sources_total} sources</span>
          <CountSummary operation={operation} />
          <span>Durée : {formatDuration(operation.duration_seconds, operation.status)}</span>
        </div>
        <button
          aria-controls={`ingestion-detail-${operation.correlation_id}`}
          aria-expanded={expanded}
          className="secondary-button"
          onClick={onToggle}
          type="button"
        >
          {expanded ? 'Masquer le détail' : 'Voir détail'}
        </button>
      </div>
      {expanded ? (
        <div id={`ingestion-detail-${operation.correlation_id}`}>
          <OperationDetail operation={operation} />
        </div>
      ) : null}
    </article>
  )
}

export function AdminTenantIngestion({
  apiBaseUrl,
  tenantId,
  tenantStatus,
  onSessionExpired,
}: AdminTenantIngestionProps) {
  const [providers, setProviders] = useState<AdminProviderRecord[]>([])
  const [selectedProviderId, setSelectedProviderId] = useState('')
  const [providerState, setProviderState] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [historyState, setHistoryState] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [operationState, setOperationState] = useState<'idle' | 'loading' | 'none' | 'error'>('idle')
  const [history, setHistory] = useState<AdminInitialIngestion[]>([])
  const [operation, setOperation] = useState<AdminInitialIngestion | null>(null)
  const [expandedCorrelationId, setExpandedCorrelationId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isLaunching, setIsLaunching] = useState(false)
  const selectedProviderIdRef = useRef(selectedProviderId)
  const operationRef = useRef<AdminInitialIngestion | null>(null)

  const selectedProvider = providers.find((provider) => provider.id === selectedProviderId) ?? null
  const isSelectedProviderSupported = selectedProvider !== null
    && selectedProvider.status === 'active'
    && supportsInitialIngestionProvider(selectedProvider.provider)

  useEffect(() => {
    selectedProviderIdRef.current = selectedProviderId
  }, [selectedProviderId])

  useEffect(() => {
    if (tenantStatus !== 'active') {
      setProviders([])
      setSelectedProviderId('')
      setOperation(null)
      operationRef.current = null
      setHistory([])
      setProviderState('loaded')
      setHistoryState('loaded')
      return undefined
    }
    const abortController = new AbortController()
    let isCurrent = true
    setProviderState('loading')
    setOperation(null)
    operationRef.current = null
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
        const currentStillExists = result.providers.some((provider) => provider.id === currentId)
        const firstActive = result.providers.find((provider) => provider.status === 'active')
        const nextProviderId = currentStillExists
          ? currentId
          : (firstActive?.id ?? result.providers[0]?.id ?? '')
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
    if (tenantStatus !== 'active') return undefined
    const abortController = new AbortController()
    let isCurrent = true
    setHistory([])
    setHistoryState('loading')
    void fetchAdminTenantIngestionHistory(apiBaseUrl, tenantId, abortController.signal).then((result) => {
      if (!isCurrent) return
      if (result.status === 'unauthenticated') {
        onSessionExpired()
        return
      }
      if (result.status !== 'loaded') {
        setHistoryState('error')
        return
      }
      const currentOperation = operationRef.current
      const currentTenantOperation = currentOperation?.tenant_id === tenantId
        ? currentOperation
        : null
      setHistory(currentTenantOperation === null
        ? result.operations
        : upsertOperation(result.operations, currentTenantOperation))
      setHistoryState('loaded')
    })
    return () => {
      isCurrent = false
      abortController.abort()
    }
  }, [apiBaseUrl, onSessionExpired, tenantId, tenantStatus])

  useEffect(() => {
    if (selectedProvider === null || tenantStatus !== 'active') {
      setOperationState('idle')
      setOperation(null)
      return undefined
    }
    const abortController = new AbortController()
    let isCurrent = true
    operationRef.current = null
    setOperation(null)
    setExpandedCorrelationId(null)
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
        operationRef.current = result.operation
        setOperation(result.operation)
        setHistory((current) => upsertOperation(current, result.operation))
        if (isInitialIngestionActive(result.operation.status)) {
          setExpandedCorrelationId(result.operation.correlation_id)
        }
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
          operationRef.current = result.operation
          setOperation(result.operation)
          setHistory((current) => upsertOperation(current, result.operation))
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
    if (selectedProvider === null || !isSelectedProviderSupported || isLaunching) return
    if (operation !== null && isInitialIngestionActive(operation.status)) return
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
      operationRef.current = result.operation
      setOperation(result.operation)
      setHistory((current) => upsertOperation(current, result.operation))
      setExpandedCorrelationId(result.operation.correlation_id)
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
        <div>
          <h3 id="tenant-ingestion-title">Ingestion</h3>
          <p>Un run correspond à un provider et reste consultable dans l’historique.</p>
        </div>
      </div>

      {providerState === 'loading' ? (
        <div aria-live="polite" className="ingestion-empty"><span className="session-loading__indicator" aria-hidden="true" />Chargement des providers…</div>
      ) : providerState === 'error' ? (
        <p className="ingestion-error" role="alert">Les providers ne peuvent pas être chargés pour le moment.</p>
      ) : providers.length === 0 ? (
        <p className="ingestion-empty">Aucun provider configuré pour ce tenant.</p>
      ) : (
        <>
          <div className="ingestion-launcher">
            <label className="ingestion-provider-select">
              Provider à ingérer
              <select
                disabled={isLaunching}
                onChange={(event) => {
                  selectedProviderIdRef.current = event.target.value
                  setSelectedProviderId(event.target.value)
                }}
                value={selectedProviderId}
              >
                {providers.map((provider) => (
                  <option
                    disabled={provider.status !== 'active' || !supportsInitialIngestionProvider(provider.provider)}
                    key={provider.id}
                    value={provider.id}
                  >
                    {formatProvider(provider)}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="primary-button"
              disabled={isLaunching || !isSelectedProviderSupported || (operation !== null && isInitialIngestionActive(operation.status))}
              onClick={() => void launchIngestion()}
              type="button"
            >
              {isLaunching ? 'Lancement…' : 'Lancer l’ingestion'}
            </button>
          </div>
          {selectedProvider !== null && !isSelectedProviderSupported ? (
            <p className="ingestion-notice">
              Ce provider est visible mais indisponible pour l’ingestion initiale.
            </p>
          ) : null}
          {errorMessage !== null ? <p className="ingestion-error" role="alert">{errorMessage}</p> : null}
          {operationState === 'loading' ? <p className="ingestion-empty">Chargement de la dernière ingestion…</p> : null}
          {operationState === 'none' ? <p className="ingestion-empty">Aucune ingestion n’a encore été lancée pour ce provider.</p> : null}
        </>
      )}

      <section aria-labelledby="ingestion-history-title" className="ingestion-history">
        <div className="ingestion-history__heading">
          <div>
            <p className="provider-card__eyebrow">Runs persistés</p>
            <h4 id="ingestion-history-title">Historique des ingestions</h4>
          </div>
        </div>
        {historyState === 'loading' ? (
          <p className="ingestion-empty">Chargement de l’historique…</p>
        ) : historyState === 'error' ? (
          <p className="ingestion-error" role="alert">L’historique des ingestions ne peut pas être chargé pour le moment.</p>
        ) : history.length === 0 ? (
          <p className="ingestion-empty">Aucune ingestion persistée pour ce tenant.</p>
        ) : (
          <div className="ingestion-history__list">
            {history.map((historyOperation) => (
              <HistoryItem
                expanded={expandedCorrelationId === historyOperation.correlation_id}
                key={historyOperation.correlation_id}
                onToggle={() => setExpandedCorrelationId((current) => (
                  current === historyOperation.correlation_id ? null : historyOperation.correlation_id
                ))}
                operation={historyOperation}
                providerLabel={formatHistoryProvider(historyOperation, providers)}
              />
            ))}
          </div>
        )}
      </section>
    </section>
  )
}
