import { useCallback, useEffect, useRef, useState } from 'react'
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

export function AdminTenantReports({ apiBaseUrl, tenantId, onSessionExpired }: AdminTenantReportsProps) {
  const [state, setState] = useState<AdminTenantReportsResult | { status: 'loading' }>({ status: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)
  const [confirmationId, setConfirmationId] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [archiveError, setArchiveError] = useState<string | null>(null)
  const [providerState, setProviderState] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [notionProvider, setNotionProvider] = useState<AdminProviderRecord | null>(null)
  const [auditOperation, setAuditOperation] = useState<AdminProviderAuditOperation | null>(null)
  const [auditError, setAuditError] = useState<string | null>(null)
  const [isLaunching, setIsLaunching] = useState(false)
  const archiveRequest = useRef<AbortController | null>(null)
  const auditRequest = useRef<AbortController | null>(null)
  const polling = useRef<{ controller: AbortController; timer: number | null } | null>(null)

  const stopPolling = useCallback(() => {
    const active = polling.current
    if (active === null) return
    active.controller.abort()
    if (active.timer !== null) window.clearTimeout(active.timer)
    polling.current = null
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
        setAuditOperation(result.operation)
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
  }, [apiBaseUrl, onSessionExpired, stopPolling, tenantId])

  useEffect(() => {
    const controller = new AbortController()
    setState({ status: 'loading' })
    setConfirmationId(null)
    setPendingId(null)
    setArchiveError(null)
    void fetchAdminTenantReports(apiBaseUrl, tenantId, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      if (result.status === 'unauthenticated') onSessionExpired()
      setState(result)
    })
    return () => {
      controller.abort()
      archiveRequest.current?.abort()
    }
  }, [apiBaseUrl, tenantId, onSessionExpired, reloadKey])

  useEffect(() => {
    const controller = new AbortController()
    auditRequest.current = controller
    setProviderState('loading')
    setNotionProvider(null)
    setAuditOperation(null)
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
      const provider = providers.providers.find(
        (item) => item.provider === 'notion' && item.status === 'active',
      ) ?? null
      setProviderState('loaded')
      setNotionProvider(provider)
      if (provider === null) return

      const latest = await fetchLatestAdminTenantProviderAudit(
        apiBaseUrl, tenantId, provider.id, controller.signal,
      )
      if (controller.signal.aborted) return
      if (latest.status === 'unauthenticated') {
        onSessionExpired()
      } else if (latest.status === 'loaded') {
        setAuditOperation(latest.operation)
        if (latest.operation.status === 'pending' || latest.operation.status === 'running') {
          beginPolling(provider.id, latest.operation.correlation_id)
        }
      } else if (latest.status !== 'not_found') {
        setAuditError('L’état de l’audit n’est pas disponible pour le moment.')
      }
    }

    void loadAuditState()
    return () => {
      controller.abort()
      auditRequest.current?.abort()
      auditRequest.current = null
      stopPolling()
    }
  }, [apiBaseUrl, beginPolling, onSessionExpired, stopPolling, tenantId])

  function auditFailureMessage(errorCode: string | null): string {
    if (errorCode === 'credential') return 'Vérifiez la configuration du credential Notion.'
    if (errorCode === 'unsupported') return 'Cet audit n’est pas disponible pour cette connexion.'
    if (errorCode === 'invalid_context') return 'La configuration de l’audit est invalide.'
    return 'L’audit n’a pas pu être terminé. Vous pouvez réessayer.'
  }

  async function launchAudit() {
    if (
      notionProvider === null
      || !notionProvider.credential_configured
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
      apiBaseUrl, tenantId, notionProvider.id, controller.signal,
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
        apiBaseUrl, tenantId, notionProvider.id, controller.signal,
      )
      if (controller.signal.aborted) return
      auditRequest.current = null
      setIsLaunching(false)
      if (latest.status === 'loaded') {
        setAuditOperation(latest.operation)
        if (latest.operation.status === 'pending' || latest.operation.status === 'running') {
          beginPolling(notionProvider.id, latest.operation.correlation_id)
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
    setAuditOperation(result.operation)
    if (result.operation.status === 'pending' || result.operation.status === 'running') {
      beginPolling(notionProvider.id, result.operation.correlation_id)
    } else if (result.operation.status === 'completed') {
      setReloadKey((key) => key + 1)
    }
  }

  function renderAuditLauncher() {
    const auditActive = auditOperation?.status === 'pending'
      || auditOperation?.status === 'running'
    const disabled = providerState !== 'loaded'
      || notionProvider === null
      || !notionProvider.credential_configured
      || isLaunching
      || auditActive

    return (
      <section aria-label="Lancement de l’audit Notion" className="tenant-audit__launcher">
        <div className="tenant-audit__launcher-heading">
          <div>
            <p className="tenant-audit__eyebrow">Provider</p>
            <h4>{notionProvider === null ? 'Notion' : 'Notion · ' + notionProvider.name}</h4>
          </div>
          <button
            className="primary-button"
            disabled={disabled}
            onClick={() => void launchAudit()}
            type="button"
          >
            {isLaunching ? 'Lancement…' : auditActive ? 'Audit en cours…' : 'Lancer l’audit'}
          </button>
        </div>
        {providerState === 'loading' ? <p aria-live="polite">Recherche de la connexion Notion…</p> : null}
        {providerState === 'error' ? (
          <p role="alert">La connexion Notion ne peut pas être vérifiée pour le moment.</p>
        ) : null}
        {providerState === 'loaded' && notionProvider === null ? (
          <p role="status">Aucun provider Notion actif n’est disponible pour ce tenant.</p>
        ) : null}
        {notionProvider !== null && !notionProvider.credential_configured ? (
          <p role="status">Configurez d’abord le credential Notion pour lancer l’audit.</p>
        ) : null}
        {auditOperation !== null ? (
          <div aria-live="polite" className="tenant-audit__launcher-status">
            {auditOperation.status === 'failed' ? (
              <>
                <strong>Échec de l’audit</strong>
                <p>{auditFailureMessage(auditOperation.error_code)}</p>
              </>
            ) : auditOperation.status === 'completed' ? (
              <>
                <strong>État : Terminé</strong>
                <dl>
                  <div><dt>Sources analysées</dt><dd>{auditOperation.sources_total}</dd></div>
                  <div><dt>Sources retenues</dt><dd>{auditOperation.sources_retained}</dd></div>
                  <div><dt>Sources écartées</dt><dd>{auditOperation.sources_excluded}</dd></div>
                  <div><dt>Décisions nécessaires</dt><dd>{auditOperation.decisions_required}</dd></div>
                  <div><dt>Enregistrements retenus</dt><dd>{auditOperation.records_retained}</dd></div>
                </dl>
              </>
            ) : (
              <strong>État : En cours</strong>
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

  function renderReport(report: AdminTenantReport) {
    const isArchived = report.status === 'archived'
    return (
      <article aria-label={`${report.title} — ${formatReportDate(report.report_date)}`} className={isArchived ? 'tenant-audit__report tenant-audit__report--archived' : 'tenant-audit__report'} key={report.id}>
        <div className="tenant-audit__report-heading">
          <h4>{report.title}</h4>
          <div className="tenant-audit__report-meta">
            <p>Date : <time dateTime={report.report_date}>{formatReportDate(report.report_date)}</time></p>
            <p>État : <strong>{isArchived ? 'Archivé' : 'Terminé'}</strong></p>
          </div>
        </div>
        {!isArchived && (
          <div className="tenant-audit__report-details">
            <dl>
              <div><dt>Sources analysées</dt><dd>{report.sources_analyzed}</dd></div>
              <div><dt>Sources retenues</dt><dd>{report.sources_retained}</dd></div>
              <div><dt>Sources écartées</dt><dd>{report.sources_excluded}</dd></div>
            </dl>
            <dl>
              <div><dt>Enregistrements retenus</dt><dd>{report.records_retained}</dd></div>
              {report.decisions_required !== null && <div><dt>Décisions nécessaires</dt><dd>{report.decisions_required}</dd></div>}
            </dl>
          </div>
        )}
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
        ) : state.reports.length === 0 ? <p>Aucun rapport publié pour ce client.</p>
          : (
            <>
              <section aria-label="Rapports actifs" className="tenant-audit__group">
                <h3>Rapports actifs</h3>
                {state.reports.some((report) => report.status === 'completed')
                  ? state.reports.filter((report) => report.status === 'completed').map(renderReport)
                  : <p>Aucun rapport actif.</p>}
              </section>
              <section aria-label="Rapports archivés" className="tenant-audit__group">
                <h3>Rapports archivés</h3>
                {state.reports.some((report) => report.status === 'archived')
                  ? state.reports.filter((report) => report.status === 'archived').map(renderReport)
                  : <p>Aucun rapport archivé.</p>}
              </section>
            </>
          )}
    </section>
  )
}
