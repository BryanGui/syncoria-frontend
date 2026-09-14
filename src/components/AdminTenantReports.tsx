import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchAdminTenantProviderAudit,
  fetchLatestAdminTenantProviderAudit,
  fetchAdminTenantProviderAuditReport,
  launchAdminTenantProviderAudit,
  updateAdminTenantProviderAuditTitle,
  type AdminProviderAuditOperation,
  type AdminProviderAuditReport,
} from '../api/adminTenantAudits'
import { fetchAdminTenantProviders, type AdminProviderRecord } from '../api/adminTenantProviders'
import {
  archiveAdminTenantReport,
  buildAdminTenantReportPdfUrl,
  fetchAdminTenantReports,
  type AdminTenantReport,
  type AdminTenantReportsResult,
} from '../api/adminTenantReports'
import { RawAuditERDiagram } from './RawAuditERDiagram'
import { formatLocalCalendarDate, formatReportDate } from '../tenantReports/model'

interface AdminTenantReportsProps {
  apiBaseUrl: string | null
  tenantId: string
  tenantLabel: string
  onSessionExpired: () => void
}

const auditPhases = [
  ['preparing', 'Préparation'], ['collecting', 'Collecte des sources'],
  ['analyzing', 'Analyse des données'], ['generating_report', 'Génération du rapport'],
  ['publishing', 'Publication'],
] as const

type ReportReference = { providerRecordId: string; correlationId: string }

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return minutes === 0 ? `${remainder} s` : `${minutes} min ${String(remainder).padStart(2, '0')} s`
}

function titleByteLength(value: string): number {
  return new TextEncoder().encode(value).length
}

function providerLabel(provider: string): string {
  if (provider.toLowerCase() === 'n8n') return 'n8n'
  return provider.split(/[_ -]+/).filter(Boolean).map((part) => (
    part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
  )).join(' ')
}

function reportStatusLabel(status: AdminTenantReport['status']): string {
  return status === 'archived' ? 'Archivé' : 'Actif'
}

function auditStatusLabel(status: AdminProviderAuditOperation['status']): string {
  if (status === 'completed') return 'Terminé'
  if (status === 'failed') return 'Échec'
  if (status === 'running') return 'En cours'
  return 'En attente'
}

function reportArtifactFilenamePart(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'audit'
}

function buildRawDdlFilename(
  tenantLabel: string,
  provider: string,
  reportTitle: string,
  reportDate: string,
): string {
  return [tenantLabel, provider, reportTitle, reportDate]
    .map(reportArtifactFilenamePart).join('-') + '.sql'
}

function RawDdlViewer({
  ddl,
  fileName,
}: {
  ddl: string
  fileName: string
}) {
  const downloadUrl = useMemo(
    () => URL.createObjectURL(new Blob([ddl], { type: 'text/plain;charset=utf-8' })),
    [ddl],
  )
  useEffect(() => () => URL.revokeObjectURL(downloadUrl), [downloadUrl])
  return (
    <div className="raw-ddl-viewer">
      <div className="raw-ddl-viewer__toolbar">
        <span>Lecture seule · contenu brut préservé</span>
        <a className="secondary-button" download={fileName} href={downloadUrl}>
          Télécharger le DDL brut
        </a>
      </div>
      <pre aria-label="DDL brut">{ddl}</pre>
    </div>
  )
}

function AuditElapsedTime({ operation }: { operation: AdminProviderAuditOperation }) {
  const [now, setNow] = useState(() => Date.now())
  const active = operation.status === 'pending' || operation.status === 'running'
  useEffect(() => { if (!active) return undefined; const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer) }, [active])
  const start = Date.parse(operation.started_at ?? operation.created_at)
  const end = operation.completed_at === null ? now : Date.parse(operation.completed_at)
  const elapsed = Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, Math.floor((end - start) / 1000)) : 0
  return <p className="tenant-audit__elapsed">Temps écoulé : {formatElapsed(elapsed)}</p>
}

function AuditProgress({ operation, lastActiveOperation }: { operation: AdminProviderAuditOperation; lastActiveOperation: AdminProviderAuditOperation | null }) {
  const retainedOperation = operation.status === 'failed' && lastActiveOperation?.correlation_id === operation.correlation_id ? lastActiveOperation : operation
  const currentIndex = operation.status === 'completed' ? auditPhases.length : auditPhases.findIndex(([phase]) => phase === retainedOperation.phase)
  const currentLabel = auditStatusLabel(operation.status) === 'Terminé' ? 'Terminé' : operation.status === 'failed' ? 'Échec' : auditPhases[currentIndex]?.[1] ?? 'En attente'
  return <div className="tenant-audit__progress" aria-label="Progression de l’audit"><p aria-atomic="true" aria-live="polite" className="visually-hidden">Phase actuelle : {currentLabel}</p><ol>{auditPhases.map(([phase, label], index) => { const state = operation.status === 'failed' && index <= currentIndex ? 'complete' : index < currentIndex ? 'complete' : index === currentIndex ? 'current' : 'upcoming'; return <li className={`tenant-audit__step tenant-audit__step--${state}`} key={phase}><span aria-hidden="true">{state === 'complete' ? '✓' : state === 'current' ? '●' : '○'}</span><span>{label}</span>{phase === retainedOperation.phase && retainedOperation.progress_current !== null && retainedOperation.progress_total !== null ? <strong>{retainedOperation.progress_current} / {retainedOperation.progress_total}</strong> : null}</li> })}{operation.status === 'failed' ? <li className="tenant-audit__step tenant-audit__step--failed"><span aria-hidden="true">●</span><span>Échec</span></li> : null}</ol><AuditElapsedTime operation={operation} /></div>
}

export function AdminTenantReports({ apiBaseUrl, tenantId, tenantLabel, onSessionExpired }: AdminTenantReportsProps) {
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
  const [displayTitle, setDisplayTitle] = useState('')
  const [titleError, setTitleError] = useState<string | null>(null)
  const [editingReportId, setEditingReportId] = useState<string | null>(null)
  const [titleDraft, setTitleDraft] = useState('')
  const [renameError, setRenameError] = useState<string | null>(null)
  const [isRenaming, setIsRenaming] = useState(false)
  const [reportDetailState, setReportDetailState] = useState<
    { status: 'idle' }
    | { status: 'loading' }
    | { status: 'loaded'; report: AdminProviderAuditReport }
    | { status: 'unavailable' }
    | { status: 'error' }
  >({ status: 'idle' })
  const [isDdlVisible, setIsDdlVisible] = useState(false)
  const [isErVisible, setIsErVisible] = useState(false)
  const archiveRequest = useRef<AbortController | null>(null)
  const auditRequest = useRef<AbortController | null>(null)
  const renameRequest = useRef<AbortController | null>(null)
  const reportDetailRequest = useRef<AbortController | null>(null)
  const polling = useRef<{ controller: AbortController; timer: number | null } | null>(null)
  const reportsTenant = useRef<string | null>(null)
  const userSelectedReportId = useRef<string | null>(null)
  const lastActiveAudit = useRef<AdminProviderAuditOperation | null>(null)
  const selectedProvider = useMemo(() => providers.find((provider) => provider.id === selectedProviderId) ?? null, [providers, selectedProviderId])
  const activeProviders = useMemo(() => providers.filter((provider) => provider.status === 'active'), [providers])
  const selectedReport = useMemo(() => { if (state.status !== 'loaded') return null; return state.reports.find((report) => report.id === selectedReportId) ?? state.reports[0] ?? null }, [selectedReportId, state])

  const stopPolling = useCallback(() => { const active = polling.current; if (active === null) return; active.controller.abort(); if (active.timer !== null) window.clearTimeout(active.timer); polling.current = null }, [])
  const applyAuditOperation = useCallback((operation: AdminProviderAuditOperation) => {
    if (operation.status === 'pending' || operation.status === 'running') lastActiveAudit.current = operation
    else if (operation.status === 'completed') lastActiveAudit.current = null
    setAuditOperation(operation)
  }, [])
  const beginPolling = useCallback((providerRecordId: string, correlationId: string) => {
    stopPolling(); const controller = new AbortController(); const active = { controller, timer: null as number | null }; polling.current = active; setAuditError(null)
    async function poll() {
      if (controller.signal.aborted) return
      const result = await fetchAdminTenantProviderAudit(apiBaseUrl, tenantId, providerRecordId, correlationId, controller.signal)
      if (controller.signal.aborted || polling.current !== active) return
      if (result.status === 'unauthenticated') { stopPolling(); onSessionExpired(); return }
      if (result.status === 'loaded') { setAuditError(null); applyAuditOperation(result.operation); if (result.operation.status === 'completed') { stopPolling(); setReloadKey((key) => key + 1); return } if (result.operation.status === 'failed') { stopPolling(); return } } else setAuditError('Le suivi de l’audit est temporairement indisponible. Réessai automatique…')
      active.timer = window.setTimeout(() => void poll(), 2500)
    }
    void poll()
  }, [apiBaseUrl, applyAuditOperation, onSessionExpired, stopPolling, tenantId])

  useEffect(() => {
    const controller = new AbortController(); const tenantChanged = reportsTenant.current !== tenantId; reportsTenant.current = tenantId
    if (tenantChanged) { setReportsError(null); setState({ status: 'loading' }); setSelectedReportId(null); userSelectedReportId.current = null } else setState((previous) => previous.status === 'loaded' ? previous : { status: 'loading' })
    setConfirmationId(null); setPendingId(null); setArchiveError(null)
    void fetchAdminTenantReports(apiBaseUrl, tenantId, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      if (result.status === 'unauthenticated') { setReportsError(null); setState(result); onSessionExpired() } else if (result.status === 'loaded') { setReportsError(null); setState(result); const manualSelection = userSelectedReportId.current; const stillExists = manualSelection !== null && result.reports.some((report) => report.id === manualSelection); if (!stillExists) userSelectedReportId.current = null; setSelectedReportId(stillExists ? manualSelection : result.reports[0]?.id ?? null) } else { setReportsError('La mise à jour des rapports est temporairement indisponible.'); setState((previous) => previous.status === 'loaded' ? previous : result) }
    })
    return () => { controller.abort(); archiveRequest.current?.abort() }
  }, [apiBaseUrl, onSessionExpired, reloadKey, tenantId])

  const reportReference = useCallback((report: AdminTenantReport): ReportReference | null => {
    if (report.correlation_id && report.tenant_provider_record_id) {
      return { providerRecordId: report.tenant_provider_record_id, correlationId: report.correlation_id }
    }
    return null
  }, [])

  useEffect(() => {
    reportDetailRequest.current?.abort()
    setIsDdlVisible(false)
    setIsErVisible(false)
    if (selectedReport === null) {
      setReportDetailState({ status: 'idle' })
      return undefined
    }
    const reference = reportReference(selectedReport)
    if (reference === null) {
      setReportDetailState({ status: 'unavailable' })
      return undefined
    }
    const controller = new AbortController()
    reportDetailRequest.current = controller
    setReportDetailState({ status: 'loading' })
    void fetchAdminTenantProviderAuditReport(
      apiBaseUrl, tenantId, reference.providerRecordId, reference.correlationId,
      controller.signal,
    ).then((result) => {
      if (controller.signal.aborted) return
      reportDetailRequest.current = null
      if (result.status === 'unauthenticated') {
        onSessionExpired()
        setReportDetailState({ status: 'error' })
      } else if (result.status === 'loaded' && result.report.report_id === selectedReport.id) {
        setReportDetailState({ status: 'loaded', report: result.report })
      } else {
        setReportDetailState({ status: result.status === 'not_found' ? 'unavailable' : 'error' })
      }
    })
    return () => {
      controller.abort()
      if (reportDetailRequest.current === controller) reportDetailRequest.current = null
    }
  }, [apiBaseUrl, onSessionExpired, reportReference, selectedReport, tenantId])

  useEffect(() => {
    const controller = new AbortController(); setProviderState('loading'); setProviders([]); setSelectedProviderId(''); setAuditOperation(null); lastActiveAudit.current = null; setAuditError(null); setIsLaunching(false); setDisplayTitle('')
    async function loadAuditState() { const result = await fetchAdminTenantProviders(apiBaseUrl, tenantId, controller.signal); if (controller.signal.aborted) return; if (result.status === 'unauthenticated') { onSessionExpired(); return } if (result.status !== 'loaded') { setProviderState('error'); return } setProviderState('loaded'); setProviders(result.providers.filter((provider) => provider.status === 'active')) }
    void loadAuditState()
    return () => { controller.abort(); auditRequest.current?.abort(); auditRequest.current = null; stopPolling() }
  }, [apiBaseUrl, onSessionExpired, stopPolling, tenantId])

  useEffect(() => {
    const controller = new AbortController(); auditRequest.current?.abort(); auditRequest.current = controller; stopPolling(); setAuditOperation(null); lastActiveAudit.current = null; setAuditError(null)
    if (selectedProvider === null || selectedProvider.provider !== 'notion') return () => controller.abort()
    setDisplayTitle(`Audit ${providerLabel(selectedProvider.provider)} — ${formatLocalCalendarDate(new Date())}`); setTitleError(null)
    void fetchLatestAdminTenantProviderAudit(apiBaseUrl, tenantId, selectedProvider.id, controller.signal).then((latest) => { if (controller.signal.aborted) return; if (latest.status === 'unauthenticated') onSessionExpired(); else if (latest.status === 'loaded') { applyAuditOperation(latest.operation); if (latest.operation.status === 'pending' || latest.operation.status === 'running') beginPolling(selectedProvider.id, latest.operation.correlation_id) } else if (latest.status !== 'not_found') setAuditError('L’état de l’audit n’est pas disponible pour le moment.') })
    return () => { controller.abort(); if (auditRequest.current === controller) auditRequest.current = null; stopPolling() }
  }, [apiBaseUrl, applyAuditOperation, beginPolling, onSessionExpired, selectedProvider, stopPolling, tenantId])

  function auditFailureMessage(errorCode: string | null): string { if (errorCode === 'credential') return 'Vérifiez la configuration du credential Notion.'; if (errorCode === 'unsupported') return 'Cet audit n’est pas disponible pour cette connexion.'; if (errorCode === 'invalid_context') return 'La configuration de l’audit est invalide.'; return 'L’audit n’a pas pu être terminé. Vous pouvez réessayer.' }
  async function launchAudit() {
    if (selectedProvider === null || selectedProvider.provider !== 'notion' || !selectedProvider.credential_configured || isLaunching || auditOperation?.status === 'pending' || auditOperation?.status === 'running') return
    const normalizedTitle = displayTitle.trim(); if (!normalizedTitle || titleByteLength(normalizedTitle) > 120) { setTitleError('Saisissez un titre de 1 à 120 octets.'); return }
    auditRequest.current?.abort(); const controller = new AbortController(); auditRequest.current = controller; setIsLaunching(true); setAuditError(null); setTitleError(null)
    const result = await launchAdminTenantProviderAudit(apiBaseUrl, tenantId, selectedProvider.id, { signal: controller.signal, displayTitle: normalizedTitle })
    if (controller.signal.aborted) return
    if (result.status === 'unauthenticated') { auditRequest.current = null; setIsLaunching(false); onSessionExpired(); return }
    if (result.status === 'conflict') { const latest = await fetchLatestAdminTenantProviderAudit(apiBaseUrl, tenantId, selectedProvider.id, controller.signal); if (controller.signal.aborted) return; auditRequest.current = null; setIsLaunching(false); if (latest.status === 'loaded') { applyAuditOperation(latest.operation); if (latest.operation.status === 'pending' || latest.operation.status === 'running') beginPolling(selectedProvider.id, latest.operation.correlation_id) } else if (latest.status === 'unauthenticated') onSessionExpired(); else setAuditError('Un audit est déjà actif, mais son état ne peut pas être récupéré.'); return }
    auditRequest.current = null; setIsLaunching(false); if (result.status !== 'loaded') { setAuditError(result.status === 'invalid' ? 'L’audit Notion est indisponible ou mal configuré.' : 'L’audit n’a pas pu être lancé. Réessayez.'); return }
    applyAuditOperation(result.operation); if (result.operation.status === 'pending' || result.operation.status === 'running') beginPolling(selectedProvider.id, result.operation.correlation_id); else if (result.operation.status === 'completed') setReloadKey((key) => key + 1)
  }

  function renderAuditLauncher() {
    const auditActive = auditOperation?.status === 'pending' || auditOperation?.status === 'running'
    const disabled = providerState !== 'loaded' || selectedProvider === null
      || selectedProvider.provider !== 'notion' || !selectedProvider.credential_configured
      || isLaunching || auditActive
    return <section aria-label="Lancement de l’audit Notion" className="tenant-audit__launcher">
      <div className="tenant-audit__launcher-title"><h4>Lancer un audit</h4><span className="tenant-audit__launcher-note">Une connexion par audit</span></div>
      <div className="tenant-audit__launcher-fields">
        <div className="tenant-audit__field">
          <label className="tenant-audit__provider-label" htmlFor="audit-title">Titre de l’audit</label>
          <input aria-describedby="audit-title-help" aria-invalid={titleError !== null} id="audit-title" maxLength={120} onChange={(event) => { setDisplayTitle(event.target.value); setTitleError(null) }} value={displayTitle} />
          <small id="audit-title-help">Ce titre sera visible dans l’historique et le rapport.</small>
          {titleError ? <p role="alert">{titleError}</p> : null}
        </div>
        <div className="tenant-audit__field">
          <span className="tenant-audit__provider-label">Connexion à auditer</span>
          <div aria-label="Connexion à auditer" aria-disabled={auditActive || isLaunching || providerState !== 'loaded'} className="tenant-audit__provider-options" role="radiogroup">
            {activeProviders.map((provider) => {
              const selected = provider.id === selectedProviderId
              return <button aria-checked={selected} className={selected ? 'tenant-audit__provider-option tenant-audit__provider-option--selected' : 'tenant-audit__provider-option'} disabled={auditActive || isLaunching || providerState !== 'loaded'} key={provider.id} onClick={() => setSelectedProviderId(provider.id)} role="radio" type="button"><strong>{providerLabel(provider.provider)}</strong><span>{provider.name}</span>{provider.provider !== 'notion' ? <small>Audit indisponible</small> : null}</button>
            })}
          </div>
        </div>
        <button className="primary-button" disabled={disabled} onClick={() => void launchAudit()} type="button">{isLaunching ? 'Lancement…' : auditActive ? 'Audit en cours…' : 'Lancer l’audit'}</button>
      </div>
      {providerState === 'loading' ? <p aria-live="polite">Recherche des connexions…</p> : null}
      {providerState === 'error' ? <p role="alert">La connexion Notion ne peut pas être vérifiée pour le moment.</p> : null}
      {providerState === 'loaded' && activeProviders.length === 0 ? <p role="status">Aucune connexion active n’est disponible pour ce tenant.</p> : null}
      {selectedProvider?.provider !== 'notion' && selectedProvider !== null ? <p role="status">Audit indisponible pour cette connexion.</p> : null}
      {selectedProvider?.provider === 'notion' && !selectedProvider.credential_configured ? <p role="status">Configurez d’abord le credential Notion pour lancer l’audit.</p> : null}
      {auditOperation !== null ? <div className="tenant-audit__launcher-status">{auditOperation.status === 'failed' ? <><strong>Échec de l’audit</strong><p>{auditFailureMessage(auditOperation.error_code)}</p><AuditProgress lastActiveOperation={lastActiveAudit.current} operation={auditOperation} /></> : auditOperation.status === 'completed' ? <><strong>État : Terminé</strong><AuditProgress lastActiveOperation={null} operation={auditOperation} /><dl><div><dt>Sources analysées</dt><dd>{auditOperation.sources_total}</dd></div><div><dt>Sources retenues</dt><dd>{auditOperation.sources_retained}</dd></div><div><dt>Sources écartées</dt><dd>{auditOperation.sources_excluded}</dd></div><div><dt>Décisions nécessaires</dt><dd>{auditOperation.decisions_required}</dd></div><div><dt>Enregistrements retenus</dt><dd>{auditOperation.records_retained}</dd></div></dl></> : <AuditProgress lastActiveOperation={lastActiveAudit.current} operation={auditOperation} />}</div> : null}
      {auditError ? <p role="alert">{auditError}</p> : null}
    </section>
  }

  async function archiveReport(reportId: string) {
    if (archiveRequest.current && !archiveRequest.current.signal.aborted) return
    const controller = new AbortController(); archiveRequest.current = controller; setPendingId(reportId); setArchiveError(null); const result = await archiveAdminTenantReport(apiBaseUrl, tenantId, reportId, controller.signal); if (controller.signal.aborted) return; archiveRequest.current = null; setPendingId(null)
    if (result.status === 'unauthenticated') { onSessionExpired(); setState({ status: 'unauthenticated' }) } else if (result.status === 'archived') { setConfirmationId(null); setReloadKey((key) => key + 1) } else setArchiveError(result.status === 'not_found' ? 'Ce rapport ou ce client n’est plus disponible. Rechargez les rapports.' : 'Le rapport n’a pas pu être archivé. Réessayez.')
  }
  function beginRename(report: AdminTenantReport) { setEditingReportId(report.id); setTitleDraft(report.title); setRenameError(null) }
  async function saveRename(report: AdminTenantReport) {
    const normalizedTitle = titleDraft.trim(); if (!normalizedTitle || titleByteLength(normalizedTitle) > 120) { setRenameError('Saisissez un titre de 1 à 120 octets.'); return }
    const reference = reportReference(report); if (reference === null) { setRenameError('Le renommage de cet ancien rapport n’est pas disponible avec sa référence actuelle.'); return }
    renameRequest.current?.abort(); const controller = new AbortController(); renameRequest.current = controller; setIsRenaming(true); setRenameError(null)
    const result = await updateAdminTenantProviderAuditTitle(apiBaseUrl, tenantId, reference.providerRecordId, reference.correlationId, normalizedTitle, controller.signal); if (controller.signal.aborted) return; renameRequest.current = null; setIsRenaming(false)
    if (result.status === 'unauthenticated') { onSessionExpired(); return }
    if (result.status !== 'loaded') { setRenameError('Le titre n’a pas pu être enregistré. Réessayez.'); return }
    const savedTitle = result.operation.display_title
    setState((previous) => previous.status !== 'loaded' ? previous : { ...previous, reports: previous.reports.map((item) => item.id === report.id ? { ...item, title: savedTitle } : item) })
    setAuditOperation((previous) => previous?.correlation_id === reference.correlationId ? { ...previous, display_title: savedTitle } : previous)
    setEditingReportId(null); setRenameError(null)
  }

  function renderReportHistory(reports: AdminTenantReport[]) {
    return <section aria-label="Historique des rapports d’audit" className="tenant-audit__history"><div className="tenant-audit__section-heading"><div><p className="tenant-audit__eyebrow">Historique</p><h4>Rapports d’audit</h4></div><p>{reports.length} rapport{reports.length > 1 ? 's' : ''}</p></div><ul>{reports.map((report) => { const isSelected = selectedReport?.id === report.id; const renaming = editingReportId === report.id; const canRename = reportReference(report) !== null; return <li className="tenant-audit__history-row" key={report.id}><button aria-pressed={isSelected} className={isSelected ? 'tenant-audit__history-item tenant-audit__history-item--selected' : 'tenant-audit__history-item'} onClick={() => { userSelectedReportId.current = report.id; setSelectedReportId(report.id) }} type="button"><span className="tenant-audit__history-main"><strong>{report.title}</strong><span><time dateTime={report.report_date}>{formatReportDate(report.report_date)}</time> · {providerLabel(report.provider)}</span></span><span className="tenant-audit__history-stat"><strong className={report.status === 'archived' ? 'tenant-audit__status tenant-audit__status--archived' : 'tenant-audit__status'}>{reportStatusLabel(report.status)}</strong><span>{report.sources_analyzed} sources · Décisions nécessaires : {report.decisions_required ?? '—'}</span></span><span aria-hidden="true" className="tenant-audit__history-chevron">→</span></button>{canRename ? <button aria-label={`Renommer ${report.title}`} className="tenant-audit__rename-button" disabled={isRenaming} onClick={() => beginRename(report)} type="button">Renommer</button> : null}{renaming ? <div className="tenant-audit__inline-rename"><label htmlFor={`rename-${report.id}`}>Nouveau titre</label><input id={`rename-${report.id}`} maxLength={120} onChange={(event) => setTitleDraft(event.target.value)} value={titleDraft} /><div className="tenant-audit__actions"><button className="secondary-button" disabled={isRenaming} onClick={() => { setEditingReportId(null); setRenameError(null) }} type="button">Annuler</button><button className="primary-button" disabled={isRenaming} onClick={() => void saveRename(report)} type="button">{isRenaming ? 'Enregistrement…' : 'Enregistrer'}</button></div>{renameError ? <p role="alert">{renameError}</p> : null}</div> : null}</li> })}</ul></section>
  }

  function renderTechnicalArtifacts(report: AdminTenantReport) {
    const detail = reportDetailState.status === 'loaded' && reportDetailState.report.report_id === report.id
      ? reportDetailState.report
      : null
    const structured = detail?.structured_report ?? null
    const rawDdl = structured?.raw_ddl ?? null
    const rawEr = structured?.raw_er ?? null
    const rawDdlInvalid = structured?.raw_ddl_invalid === true
    const rawErInvalid = structured?.raw_er_invalid === true
    const hasDdl = rawDdl !== null && rawDdl.length > 0 && !rawDdlInvalid
    const hasEr = rawEr !== null && !rawErInvalid
    const fileName = buildRawDdlFilename(tenantLabel, report.provider, report.title, report.report_date)
    return (
      <section aria-label="Cartographie technique" className="tenant-audit__technical">
        <div className="tenant-audit__section-heading">
          <div>
            <p className="tenant-audit__eyebrow">Artefacts techniques</p>
            <h4>Cartographie technique</h4>
          </div>
          <p>Lecture seule · photographie de l’existant observé</p>
        </div>
        {reportDetailState.status === 'loading' ? <p className="tenant-audit__report-loading" role="status">Chargement des artefacts…</p> : null}
        {reportDetailState.status === 'error' ? <p className="tenant-audit__empty-note" role="alert">Les artefacts techniques ne peuvent pas être chargés pour le moment.</p> : null}
        {reportDetailState.status === 'unavailable' ? <p className="tenant-audit__empty-note">Les artefacts techniques ne sont pas disponibles pour cet ancien audit.</p> : null}
        {rawDdlInvalid ? <p className="tenant-audit__empty-note" role="alert">Le DDL brut reçu est invalide et reste masqué.</p> : null}
        {rawErInvalid ? <p className="tenant-audit__empty-note" role="alert">Le modèle ER brut reçu est invalide et reste masqué.</p> : null}
        {detail ? (
          <div className="tenant-audit__technical-actions">
            {hasDdl ? <button className="secondary-button" onClick={() => setIsDdlVisible((visible) => !visible)} type="button">{isDdlVisible ? 'Masquer le DDL brut' : 'Voir le DDL brut'}</button> : null}
            {hasDdl && !isDdlVisible ? <span className="tenant-audit__technical-download-note">Le téléchargement est disponible après ouverture du DDL.</span> : null}
            {hasEr ? <button className="secondary-button" onClick={() => setIsErVisible((visible) => !visible)} type="button">{isErVisible ? 'Masquer le diagramme ER brut' : 'Voir le diagramme ER brut'}</button> : null}
            {!hasDdl && !hasEr && !rawDdlInvalid && !rawErInvalid ? <p className="tenant-audit__empty-note">Aucun artefact technique n’est disponible pour ce rapport.</p> : null}
          </div>
        ) : null}
        {hasDdl && isDdlVisible ? <RawDdlViewer ddl={rawDdl} fileName={fileName} /> : null}
        {hasEr && isErVisible ? <RawAuditERDiagram model={rawEr} /> : null}
      </section>
    )
  }

  function renderSelectedReport(report: AdminTenantReport) {
    const isArchived = report.status === 'archived'
    const renaming = editingReportId === report.id
    const canRename = reportReference(report) !== null
    return <section aria-label="Rapport sélectionné" className="tenant-audit__selected-report"><article aria-label={`${report.title} — ${formatReportDate(report.report_date)}`} className={isArchived ? 'tenant-audit__report tenant-audit__report--archived' : 'tenant-audit__report'}><div className="tenant-audit__report-heading"><div><p className="tenant-audit__eyebrow">Rapport sélectionné</p><h4>{report.title}</h4><p className="tenant-audit__report-client">Client : <strong>{tenantLabel}</strong></p></div><div className="tenant-audit__report-meta"><p>Provider : <strong>{providerLabel(report.provider)}</strong></p><p>Date : <time dateTime={report.report_date}>{formatReportDate(report.report_date)}</time></p><p>Statut : <strong className={isArchived ? 'tenant-audit__status tenant-audit__status--archived' : 'tenant-audit__status'}>{isArchived ? 'Archivé' : 'Terminé'}</strong></p>{canRename ? <button className="secondary-button tenant-audit__rename-header" disabled={isRenaming} onClick={() => beginRename(report)} type="button">Renommer</button> : null}</div></div>{renaming ? <div className="tenant-audit__header-rename"><label htmlFor={`header-rename-${report.id}`}>Titre de l’audit</label><input id={`header-rename-${report.id}`} maxLength={120} onChange={(event) => setTitleDraft(event.target.value)} value={titleDraft} /><div className="tenant-audit__actions"><button className="secondary-button" disabled={isRenaming} onClick={() => { setEditingReportId(null); setRenameError(null) }} type="button">Annuler</button><button className="primary-button" disabled={isRenaming} onClick={() => void saveRename(report)} type="button">{isRenaming ? 'Enregistrement…' : 'Enregistrer'}</button></div>{renameError ? <p role="alert">{renameError}</p> : null}</div> : null}<div className="tenant-audit__report-footer"><div className="tenant-audit__actions"><a className="primary-button" href={buildAdminTenantReportPdfUrl(apiBaseUrl, tenantId, report.id)} rel="noreferrer" target="_blank">Voir le rapport</a><a className="secondary-button" href={buildAdminTenantReportPdfUrl(apiBaseUrl, tenantId, report.id, true)}>Télécharger PDF</a>{report.status === 'completed' ? <button className="secondary-button" disabled={pendingId !== null} onClick={() => { setConfirmationId(report.id); setArchiveError(null) }} type="button">Archiver</button> : null}</div><p className="tenant-audit__summary">{isArchived ? 'Ce rapport est conservé dans l’historique et reste consultable.' : 'L’audit est terminé. Consultez le rapport pour les points à régler et les décisions attendues.'}</p></div>{renderTechnicalArtifacts(report)}{confirmationId === report.id ? <div className="tenant-audit__confirmation" role="alertdialog" aria-labelledby={`archive-${report.id}-title`} aria-describedby={`archive-${report.id}-description`}><strong id={`archive-${report.id}-title`}>Archiver {report.title} du {formatReportDate(report.report_date)} ?</strong><p id={`archive-${report.id}-description`}>Le rapport sera déplacé dans « Rapports archivés ». Son PDF et ses métadonnées seront conservés.</p><div className="tenant-audit__actions"><button autoFocus className="secondary-button" disabled={pendingId !== null} onClick={() => { setConfirmationId(null); setArchiveError(null) }} type="button">Annuler</button><button className="primary-button" disabled={pendingId !== null} onClick={() => void archiveReport(report.id)} type="button">{pendingId === report.id ? 'Archivage…' : 'Confirmer l’archivage'}</button></div>{archiveError && <p role="alert">{archiveError}</p>}</div> : null}</article></section>
  }

  return <section aria-label="Audit & cartographie" className="tenant-audit"><h3>Audit & cartographie</h3>{renderAuditLauncher()}{state.status === 'loading' ? <p role="status">Chargement des rapports…</p> : state.status !== 'loaded' ? <div role="alert"><p>Les rapports ne sont pas disponibles pour le moment.</p><button className="secondary-button" onClick={() => setReloadKey((key) => key + 1)} type="button">Réessayer</button></div> : state.reports.length === 0 ? <><p>{reportsError ?? 'Aucun rapport publié pour ce client.'}</p></> : <>{reportsError ? <p role="alert">{reportsError}</p> : null}{selectedReport ? renderSelectedReport(selectedReport) : null}{renderReportHistory(state.reports)}</>}</section>
}
