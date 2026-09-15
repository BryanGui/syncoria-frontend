import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchAdminTenantProviderAudit,
  fetchLatestAdminTenantProviderAudit,
  fetchAdminTenantProviderAuditReport,
  launchAdminTenantProviderAudit,
  updateAdminTenantProviderAuditTitle,
  type AdminProviderAuditOperation,
  type AdminProviderAuditERModel,
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
type AuditDetailTab = 'ddl' | 'er'
type ReportDetailState =
  | { status: 'idle' }
  | { status: 'loading' | 'unavailable' | 'error'; reportId: string }
  | { status: 'loaded'; reportId: string; report: AdminProviderAuditReport }

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
  return status === 'archived' ? 'Archivé' : 'Terminé'
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

function buildRawErFilename(
  tenantLabel: string,
  provider: string,
  reportTitle: string,
  reportDate: string,
  extension: 'json' | 'mmd',
): string {
  return [tenantLabel, provider, reportTitle, reportDate]
    .map(reportArtifactFilenamePart).join('-') + `.${extension}`
}

function escapeMermaidLabel(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function buildRawErMermaid(model: AdminProviderAuditERModel): string {
  const tableIds = new Map(model.tables.map((table, index) => [table.name, `table_${index}_${reportArtifactFilenamePart(table.name).replace(/-/g, '_')}`]))
  const lines = ['flowchart LR']
  model.tables.forEach((table, index) => {
    const tableId = tableIds.get(table.name) ?? `table_${index}_audit`
    const columns = table.columns.map((column) => escapeMermaidLabel(`${column.name}: ${column.postgres_type}`))
    const label = [escapeMermaidLabel(table.name), ...columns].filter(Boolean).join('<br/>')
    lines.push(`  ${tableId}["${label}"]`)
  })
  model.relationships.forEach((relationship) => {
    const sourceId = tableIds.get(relationship.source_table)
    const targetId = relationship.target_table === null ? null : tableIds.get(relationship.target_table)
    const targetColumn = relationship.target_column === null ? '' : ` → ${relationship.target_column}`
    const relationLabel = `${relationship.source_column}${targetColumn} · cardinality: ${relationship.cardinality}`
    if (sourceId === undefined || targetId === null || targetId === undefined) {
      lines.push(`  %% Relation observée non résolue : ${escapeMermaidLabel(`${relationship.source_table}.${relationship.source_column} → ${relationship.target_table ?? 'cible inconnue'}`)}`)
      return
    }
    lines.push(`  ${sourceId} -->|"${escapeMermaidLabel(relationLabel)}"| ${targetId}`)
  })
  return `${lines.join('\n')}\n`
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

function RawErViewer({
  model,
  fileNameBase,
}: {
  model: AdminProviderAuditERModel
  fileNameBase: string
}) {
  const rawJson = useMemo(() => `${JSON.stringify(model, null, 2)}\n`, [model])
  const rawMermaid = useMemo(() => buildRawErMermaid(model), [model])
  const downloadUrls = useMemo(() => ({
    json: URL.createObjectURL(new Blob([rawJson], { type: 'application/json;charset=utf-8' })),
    mermaid: URL.createObjectURL(new Blob([rawMermaid], { type: 'text/plain;charset=utf-8' })),
  }), [rawJson, rawMermaid])
  useEffect(() => () => {
    URL.revokeObjectURL(downloadUrls.json)
    URL.revokeObjectURL(downloadUrls.mermaid)
  }, [downloadUrls])
  return (
    <div className="raw-er-viewer">
      <div className="raw-er-viewer__toolbar">
        <span>Export déterministe depuis raw_er</span>
        <div className="raw-er-viewer__downloads">
          <a className="secondary-button" download={`${fileNameBase}.json`} href={downloadUrls.json}>
            Télécharger l’ER brut (JSON)
          </a>
          <a className="secondary-button" download={`${fileNameBase}.mmd`} href={downloadUrls.mermaid}>
            Télécharger l’ER brut (Mermaid)
          </a>
        </div>
      </div>
      <RawAuditERDiagram model={model} />
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
  const [showArchives, setShowArchives] = useState(false)
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null)
  const [expandedArtifactTab, setExpandedArtifactTab] = useState<AuditDetailTab>('ddl')
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
  const [reportDetailState, setReportDetailState] = useState<ReportDetailState>({ status: 'idle' })
  const archiveRequest = useRef<AbortController | null>(null)
  const auditRequest = useRef<AbortController | null>(null)
  const renameRequest = useRef<AbortController | null>(null)
  const reportDetailRequest = useRef<AbortController | null>(null)
  const polling = useRef<{ controller: AbortController; timer: number | null } | null>(null)
  const reportsTenant = useRef<string | null>(null)
  const lastActiveAudit = useRef<AdminProviderAuditOperation | null>(null)
  const selectedProvider = useMemo(() => providers.find((provider) => provider.id === selectedProviderId) ?? null, [providers, selectedProviderId])
  const activeProviders = useMemo(() => providers.filter((provider) => provider.status === 'active'), [providers])
  const auditableProviders = useMemo(() => activeProviders.filter((provider) => provider.audit_supported), [activeProviders])
  const shouldSelectAuditProvider = auditableProviders.length > 1
  const visibleReports = useMemo(() => {
    if (state.status !== 'loaded') return []
    return state.reports.filter((report) => showArchives ? report.status === 'archived' : report.status === 'completed')
  }, [showArchives, state])

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
    if (tenantChanged) { setReportsError(null); setState({ status: 'loading' }); setShowArchives(false); setExpandedReportId(null); setReportDetailState({ status: 'idle' }) } else setState((previous) => previous.status === 'loaded' ? previous : { status: 'loading' })
    setConfirmationId(null); setPendingId(null); setArchiveError(null)
    void fetchAdminTenantReports(apiBaseUrl, tenantId, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      if (result.status === 'unauthenticated') { setReportsError(null); setState(result); onSessionExpired() } else if (result.status === 'loaded') { setReportsError(null); setState(result) } else { setReportsError('La mise à jour des rapports est temporairement indisponible.'); setState((previous) => previous.status === 'loaded' ? previous : result) }
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
    if (expandedReportId === null) {
      setReportDetailState({ status: 'idle' })
      return undefined
    }
    const report = state.status === 'loaded'
      ? state.reports.find((item) => item.id === expandedReportId) ?? null
      : null
    const reference = report === null ? null : reportReference(report)
    if (reference === null) {
      setReportDetailState({ status: 'unavailable', reportId: expandedReportId })
      return undefined
    }
    const controller = new AbortController()
    reportDetailRequest.current = controller
    setReportDetailState({ status: 'loading', reportId: expandedReportId })
    void fetchAdminTenantProviderAuditReport(
      apiBaseUrl, tenantId, reference.providerRecordId, reference.correlationId,
      controller.signal,
    ).then((result) => {
      if (controller.signal.aborted) return
      reportDetailRequest.current = null
      if (result.status === 'unauthenticated') {
        onSessionExpired()
        setReportDetailState({ status: 'error', reportId: expandedReportId })
      } else if (result.status === 'loaded' && result.report.report_id === expandedReportId) {
        setReportDetailState({ status: 'loaded', reportId: expandedReportId, report: result.report })
      } else {
        setReportDetailState({ status: result.status === 'not_found' ? 'unavailable' : 'error', reportId: expandedReportId })
      }
    })
    return () => {
      controller.abort()
      if (reportDetailRequest.current === controller) reportDetailRequest.current = null
    }
  }, [apiBaseUrl, expandedReportId, onSessionExpired, reportReference, state, tenantId])

  useEffect(() => {
    const controller = new AbortController(); setProviderState('loading'); setProviders([]); setSelectedProviderId(''); setAuditOperation(null); lastActiveAudit.current = null; setAuditError(null); setIsLaunching(false); setDisplayTitle('')
    async function loadAuditState() { const result = await fetchAdminTenantProviders(apiBaseUrl, tenantId, controller.signal); if (controller.signal.aborted) return; if (result.status === 'unauthenticated') { onSessionExpired(); return } if (result.status !== 'loaded') { setProviderState('error'); return } const active = result.providers.filter((provider) => provider.status === 'active'); setProviderState('loaded'); setProviders(active); setSelectedProviderId(active.find((provider) => provider.audit_supported)?.id ?? active[0]?.id ?? '') }
    void loadAuditState()
    return () => { controller.abort(); auditRequest.current?.abort(); auditRequest.current = null; stopPolling() }
  }, [apiBaseUrl, onSessionExpired, stopPolling, tenantId])

  useEffect(() => {
    const controller = new AbortController(); auditRequest.current?.abort(); auditRequest.current = controller; stopPolling(); setAuditOperation(null); lastActiveAudit.current = null; setAuditError(null)
    if (selectedProvider === null || !selectedProvider.audit_supported) return () => controller.abort()
    setDisplayTitle(`Audit ${providerLabel(selectedProvider.provider)} — ${formatLocalCalendarDate(new Date())}`); setTitleError(null)
    void fetchLatestAdminTenantProviderAudit(apiBaseUrl, tenantId, selectedProvider.id, controller.signal).then((latest) => { if (controller.signal.aborted) return; if (latest.status === 'unauthenticated') onSessionExpired(); else if (latest.status === 'loaded') { applyAuditOperation(latest.operation); if (latest.operation.status === 'pending' || latest.operation.status === 'running') beginPolling(selectedProvider.id, latest.operation.correlation_id) } else if (latest.status !== 'not_found') setAuditError('L’état de l’audit n’est pas disponible pour le moment.') })
    return () => { controller.abort(); if (auditRequest.current === controller) auditRequest.current = null; stopPolling() }
  }, [apiBaseUrl, applyAuditOperation, beginPolling, onSessionExpired, selectedProvider, stopPolling, tenantId])

  function auditFailureMessage(errorCode: string | null): string { if (errorCode === 'credential') return 'Vérifiez la configuration de cette connexion.'; if (errorCode === 'unsupported') return 'Cet audit n’est pas disponible pour cette connexion.'; if (errorCode === 'invalid_context') return 'La configuration de l’audit est invalide.'; return 'L’audit n’a pas pu être terminé. Vous pouvez réessayer.' }
  async function launchAudit() {
    if (selectedProvider === null || !selectedProvider.audit_supported || !selectedProvider.credential_configured || isLaunching || auditOperation?.status === 'pending' || auditOperation?.status === 'running') return
    const normalizedTitle = displayTitle.trim(); if (!normalizedTitle || titleByteLength(normalizedTitle) > 120) { setTitleError('Saisissez un titre de 1 à 120 octets.'); return }
    auditRequest.current?.abort(); const controller = new AbortController(); auditRequest.current = controller; setIsLaunching(true); setAuditError(null); setTitleError(null)
    const result = await launchAdminTenantProviderAudit(apiBaseUrl, tenantId, selectedProvider.id, { signal: controller.signal, displayTitle: normalizedTitle })
    if (controller.signal.aborted) return
    if (result.status === 'unauthenticated') { auditRequest.current = null; setIsLaunching(false); onSessionExpired(); return }
    if (result.status === 'conflict') { const latest = await fetchLatestAdminTenantProviderAudit(apiBaseUrl, tenantId, selectedProvider.id, controller.signal); if (controller.signal.aborted) return; auditRequest.current = null; setIsLaunching(false); if (latest.status === 'loaded') { applyAuditOperation(latest.operation); if (latest.operation.status === 'pending' || latest.operation.status === 'running') beginPolling(selectedProvider.id, latest.operation.correlation_id) } else if (latest.status === 'unauthenticated') onSessionExpired(); else setAuditError('Un audit est déjà actif, mais son état ne peut pas être récupéré.'); return }
    auditRequest.current = null; setIsLaunching(false); if (result.status !== 'loaded') { setAuditError(result.status === 'invalid' ? 'L’audit est indisponible ou mal configuré pour cette connexion.' : 'L’audit n’a pas pu être lancé. Réessayez.'); return }
    applyAuditOperation(result.operation); if (result.operation.status === 'pending' || result.operation.status === 'running') beginPolling(selectedProvider.id, result.operation.correlation_id); else if (result.operation.status === 'completed') setReloadKey((key) => key + 1)
  }

  function renderAuditLauncher() {
    const auditActive = auditOperation?.status === 'pending' || auditOperation?.status === 'running'
    const disabled = providerState !== 'loaded' || selectedProvider === null
      || !selectedProvider.audit_supported || !selectedProvider.credential_configured
      || isLaunching || auditActive
    return <section aria-label="Lancement de l’audit" className="tenant-audit__launcher">
      <div className="tenant-audit__launcher-title"><h4>Lancer un audit</h4><span className="tenant-audit__launcher-note">Une connexion par audit</span></div>
      <div className="tenant-audit__launcher-fields">
        <div className="tenant-audit__field">
          <label className="tenant-audit__provider-label" htmlFor="audit-title">Titre de l’audit</label>
          <input aria-describedby="audit-title-help" aria-invalid={titleError !== null} id="audit-title" maxLength={120} onChange={(event) => { setDisplayTitle(event.target.value); setTitleError(null) }} value={displayTitle} />
          <small id="audit-title-help">Ce titre sera visible dans l’historique et le rapport.</small>
          {titleError ? <p role="alert">{titleError}</p> : null}
        </div>
        <div className="tenant-audit__field">
          {shouldSelectAuditProvider ? (
            <label className="tenant-audit__provider-label" htmlFor="audit-provider">
              Provider à auditer
              <select
                aria-describedby="audit-provider-help"
                disabled={auditActive || isLaunching || providerState !== 'loaded'}
                id="audit-provider"
                onChange={(event) => setSelectedProviderId(event.target.value)}
                value={selectedProviderId}
              >
                {activeProviders.map((provider) => (
                  <option aria-disabled={!provider.audit_supported} disabled={!provider.audit_supported} key={provider.id} value={provider.id}>
                    {providerLabel(provider.provider)} — {provider.name}{!provider.audit_supported ? ' — indisponible' : ''}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <span className="tenant-audit__provider-label">Provider à auditer</span>
              <div aria-describedby="audit-provider-help" className="tenant-audit__provider-static">
                {auditableProviders[0] === undefined ? 'Aucun provider auditable' : `${providerLabel(auditableProviders[0].provider)} — ${auditableProviders[0].name}`}
              </div>
            </>
          )}
          <small id="audit-provider-help">{shouldSelectAuditProvider ? 'Les connexions non auditables restent visibles mais ne peuvent pas être sélectionnées.' : 'La connexion auditable est sélectionnée automatiquement.'}</small>
        </div>
        <button className="primary-button" disabled={disabled} onClick={() => void launchAudit()} type="button">{isLaunching ? 'Lancement…' : auditActive ? 'Audit en cours…' : 'Lancer l’audit'}</button>
      </div>
      {providerState === 'loading' ? <p aria-live="polite">Recherche des connexions…</p> : null}
      {providerState === 'error' ? <p role="alert">Les connexions ne peuvent pas être vérifiées pour le moment.</p> : null}
      {providerState === 'loaded' && activeProviders.length === 0 ? <p role="status">Aucune connexion active n’est disponible pour ce tenant.</p> : null}
      {selectedProvider !== null && !selectedProvider.audit_supported ? <p role="status">Audit indisponible pour cette connexion.</p> : null}
      {selectedProvider?.audit_supported && !selectedProvider.credential_configured ? <p role="status">Configurez d’abord le credential pour lancer l’audit.</p> : null}
      {auditOperation !== null ? <div className="tenant-audit__launcher-status">{auditOperation.status === 'failed' ? <><strong>Échec de l’audit</strong><p>{auditFailureMessage(auditOperation.error_code)}</p><AuditProgress lastActiveOperation={lastActiveAudit.current} operation={auditOperation} /></> : auditOperation.status === 'completed' ? <><strong>État : Terminé</strong><AuditProgress lastActiveOperation={null} operation={auditOperation} /><dl><div><dt>Sources analysées</dt><dd>{auditOperation.sources_total}</dd></div><div><dt>Sources retenues</dt><dd>{auditOperation.sources_retained}</dd></div><div><dt>Sources écartées</dt><dd>{auditOperation.sources_excluded}</dd></div><div><dt>Décisions nécessaires</dt><dd>{auditOperation.decisions_required}</dd></div><div><dt>Enregistrements retenus</dt><dd>{auditOperation.records_retained}</dd></div></dl></> : <AuditProgress lastActiveOperation={lastActiveAudit.current} operation={auditOperation} />}</div> : null}
      {auditError ? <p role="alert">{auditError}</p> : null}
    </section>
  }

  async function archiveReport(reportId: string) {
    if (archiveRequest.current && !archiveRequest.current.signal.aborted) return
    const controller = new AbortController(); archiveRequest.current = controller; setPendingId(reportId); setArchiveError(null); const result = await archiveAdminTenantReport(apiBaseUrl, tenantId, reportId, controller.signal); if (controller.signal.aborted) return; archiveRequest.current = null; setPendingId(null)
    if (result.status === 'unauthenticated') { onSessionExpired(); setState({ status: 'unauthenticated' }) } else if (result.status === 'archived') { setConfirmationId(null); setExpandedReportId(null); setReportDetailState({ status: 'idle' }); setState((previous) => previous.status !== 'loaded' ? previous : { ...previous, reports: previous.reports.map((report) => report.id === reportId ? { ...report, status: 'archived' } : report) }); setReloadKey((key) => key + 1) } else setArchiveError(result.status === 'not_found' ? 'Ce rapport ou ce client n’est plus disponible. Rechargez les rapports.' : 'Le rapport n’a pas pu être archivé. Réessayez.')
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

  function toggleArtifact(report: AdminTenantReport, tab: AuditDetailTab) {
    if (reportReference(report) === null) return
    if (expandedReportId === report.id && expandedArtifactTab === tab) {
      setExpandedReportId(null)
      setReportDetailState({ status: 'idle' })
      return
    }
    setExpandedArtifactTab(tab)
    setExpandedReportId(report.id)
  }

  function renderReportHistory(reports: AdminTenantReport[]) {
    return <section aria-label="Historique des audits" className="tenant-audit__history"><div className="tenant-audit__section-heading"><div><p className="tenant-audit__eyebrow">Historique</p><h4>{showArchives ? 'Audits archivés' : 'Audits'}</h4></div><button className="secondary-button tenant-audit__archive-toggle" onClick={() => { setShowArchives((visible) => !visible); setExpandedReportId(null); setReportDetailState({ status: 'idle' }) }} type="button">{showArchives ? 'Retour aux audits' : 'Voir les archives'}</button></div>{reports.length === 0 ? <p className="tenant-audit__empty-note">{showArchives ? 'Aucun audit archivé.' : 'Aucun audit publié pour ce client.'}</p> : <ul>{reports.map((report) => { const renaming = editingReportId === report.id; const reference = reportReference(report); const detailMatches = reportDetailState.status !== 'idle' && reportDetailState.reportId === report.id; const loadedDetail = reportDetailState.status === 'loaded' && reportDetailState.reportId === report.id ? reportDetailState.report : null; const hasDdl = loadedDetail === null || (loadedDetail.structured_report.raw_ddl !== null && loadedDetail.structured_report.raw_ddl.length > 0 && !loadedDetail.structured_report.raw_ddl_invalid); const hasEr = loadedDetail === null || (loadedDetail.structured_report.raw_er !== null && !loadedDetail.structured_report.raw_er_invalid); const hasManagementActions = reference !== null || report.status === 'completed'; return <li className="tenant-audit__history-row" key={report.id}><article aria-label={`${report.title} — ${formatReportDate(report.report_date)}`} className="tenant-audit__history-item"><div className="tenant-audit__history-summary"><div className="tenant-audit__history-main"><strong>{report.title}</strong><span>Provider : {providerLabel(report.provider)} · <time dateTime={report.report_date}>{formatReportDate(report.report_date)}</time></span></div><div className="tenant-audit__history-stat"><strong className={report.status === 'archived' ? 'tenant-audit__status tenant-audit__status--archived' : 'tenant-audit__status'}>{reportStatusLabel(report.status)}</strong><span>{report.sources_analyzed} sources{report.decisions_required === null ? '' : ` · Décisions nécessaires : ${report.decisions_required}`}</span></div></div><div className="tenant-audit__history-actions-layout"><div className="tenant-audit__history-actions tenant-audit__history-actions--primary"><a className="primary-button" href={buildAdminTenantReportPdfUrl(apiBaseUrl, tenantId, report.id)} rel="noreferrer" target="_blank">Voir rapport</a><a className="secondary-button" href={buildAdminTenantReportPdfUrl(apiBaseUrl, tenantId, report.id, true)}>Télécharger PDF</a>{reference && hasDdl ? <button className="secondary-button" onClick={() => toggleArtifact(report, 'ddl')} type="button">{expandedReportId === report.id && expandedArtifactTab === 'ddl' ? 'Masquer DDL brut' : 'DDL brut'}</button> : null}{reference && hasEr ? <button className="secondary-button" onClick={() => toggleArtifact(report, 'er')} type="button">{expandedReportId === report.id && expandedArtifactTab === 'er' ? 'Masquer ER brut' : 'ER brut'}</button> : null}</div>{hasManagementActions ? <div className="tenant-audit__history-actions tenant-audit__history-actions--secondary">{reference ? <button aria-label={`Renommer ${report.title}`} className="secondary-button" disabled={isRenaming} onClick={() => beginRename(report)} type="button">Renommer</button> : null}{report.status === 'completed' ? <button className="secondary-button" disabled={pendingId !== null} onClick={() => { setConfirmationId(report.id); setArchiveError(null) }} type="button">Archiver</button> : null}</div> : null}</div>{renaming ? <div className="tenant-audit__inline-rename"><label htmlFor={`rename-${report.id}`}>Nouveau titre</label><input id={`rename-${report.id}`} maxLength={120} onChange={(event) => setTitleDraft(event.target.value)} value={titleDraft} /><div className="tenant-audit__actions"><button className="secondary-button" disabled={isRenaming} onClick={() => { setEditingReportId(null); setRenameError(null) }} type="button">Annuler</button><button className="primary-button" disabled={isRenaming} onClick={() => void saveRename(report)} type="button">{isRenaming ? 'Enregistrement…' : 'Enregistrer'}</button></div>{renameError ? <p role="alert">{renameError}</p> : null}</div> : null}{expandedReportId === report.id ? renderArtifactPanel(report, detailMatches) : null}{confirmationId === report.id ? <div className="tenant-audit__confirmation" role="alertdialog" aria-labelledby={`archive-${report.id}-title`} aria-describedby={`archive-${report.id}-description`}><strong id={`archive-${report.id}-title`}>Archiver {report.title} du {formatReportDate(report.report_date)} ?</strong><p id={`archive-${report.id}-description`}>Le rapport sera déplacé dans « Rapports archivés ». Son PDF et ses métadonnées seront conservés.</p><div className="tenant-audit__actions"><button autoFocus className="secondary-button" disabled={pendingId !== null} onClick={() => { setConfirmationId(null); setArchiveError(null) }} type="button">Annuler</button><button className="primary-button" disabled={pendingId !== null} onClick={() => void archiveReport(report.id)} type="button">{pendingId === report.id ? 'Archivage…' : 'Confirmer l’archivage'}</button></div>{archiveError && <p role="alert">{archiveError}</p>}</div> : null}</article></li> })}</ul>}</section>
  }

  function renderArtifactPanel(report: AdminTenantReport, detailMatches: boolean) {
    const detail = reportDetailState.status === 'loaded' && detailMatches
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
    const erFileNameBase = buildRawErFilename(tenantLabel, report.provider, report.title, report.report_date, 'mmd').replace(/\.mmd$/, '')
    return <section aria-label={`Artefacts de ${report.title}`} className="tenant-audit__artifact-panel">
      {reportDetailState.status === 'loading' && detailMatches ? <p className="tenant-audit__report-loading" role="status">Chargement des artefacts…</p> : null}
      {reportDetailState.status === 'error' && detailMatches ? <p className="tenant-audit__empty-note" role="alert">Les artefacts techniques ne peuvent pas être chargés pour le moment.</p> : null}
      {reportDetailState.status === 'unavailable' && detailMatches ? <p className="tenant-audit__empty-note">Les artefacts techniques ne sont pas disponibles pour cet ancien audit.</p> : null}
      {rawDdlInvalid ? <p className="tenant-audit__empty-note" role="alert">Le DDL brut reçu est invalide et reste masqué.</p> : null}
      {rawErInvalid ? <p className="tenant-audit__empty-note" role="alert">Le modèle ER brut reçu est invalide et reste masqué.</p> : null}
      {expandedArtifactTab === 'ddl' && hasDdl ? <RawDdlViewer ddl={rawDdl} fileName={fileName} /> : null}
      {expandedArtifactTab === 'er' && hasEr ? <RawErViewer fileNameBase={erFileNameBase} model={rawEr} /> : null}
      {detail && expandedArtifactTab === 'ddl' && !hasDdl ? <p className="tenant-audit__empty-note">Aucun DDL brut n’est disponible pour ce rapport.</p> : null}
      {detail && expandedArtifactTab === 'er' && !hasEr ? <p className="tenant-audit__empty-note">Aucun ER brut n’est disponible pour ce rapport.</p> : null}
    </section>
  }

  return <section aria-label="Audit & cartographie" className="tenant-audit"><h3>Audit & cartographie</h3>{renderAuditLauncher()}{state.status === 'loading' ? <p role="status">Chargement des rapports…</p> : state.status !== 'loaded' ? <div role="alert"><p>Les rapports ne sont pas disponibles pour le moment.</p><button className="secondary-button" onClick={() => setReloadKey((key) => key + 1)} type="button">Réessayer</button></div> : <>{reportsError ? <p role="alert">{reportsError}</p> : null}{renderReportHistory(visibleReports)}</>}</section>
}
