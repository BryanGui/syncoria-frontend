import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchAdminTenantProviderAudit,
  fetchLatestAdminTenantProviderAudit,
  launchAdminTenantProviderAudit,
  type AdminProviderAuditOperation,
} from '../api/adminTenantAudits'
import {
  fetchAdminTenantProviders,
  type AdminProviderRecord,
} from '../api/adminTenantProviders'
import {
  archiveAdminTenantReport, buildAdminTenantReportPdfUrl, fetchAdminTenantReports,
  type AdminTenantReport, type AdminTenantReportsResult,
} from '../api/adminTenantReports'
import { formatReportDate } from '../tenantReports/model'

interface AdminTenantReportsProps {
  apiBaseUrl: string | null
  tenantId: string
  onSessionExpired: () => void
}

const auditPhases = [
  ['preparing', 'Préparation'],
  ['collecting', 'Collecte des sources'],
  ['analyzing', 'Analyse des données'],
  ['generating_report', 'Génération du rapport'],
  ['publishing', 'Publication'],
] as const

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return minutes === 0 ? `${remainder} s` : `${minutes} min ${String(remainder).padStart(2, '0')} s`
}

function reportStatusLabel(status: AdminTenantReport['status']): string {
  return status === 'archived' ? 'Archivé' : 'Actif'
}

function AuditElapsedTime({ operation }: { operation: AdminProviderAuditOperation }) {
  const [now, setNow] = useState(() => Date.now())
  const active = operation.status === 'pending' || operation.status === 'running'
  useEffect(() => {
    if (!active) return undefined
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [active])
  const start = Date.parse(operation.started_at ?? operation.created_at)
  const end = operation.completed_at === null ? now : Date.parse(operation.completed_at)
  const elapsed = Number.isFinite(start) && Number.isFinite(end)
    ? Math.max(0, Math.floor((end - start) / 1000)) : 0
  return <p className="tenant-audit__elapsed">Temps écoulé : {formatElapsed(elapsed)}</p>
}

function AuditProgress({
  operation,
  lastActiveOperation,
}: {
  operation: AdminProviderAuditOperation
  lastActiveOperation: AdminProviderAuditOperation | null
}) {
  const retainedOperation = operation.status === 'failed'
    && lastActiveOperation?.correlation_id === operation.correlation_id
    ? lastActiveOperation
    : operation
  const currentIndex = operation.status === 'completed'
    ? auditPhases.length
    : auditPhases.findIndex(([phase]) => phase === retainedOperation.phase)
  const currentLabel = operation.status === 'completed'
    ? 'Terminé'
    : operation.status === 'failed'
      ? 'Échec'
      : auditPhases[currentIndex]?.[1] ?? 'En attente'
  return (
    <div className="tenant-audit__progress" aria-label="Progression de l’audit">
      <p aria-atomic="true" aria-live="polite" className="visually-hidden">
        Phase actuelle : {currentLabel}
      </p>
      <ol>
        {auditPhases.map(([phase, label], index) => {
          const state = operation.status === 'failed' && index <= currentIndex
            ? 'complete'
            : index < currentIndex
              ? 'complete'
              : index === currentIndex
                ? 'current'
                : 'upcoming'
          return (
            <li className={`tenant-audit__step tenant-audit__step--${state}`} key={phase}>
              <span aria-hidden="true">{state === 'complete' ? '✓' : state === 'current' ? '●' : '○'}</span>
              <span>{label}</span>
              {phase === retainedOperation.phase
                && retainedOperation.progress_current !== null
                && retainedOperation.progress_total !== null ? (
                <strong>{retainedOperation.progress_current} / {retainedOperation.progress_total}</strong>
              ) : null}
            </li>
          )
        })}
        {operation.status === 'failed' ? (
          <li className="tenant-audit__step tenant-audit__step--failed">
            <span aria-hidden="true">●</span><span>Échec</span>
          </li>
        ) : null}
      </ol>
      <AuditElapsedTime operation={operation} />
    </div>
  )
}

export function AdminTenantReports({ apiBaseUrl, tenantId, onSessionExpired }: AdminTenantReportsProps) {
  const [state, setState] = useState<AdminTenantReportsResult | { status: 'loading' }>({ status: 'loading' })
  const [reportsError, setReportsError] = useState<string | null>(null)
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [confirmationId, setConfirmationId] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [archiveError, setArchiveError] = useState<string | null>(null)
  const [providerState, setProviderState] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [providers, setProviders] = useState<AdminProviderRecord[]>([])
  const [selectedProviderId, setSelectedProviderId] = useState('')
  const [auditOperation, setAuditOperation] = useState<AdminProviderAuditOperation | null>(null)
  const [auditError, setAuditError] = useState<string | null>(null)
  const [isLaunching, setIsLaunching] = useState(false)
  const archiveRequest = useRef<AbortController | null>(null)
  const auditRequest = useRef<AbortController | null>(null)
  const polling = useRef<{ controller: AbortController; timer: number | null } | null>(null)
  const reportsTenant = useRef<string | null>(null)
  const userSelectedReportId = useRef<string | null>(null)
  const lastActiveAudit = useRef<AdminProviderAuditOperation | null>(null)
  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === selectedProviderId) ?? null,
    [providers, selectedProviderId],
  )
  const activeProviders = useMemo(
    () => providers.filter((provider) => provider.status === 'active'),
    [providers],
  )
  const selectedReport = useMemo(() => {
    if (state.status !== 'loaded') return null
    return state.reports.find((report) => report.id === selectedReportId) ?? state.reports[0] ?? null
  }, [selectedReportId, state])

  const stopPolling = useCallback(() => {
    const active = polling.current
    if (active === null) return
    active.controller.abort()
    if (active.timer !== null) window.clearTimeout(active.timer)
    polling.current = null
  }, [])

  const applyAuditOperation = useCallback((operation: AdminProviderAuditOperation) => {
    if (operation.status === 'pending' || operation.status === 'running') {
      lastActiveAudit.current = operation
    } else if (operation.status === 'completed') {
      lastActiveAudit.current = null
    }
    setAuditOperation(operation)
  }, [])

  const beginPolling = useCallback((providerRecordId: string, correlationId: string) => {
    stopPolling()
    const controller = new AbortController()
    const active = { controller, timer: null as number | null }
    polling.current = active
    setAuditError(null)

    async function poll() {
      if (controller.signal.aborted) return
      const result = await fetchAdminTenantProviderAudit(
        apiBaseUrl, tenantId, providerRecordId, correlationId, controller.signal,
      )
      if (controller.signal.aborted || polling.current !== active) return
      if (result.status === 'unauthenticated') {
        stopPolling()
        onSessionExpired()
        return
      }
      if (result.status === 'loaded') {
        setAuditError(null)
        applyAuditOperation(result.operation)
        if (result.operation.status === 'completed') {
          stopPolling()
          setReloadKey((key) => key + 1)
          return
        }
        if (result.operation.status === 'failed') {
          stopPolling()
          return
        }
      } else {
        setAuditError('Le suivi de l’audit est temporairement indisponible. Réessai automatique…')
      }
      active.timer = window.setTimeout(() => void poll(), 2500)
    }

    void poll()
  }, [apiBaseUrl, applyAuditOperation, onSessionExpired, stopPolling, tenantId])

  useEffect(() => {
    const controller = new AbortController()
    const tenantChanged = reportsTenant.current !== tenantId
    reportsTenant.current = tenantId
    if (tenantChanged) {
      setReportsError(null)
      setState({ status: 'loading' })
      setSelectedReportId(null)
      userSelectedReportId.current = null
    } else {
      setState((previous) => previous.status === 'loaded'
        ? previous : { status: 'loading' })
    }
    setConfirmationId(null)
    setPendingId(null)
    setArchiveError(null)
    void fetchAdminTenantReports(apiBaseUrl, tenantId, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      if (result.status === 'unauthenticated') {
        setReportsError(null)
        setState(result)
        onSessionExpired()
      } else if (result.status === 'loaded') {
        setReportsError(null)
        setState(result)
        const manualSelection = userSelectedReportId.current
        const manualSelectionStillExists = manualSelection !== null
          && result.reports.some((report) => report.id === manualSelection)
        if (!manualSelectionStillExists) userSelectedReportId.current = null
        setSelectedReportId(manualSelectionStillExists
          ? manualSelection : result.reports[0]?.id ?? null)
      } else {
        setReportsError('La mise à jour des rapports est temporairement indisponible.')
        setState((previous) => previous.status === 'loaded' ? previous : result)
      }
    })
    return () => {
      controller.abort()
      archiveRequest.current?.abort()
    }
  }, [apiBaseUrl, tenantId, onSessionExpired, reloadKey])

  useEffect(() => {
    const controller = new AbortController()
    setProviderState('loading')
    setProviders([])
    setSelectedProviderId('')
    setAuditOperation(null)
    lastActiveAudit.current = null
    setAuditError(null)
    setIsLaunching(false)

    async function loadAuditState() {
      const providers = await fetchAdminTenantProviders(
        apiBaseUrl, tenantId, controller.signal,
      )
      if (controller.signal.aborted) return
      if (providers.status === 'unauthenticated') {
        onSessionExpired()
        return
      }
      if (providers.status !== 'loaded') {
        setProviderState('error')
        return
      }
      const active = providers.providers.filter((provider) => provider.status === 'active')
      setProviderState('loaded')
      setProviders(active)
    }

    void loadAuditState()
    return () => {
      controller.abort()
      auditRequest.current?.abort()
      auditRequest.current = null
      stopPolling()
    }
  }, [apiBaseUrl, beginPolling, onSessionExpired, stopPolling, tenantId])

  useEffect(() => {
    const controller = new AbortController()
    auditRequest.current?.abort()
    auditRequest.current = controller
    stopPolling()
    setAuditOperation(null)
    lastActiveAudit.current = null
    setAuditError(null)
    if (selectedProvider === null) return () => controller.abort()
    if (selectedProvider.provider !== 'notion') return () => controller.abort()

    void fetchLatestAdminTenantProviderAudit(
      apiBaseUrl, tenantId, selectedProvider.id, controller.signal,
    ).then((latest) => {
      if (controller.signal.aborted) return
      if (latest.status === 'unauthenticated') onSessionExpired()
      else if (latest.status === 'loaded') {
        applyAuditOperation(latest.operation)
        if (latest.operation.status === 'pending' || latest.operation.status === 'running') {
          beginPolling(selectedProvider.id, latest.operation.correlation_id)
        }
      } else if (latest.status !== 'not_found') {
        setAuditError('L’état de l’audit n’est pas disponible pour le moment.')
      }
    })
    return () => {
      controller.abort()
      if (auditRequest.current === controller) auditRequest.current = null
      stopPolling()
    }
  }, [apiBaseUrl, applyAuditOperation, beginPolling, onSessionExpired, selectedProvider, stopPolling, tenantId])

  function auditFailureMessage(errorCode: string | null): string {
    if (errorCode === 'credential') return 'Vérifiez la configuration du credential Notion.'
    if (errorCode === 'unsupported') return 'Cet audit n’est pas disponible pour cette connexion.'
    if (errorCode === 'invalid_context') return 'La configuration de l’audit est invalide.'
    return 'L’audit n’a pas pu être terminé. Vous pouvez réessayer.'
  }

  async function launchAudit() {
    if (
      selectedProvider === null
      || selectedProvider.provider !== 'notion'
      || !selectedProvider.credential_configured
      || isLaunching
      || auditOperation?.status === 'pending'
      || auditOperation?.status === 'running'
    ) return
    auditRequest.current?.abort()
    const controller = new AbortController()
    auditRequest.current = controller
    setIsLaunching(true)
    setAuditError(null)
    const result = await launchAdminTenantProviderAudit(
      apiBaseUrl, tenantId, selectedProvider.id, controller.signal,
    )
    if (controller.signal.aborted) return
    if (result.status === 'unauthenticated') {
      auditRequest.current = null
      setIsLaunching(false)
      onSessionExpired()
      return
    }
    if (result.status === 'conflict') {
      const latest = await fetchLatestAdminTenantProviderAudit(
        apiBaseUrl, tenantId, selectedProvider.id, controller.signal,
      )
      if (controller.signal.aborted) return
      auditRequest.current = null
      setIsLaunching(false)
      if (latest.status === 'loaded') {
        applyAuditOperation(latest.operation)
          if (latest.operation.status === 'pending' || latest.operation.status === 'running') {
          beginPolling(selectedProvider.id, latest.operation.correlation_id)
        }
      } else if (latest.status === 'unauthenticated') {
        onSessionExpired()
      } else {
        setAuditError('Un audit est déjà actif, mais son état ne peut pas être récupéré.')
      }
      return
    }
    auditRequest.current = null
    setIsLaunching(false)
    if (result.status !== 'loaded') {
      setAuditError(result.status === 'invalid'
        ? 'L’audit Notion est indisponible ou mal configuré.'
        : 'L’audit n’a pas pu être lancé. Réessayez.')
      return
    }
    applyAuditOperation(result.operation)
    if (result.operation.status === 'pending' || result.operation.status === 'running') {
      beginPolling(selectedProvider.id, result.operation.correlation_id)
    } else if (result.operation.status === 'completed') {
      setReloadKey((key) => key + 1)
    }
  }

  function renderAuditLauncher() {
    const auditActive = auditOperation?.status === 'pending'
      || auditOperation?.status === 'running'
    const disabled = providerState !== 'loaded'
      || selectedProvider === null
      || selectedProvider.provider !== 'notion'
      || !selectedProvider.credential_configured
      || isLaunching
      || auditActive

    return (
      <section aria-label="Lancement de l’audit Notion" className="tenant-audit__launcher">
        <label className="tenant-audit__provider-label" htmlFor="audit-provider">Connexion à auditer</label>
        <div className="tenant-audit__launcher-heading">
          <select
            aria-label="Connexion à auditer"
            disabled={auditActive || isLaunching || providerState !== 'loaded'}
            id="audit-provider"
            onChange={(event) => setSelectedProviderId(event.target.value)}
            value={selectedProviderId}
          >
            <option value="">Sélectionner une connexion</option>
            {activeProviders.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.provider === 'notion' ? 'Notion' : provider.provider} — {provider.name}
                {provider.provider !== 'notion' ? ' · Audit indisponible' : ''}
              </option>
            ))}
          </select>
          <button
            className="primary-button"
            disabled={disabled}
            onClick={() => void launchAudit()}
            type="button"
          >
            {isLaunching ? 'Lancement…' : auditActive ? 'Audit en cours…' : 'Lancer l’audit'}
          </button>
        </div>
        {providerState === 'loading' ? <p aria-live="polite">Recherche des connexions…</p> : null}
        {providerState === 'error' ? (
          <p role="alert">La connexion Notion ne peut pas être vérifiée pour le moment.</p>
        ) : null}
        {providerState === 'loaded' && activeProviders.length === 0 ? (
          <p role="status">Aucune connexion active n’est disponible pour ce tenant.</p>
        ) : null}
        {selectedProvider?.provider !== 'notion' && selectedProvider !== null ? (
          <p role="status">Audit indisponible pour cette connexion.</p>
        ) : null}
        {selectedProvider?.provider === 'notion' && !selectedProvider.credential_configured ? (
          <p role="status">Configurez d’abord le credential Notion pour lancer l’audit.</p>
        ) : null}
        {auditOperation !== null ? (
          <div className="tenant-audit__launcher-status">
            {auditOperation.status === 'failed' ? (
              <>
                <strong>Échec de l’audit</strong>
                <p>{auditFailureMessage(auditOperation.error_code)}</p>
                <AuditProgress
                  lastActiveOperation={lastActiveAudit.current}
                  operation={auditOperation}
                />
              </>
            ) : auditOperation.status === 'completed' ? (
              <>
                <strong>État : Terminé</strong>
                <AuditProgress lastActiveOperation={null} operation={auditOperation} />
                <dl>
                  <div><dt>Sources analysées</dt><dd>{auditOperation.sources_total}</dd></div>
                  <div><dt>Sources retenues</dt><dd>{auditOperation.sources_retained}</dd></div>
                  <div><dt>Sources écartées</dt><dd>{auditOperation.sources_excluded}</dd></div>
                  <div><dt>Décisions nécessaires</dt><dd>{auditOperation.decisions_required}</dd></div>
                  <div><dt>Enregistrements retenus</dt><dd>{auditOperation.records_retained}</dd></div>
                </dl>
              </>
            ) : (
              <AuditProgress
                lastActiveOperation={lastActiveAudit.current}
                operation={auditOperation}
              />
            )}
          </div>
        ) : null}
        {auditError ? <p role="alert">{auditError}</p> : null}
      </section>
    )
  }

  async function archiveReport(reportId: string) {
    if (archiveRequest.current && !archiveRequest.current.signal.aborted) return
    const controller = new AbortController()
    archiveRequest.current = controller
    setPendingId(reportId)
    setArchiveError(null)
    const result = await archiveAdminTenantReport(apiBaseUrl, tenantId, reportId, controller.signal)
    if (controller.signal.aborted) return
    archiveRequest.current = null
    setPendingId(null)
    if (result.status === 'unauthenticated') {
      onSessionExpired()
      setState({ status: 'unauthenticated' })
    } else if (result.status === 'archived') {
      setConfirmationId(null)
      // Refresh both sections from the backend after the durable write.
      setReloadKey((key) => key + 1)
    } else {
      setArchiveError(result.status === 'not_found'
        ? 'Ce rapport ou ce client n’est plus disponible. Rechargez les rapports.'
        : 'Le rapport n’a pas pu être archivé. Réessayez.')
    }
  }

  function renderReportHistory(reports: AdminTenantReport[]) {
    return (
      <section aria-label="Historique des rapports d’audit" className="tenant-audit__history">
        <div className="tenant-audit__section-heading">
          <div>
            <p className="tenant-audit__eyebrow">Historique</p>
            <h4>Rapports d’audit</h4>
          </div>
          <p>{reports.length} rapport{reports.length > 1 ? 's' : ''}</p>
        </div>
        <ul>
          {reports.map((report) => {
            const isSelected = selectedReport?.id === report.id
            return (
              <li key={report.id}>
                <button
                  aria-pressed={isSelected}
                  className={isSelected
                    ? 'tenant-audit__history-item tenant-audit__history-item--selected'
                    : 'tenant-audit__history-item'}
                  onClick={() => {
                    userSelectedReportId.current = report.id
                    setSelectedReportId(report.id)
                  }}
                  type="button"
                >
                  <span className="tenant-audit__history-main">
                    <strong>{report.title}</strong>
                    <span><time dateTime={report.report_date}>{formatReportDate(report.report_date)}</time> · {report.provider}</span>
                  </span>
                  <span className="tenant-audit__history-stat">
                    <strong className={report.status === 'archived' ? 'tenant-audit__status tenant-audit__status--archived' : 'tenant-audit__status'}>
                      {reportStatusLabel(report.status)}
                    </strong>
                    <span>{report.sources_analyzed} sources · Décisions nécessaires : {report.decisions_required ?? '—'}</span>
                  </span>
                  <span aria-hidden="true" className="tenant-audit__history-chevron">→</span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>
    )
  }

  function renderSelectedReport(report: AdminTenantReport) {
    const isArchived = report.status === 'archived'
    return (
      <section aria-label="Rapport sélectionné" className="tenant-audit__selected-report">
        <article aria-label={`${report.title} — ${formatReportDate(report.report_date)}`} className={isArchived ? 'tenant-audit__report tenant-audit__report--archived' : 'tenant-audit__report'}>
          <div className="tenant-audit__report-heading">
            <div>
              <p className="tenant-audit__eyebrow">Rapport sélectionné</p>
              <h4>{report.title}</h4>
            </div>
            <div className="tenant-audit__report-meta">
              <p>Provider : <strong>{report.provider}</strong></p>
              <p>Date : <time dateTime={report.report_date}>{formatReportDate(report.report_date)}</time></p>
              <p>État : <strong className={isArchived ? 'tenant-audit__status tenant-audit__status--archived' : 'tenant-audit__status'}>{reportStatusLabel(report.status)}</strong></p>
            </div>
          </div>
          <dl className="tenant-audit__kpis">
            <div><dt>Sources analysées</dt><dd>{report.sources_analyzed}</dd></div>
            <div><dt>Sources retenues</dt><dd>{report.sources_retained}</dd></div>
            <div><dt>Sources écartées</dt><dd>{report.sources_excluded}</dd></div>
            <div><dt>Enregistrements retenus</dt><dd>{report.records_retained}</dd></div>
            <div className={report.decisions_required === null ? 'tenant-audit__kpi tenant-audit__kpi--neutral' : 'tenant-audit__kpi tenant-audit__kpi--attention'}>
              <dt>Décisions nécessaires</dt><dd>{report.decisions_required ?? '—'}</dd>
            </div>
          </dl>
          <div className="tenant-audit__report-footer">
            <div className="tenant-audit__actions">
              <a className="primary-button" aria-label={`Voir le rapport ${report.title} (nouvel onglet)`} href={buildAdminTenantReportPdfUrl(apiBaseUrl, tenantId, report.id)} target="_blank" rel="noreferrer">Voir le rapport</a>
              <a className="secondary-button" href={buildAdminTenantReportPdfUrl(apiBaseUrl, tenantId, report.id, true)}>Télécharger PDF</a>
              {report.status === 'completed' && (
                <button className="secondary-button" disabled={pendingId !== null} type="button" onClick={() => { setConfirmationId(report.id); setArchiveError(null) }}>Archiver</button>
              )}
            </div>
            <p className="tenant-audit__summary">{isArchived
              ? 'Ce rapport est conservé dans l’historique et reste consultable.'
              : 'L’état Terminé concerne l’audit, pas la validation métier ni l’intégration des données.'}</p>
          </div>
          {confirmationId === report.id && (
            <div className="tenant-audit__confirmation" role="alertdialog" aria-labelledby={`archive-${report.id}-title`} aria-describedby={`archive-${report.id}-description`}>
              <strong id={`archive-${report.id}-title`}>Archiver {report.title} du {formatReportDate(report.report_date)} ?</strong>
              <p id={`archive-${report.id}-description`}>Le rapport sera déplacé dans « Rapports archivés ». Son PDF et ses métadonnées seront conservés.</p>
              <div className="tenant-audit__actions">
                <button autoFocus className="secondary-button" disabled={pendingId !== null} onClick={() => { setConfirmationId(null); setArchiveError(null) }} type="button">Annuler</button>
                <button className="primary-button" disabled={pendingId !== null} onClick={() => void archiveReport(report.id)} type="button">{pendingId === report.id ? 'Archivage…' : 'Confirmer l’archivage'}</button>
              </div>
              {archiveError && <p role="alert">{archiveError}</p>}
            </div>
          )}
        </article>
      </section>
    )
  }

  return (
    <section aria-label="Audit & cartographie" className="tenant-audit">
      <h3>Audit & cartographie</h3>
      {renderAuditLauncher()}
      {state.status === 'loading' ? <p role="status">Chargement des rapports…</p>
        : state.status !== 'loaded' ? (
          <div role="alert">
            <p>Les rapports ne sont pas disponibles pour le moment.</p>
            <button className="secondary-button" type="button" onClick={() => setReloadKey((key) => key + 1)}>Réessayer</button>
          </div>
        ) : state.reports.length === 0 ? (
          <>
            {reportsError ? <p role="alert">{reportsError}</p> : null}
            <p>Aucun rapport publié pour ce client.</p>
          </>
        )
          : (
            <>
              {reportsError ? <p role="alert">{reportsError}</p> : null}
              {renderReportHistory(state.reports)}
              {selectedReport ? renderSelectedReport(selectedReport) : null}
            </>
          )}
    </section>
  )
}
