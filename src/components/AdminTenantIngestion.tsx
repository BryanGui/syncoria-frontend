import { useEffect, useRef, useState } from 'react'

import {
  archiveAdminTenantIngestion,
  fetchAdminTenantIngestion,
  fetchAdminTenantIngestionHistory,
  fetchLatestAdminTenantIngestion,
  launchAdminTenantIngestion,
  type AdminInitialIngestion,
} from '../api/adminTenantIngestions'
import {
  fetchAdminTenantProviders,
  type AdminProviderRecord,
} from '../api/adminTenantProviders'
import {
  isInitialIngestionActive,
  isLaunchResponseCurrent,
} from '../tenantIngestion'
import { getProviderLabel } from '../providers/catalog'
import { IngestionHistoryTable, IngestionSourcesTable, IngestionSummary } from './IngestionTables'

const POLLING_INTERVAL_MS = 5_000

interface AdminTenantIngestionProps {
  apiBaseUrl: string | null
  tenantId: string
  tenantStatus: string
  onSessionExpired: () => void
}

function formatProvider(provider: AdminProviderRecord): string {
  return `${getProviderLabel(provider.provider)} — ${provider.name}`
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
  const [archiveHistory, setArchiveHistory] = useState<AdminInitialIngestion[]>([])
  const [showArchives, setShowArchives] = useState(false)
  const [operation, setOperation] = useState<AdminInitialIngestion | null>(null)
  const [expandedCorrelationId, setExpandedCorrelationId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isLaunching, setIsLaunching] = useState(false)
  const [isArchiving, setIsArchiving] = useState(false)
  const selectedProviderIdRef = useRef(selectedProviderId)
  const operationRef = useRef<AdminInitialIngestion | null>(null)
  const archivedCorrelationIdsRef = useRef(new Set<string>())

  const selectedProvider = providers.find((provider) => provider.id === selectedProviderId) ?? null
  const isSelectedProviderSupported = selectedProvider !== null
    && selectedProvider.status === 'active'
    && selectedProvider.initial_ingestion_supported

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
      setArchiveHistory([])
      archivedCorrelationIdsRef.current = new Set()
      setShowArchives(false)
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
    setArchiveHistory([])
    archivedCorrelationIdsRef.current = new Set()
    setShowArchives(false)
    setHistoryState('loading')
    void Promise.all([
      fetchAdminTenantIngestionHistory(apiBaseUrl, tenantId, abortController.signal, fetch, undefined, false),
      fetchAdminTenantIngestionHistory(apiBaseUrl, tenantId, abortController.signal, fetch, undefined, true),
    ]).then(([currentResult, archiveResult]) => {
      if (!isCurrent) return
      if (currentResult.status === 'unauthenticated' || archiveResult.status === 'unauthenticated') {
        onSessionExpired()
        return
      }
      if (currentResult.status !== 'loaded' || archiveResult.status !== 'loaded') {
        setHistoryState('error')
        return
      }
      const currentOperation = operationRef.current
      const currentTenantOperation = currentOperation?.tenant_id === tenantId
        ? currentOperation
        : null
      const currentOperations = currentResult.operations.filter((item) => !item.archived && !archivedCorrelationIdsRef.current.has(item.correlation_id))
      const archivedOperations = archiveResult.operations.filter((item) => item.archived)
      setHistory(currentTenantOperation === null
        ? currentOperations
        : upsertOperation(currentOperations, currentTenantOperation))
      setArchiveHistory((current) => {
        const fetchedIds = new Set(archivedOperations.map((item) => item.correlation_id))
        const localArchived = current.filter((item) => !fetchedIds.has(item.correlation_id))
        return [...localArchived, ...archivedOperations]
      })
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
      setExpandedCorrelationId(null)
      setOperationState('idle')
      return
    }
    setErrorMessage(result.status === 'conflict'
      ? 'Une ingestion est déjà en cours pour cet outil.'
      : 'L’ingestion ne peut pas être lancée pour le moment.')
  }

  async function archiveIngestion(historyOperation: AdminInitialIngestion) {
    if (isArchiving || historyOperation.archived || isInitialIngestionActive(historyOperation.status)) return
    setIsArchiving(true)
    setErrorMessage(null)
    const result = await archiveAdminTenantIngestion(
      apiBaseUrl,
      tenantId,
      historyOperation.tenant_provider_record_id,
      historyOperation.correlation_id,
    )
    setIsArchiving(false)
    if (result.status === 'unauthenticated') {
      onSessionExpired()
      return
    }
    if (result.status === 'loaded') {
      archivedCorrelationIdsRef.current.add(historyOperation.correlation_id)
      setHistory((current) => current.filter((item) => item.correlation_id !== historyOperation.correlation_id))
      setArchiveHistory((current) => upsertOperation(current, result.operation))
      setExpandedCorrelationId(null)
      if (operationRef.current?.correlation_id === historyOperation.correlation_id) {
        setOperation(null)
        operationRef.current = null
      }
      return
    }
    setErrorMessage(result.status === 'conflict'
      ? 'Une ingestion en cours ne peut pas être archivée.'
      : 'L’ingestion n’a pas pu être archivée. Réessayez.')
  }

  const visibleHistory = showArchives ? archiveHistory : history

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
          <p>Suivez la collecte des données depuis vos sources.</p>
        </div>
      </div>

      {providerState === 'loading' ? (
        <div aria-live="polite" className="ingestion-empty"><span className="session-loading__indicator" aria-hidden="true" />Chargement des outils…</div>
      ) : providerState === 'error' ? (
        <p className="ingestion-error" role="alert">Les outils ne peuvent pas être chargés pour le moment.</p>
      ) : providers.length === 0 ? (
        <p className="ingestion-empty">Aucun outil configuré pour ce client.</p>
      ) : (
        <>
          <div className="ingestion-launcher">
            <label className="ingestion-provider-select">
              Outil à ingérer
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
                    disabled={provider.status !== 'active' || !provider.initial_ingestion_supported}
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
              Cet outil est visible mais indisponible pour l’ingestion initiale.
            </p>
          ) : null}
          {errorMessage !== null ? <p className="ingestion-error" role="alert">{errorMessage}</p> : null}
          {operationState === 'loading' ? <p className="ingestion-empty">Chargement de la dernière ingestion…</p> : null}
          {operationState === 'none' ? <p className="ingestion-empty">Aucune ingestion n’a encore été lancée pour cet outil.</p> : null}
          {operation !== null ? <>
            <IngestionSummary operation={operation} />
            <section aria-labelledby="ingestion-sources-title" className="ingestion-sources">
              <h4 id="ingestion-sources-title">Sources</h4>
              <IngestionSourcesTable key={operation.correlation_id} operation={operation} />
            </section>
          </> : null}
        </>
      )}

      <section aria-labelledby="ingestion-history-title" className="ingestion-history">
        <div className="ingestion-history__heading">
          <div>
            <h4 id="ingestion-history-title">Historique des ingestions</h4>
          </div>
          <button
            className="secondary-button ingestion-history__archive-toggle"
            onClick={() => {
              setShowArchives((visible) => !visible)
              setExpandedCorrelationId(null)
            }}
            type="button"
          >
            {showArchives ? 'Retour aux ingestions' : 'Voir les archives'}
          </button>
        </div>
        {historyState === 'loading' ? (
          <p className="ingestion-empty">Chargement de l’historique…</p>
        ) : historyState === 'error' ? (
          <p className="ingestion-error" role="alert">L’historique des ingestions ne peut pas être chargé pour le moment.</p>
        ) : visibleHistory.length === 0 ? (
          <p className="ingestion-empty">
            {showArchives ? 'Aucune ingestion archivée pour ce tenant.' : 'Aucune ingestion persistée pour ce tenant.'}
          </p>
        ) : (
          <IngestionHistoryTable
            expandedCorrelationId={expandedCorrelationId}
            isArchiving={isArchiving}
            onArchive={(historyOperation) => void archiveIngestion(historyOperation)}
            onToggle={(correlationId) => setExpandedCorrelationId((current) => current === correlationId ? null : correlationId)}
            operations={visibleHistory}
            providers={providers}
          />
        )}
      </section>
    </section>
  )
}
