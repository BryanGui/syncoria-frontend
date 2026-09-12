import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchAdminTenantProviderAudit,
  fetchLatestAdminTenantProviderAudit,
  fetchAdminTenantProviderAuditReport,
  launchAdminTenantProviderAudit,
  updateAdminTenantProviderAuditTitle,
  type AdminProviderAuditDecision,
  type AdminProviderAuditOperation,
  type AdminProviderAuditReport,
  type AdminProviderAuditSource,
  type AdminProviderAuditStructuredReport,
} from '../api/adminTenantAudits'
import { fetchAdminTenantProviders, type AdminProviderRecord } from '../api/adminTenantProviders'
import {
  archiveAdminTenantReport,
  buildAdminTenantReportPdfUrl,
  fetchAdminTenantReports,
  type AdminTenantReport,
  type AdminTenantReportsResult,
} from '../api/adminTenantReports'
import { formatReportDate } from '../tenantReports/model'

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
type StructuredReportState =
  | { status: 'idle' | 'loading' }
  | { status: 'loaded'; report: AdminProviderAuditReport }
  | { status: 'unavailable' | 'error' }

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return minutes === 0 ? `${remainder} s` : `${minutes} min ${String(remainder).padStart(2, '0')} s`
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

function decisionLabel(decision: AdminProviderAuditDecision): string {
  if (decision === 'retained') return 'Retenue'
  if (decision === 'excluded') return 'Écartée'
  return 'En attente'
}

function ReportMetricCards({ metrics }: { metrics: Omit<AdminProviderAuditStructuredReport['metrics'], 'decisions_required'> & { decisions_required: number | null } }) {
  const items = [
    ['Sources analysées', metrics.sources_analyzed], ['Sources retenues', metrics.sources_retained],
    ['Sources écartées', metrics.sources_excluded], ['Enregistrements retenus', metrics.records_retained],
    ['Décisions nécessaires', metrics.decisions_required],
  ] as const
  return <dl className="tenant-audit__kpis">{items.map(([label, value]) => <div className={label === 'Décisions nécessaires' && value !== null && value > 0 ? 'tenant-audit__kpi tenant-audit__kpi--attention' : value === null ? 'tenant-audit__kpi tenant-audit__kpi--neutral' : 'tenant-audit__kpi'} key={label}><dt>{label}</dt><dd>{value ?? '—'}</dd></div>)}</dl>
}

function ReportSection({ title, items, className = '' }: { title: string; items: string[]; className?: string }) {
  if (items.length === 0) return null
  return <section className={`tenant-audit__report-section ${className}`.trim()}><h5>{title}</h5><ul>{items.map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}</ul></section>
}

function SourceDecisionGroup({ title, sources, decision }: { title: string; sources: AdminProviderAuditSource[]; decision: AdminProviderAuditDecision }) {
  if (sources.length === 0) return null
  return <section className={`tenant-audit__source-group tenant-audit__source-group--${decision}`}><div className="tenant-audit__source-group-heading"><h5>{title}</h5><span>{sources.length} source{sources.length > 1 ? 's' : ''}</span></div><ul>{sources.map((source, index) => <li key={`${source.source_name}-${index}`}><strong>{source.source_name}</strong><span>{source.volume ?? '—'} éléments</span><small>{source.reason || 'Aucun motif précisé.'}</small></li>)}</ul></section>
}

function StructuredReportView({ report }: { report: AdminProviderAuditReport }) {
  const content = report.structured_report
  return <div className="tenant-audit__structured-report">
    <ReportMetricCards metrics={content.metrics} />
    <section className="tenant-audit__blockers" aria-labelledby="audit-blockers-title"><div><p className="tenant-audit__eyebrow">Décisions / vigilance</p><h5 id="audit-blockers-title">Blockers</h5></div>{content.blockers.length > 0 ? <ul>{content.blockers.map((blocker, index) => <li key={`blocker-${index}`}>{blocker}</li>)}</ul> : <p>Aucun blocker identifié dans le rapport.</p>}</section>
    <ReportSection title="Résumé exécutif" items={content.summary} />
    <ReportSection title="Périmètre audité" items={content.scope} />
    <section className="tenant-audit__source-map" aria-labelledby="audit-source-map-title"><div className="tenant-audit__section-heading"><div><p className="tenant-audit__eyebrow">Cartographie</p><h5 id="audit-source-map-title">Sources auditées</h5></div><span>{content.sources.length} source{content.sources.length > 1 ? 's' : ''}</span></div>{content.sources.length > 0 ? <div className="tenant-audit__source-table-wrap"><table className="tenant-audit__source-table"><thead><tr><th>Source</th><th>Volume</th><th>Décision</th><th>Motif</th></tr></thead><tbody>{content.sources.map((source, index) => <tr key={`${source.source_name}-${index}`}><td><strong>{source.source_name}</strong><small>{source.source_type}</small></td><td>{source.volume ?? '—'}</td><td><span className={`tenant-audit__decision tenant-audit__decision--${source.decision}`}>{decisionLabel(source.decision)}</span></td><td>{source.reason || '—'}</td></tr>)}</tbody></table></div> : <p className="tenant-audit__empty-note">Aucune source détaillée n’est disponible.</p>}<div className="tenant-audit__source-groups"><SourceDecisionGroup title="Sources retenues" sources={content.retained} decision="retained" /><SourceDecisionGroup title="Sources écartées" sources={content.excluded} decision="excluded" /><SourceDecisionGroup title="Sources en attente" sources={content.pending} decision="pending" /></div></section>
    <ReportSection title="Relations principales" items={content.relationships} />
    <div className="tenant-audit__report-columns"><ReportSection title="Incohérences" items={content.inconsistencies} /><ReportSection title="Risques" items={content.risks} /></div>
    <ReportSection title="Recommandations Syncoria" items={content.recommendations} className="tenant-audit__report-section--recommendations" />
    <ReportSection title="Décisions à prendre" items={content.decisions} className="tenant-audit__report-section--decisions" />
    {content.integration_plan.length > 0 ? <section className="tenant-audit__report-section tenant-audit__integration-plan"><h5>Plan d’intégration</h5><ol>{content.integration_plan.map((step, index) => <li key={`step-${index}`}><span>{index + 1}</span><p>{step}</p></li>)}</ol></section> : null}
    {content.technical_appendix.length > 0 ? <details className="tenant-audit__technical-appendix"><summary>Annexe technique</summary><ul>{content.technical_appendix.map((item, index) => <li key={`technical-${index}`}>{item}</li>)}</ul></details> : null}
  </div>
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
  const [structuredReport, setStructuredReport] = useState<StructuredReportState>({ status: 'idle' })
  const [editingReportId, setEditingReportId] = useState<string | null>(null)
  const [titleDraft, setTitleDraft] = useState('')
  const [renameError, setRenameError] = useState<string | null>(null)
  const [isRenaming, setIsRenaming] = useState(false)
  const archiveRequest = useRef<AbortController | null>(null)
  const auditRequest = useRef<AbortController | null>(null)
  const renameRequest = useRef<AbortController | null>(null)
  const polling = useRef<{ controller: AbortController; timer: number | null } | null>(null)
  const reportsTenant = useRef<string | null>(null)
  const userSelectedReportId = useRef<string | null>(null)
  const lastActiveAudit = useRef<AdminProviderAuditOperation | null>(null)
  const titleWasEdited = useRef(false)
  const reportReferences = useRef(new Map<string, ReportReference>())
  const selectedProvider = useMemo(() => providers.find((provider) => provider.id === selectedProviderId) ?? null, [providers, selectedProviderId])
  const activeProviders = useMemo(() => providers.filter((provider) => provider.status === 'active'), [providers])
  const selectedReport = useMemo(() => { if (state.status !== 'loaded') return null; return state.reports.find((report) => report.id === selectedReportId) ?? state.reports[0] ?? null }, [selectedReportId, state])

  const stopPolling = useCallback(() => { const active = polling.current; if (active === null) return; active.controller.abort(); if (active.timer !== null) window.clearTimeout(active.timer); polling.current = null }, [])
  const applyAuditOperation = useCallback((operation: AdminProviderAuditOperation) => {
    if (operation.status === 'pending' || operation.status === 'running') lastActiveAudit.current = operation
    else if (operation.status === 'completed') { lastActiveAudit.current = null; if (operation.report_id) reportReferences.current.set(operation.report_id, { providerRecordId: operation.tenant_provider_record_id, correlationId: operation.correlation_id }) }
    if (!titleWasEdited.current && operation.display_title) setDisplayTitle(operation.display_title)
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

  useEffect(() => {
    const controller = new AbortController(); setProviderState('loading'); setProviders([]); setSelectedProviderId(''); setAuditOperation(null); lastActiveAudit.current = null; setAuditError(null); setIsLaunching(false); setDisplayTitle(''); titleWasEdited.current = false
    async function loadAuditState() { const result = await fetchAdminTenantProviders(apiBaseUrl, tenantId, controller.signal); if (controller.signal.aborted) return; if (result.status === 'unauthenticated') { onSessionExpired(); return } if (result.status !== 'loaded') { setProviderState('error'); return } setProviderState('loaded'); setProviders(result.providers.filter((provider) => provider.status === 'active')) }
    void loadAuditState()
    return () => { controller.abort(); auditRequest.current?.abort(); auditRequest.current = null; stopPolling() }
  }, [apiBaseUrl, onSessionExpired, stopPolling, tenantId])

  useEffect(() => {
    const controller = new AbortController(); auditRequest.current?.abort(); auditRequest.current = controller; stopPolling(); setAuditOperation(null); lastActiveAudit.current = null; setAuditError(null)
    if (selectedProvider === null || selectedProvider.provider !== 'notion') return () => controller.abort()
    titleWasEdited.current = false; setDisplayTitle(`Audit ${providerLabel(selectedProvider.provider)} — ${new Date().toISOString().slice(0, 10)}`); setTitleError(null)
    void fetchLatestAdminTenantProviderAudit(apiBaseUrl, tenantId, selectedProvider.id, controller.signal).then((latest) => { if (controller.signal.aborted) return; if (latest.status === 'unauthenticated') onSessionExpired(); else if (latest.status === 'loaded') { applyAuditOperation(latest.operation); if (latest.operation.status === 'pending' || latest.operation.status === 'running') beginPolling(selectedProvider.id, latest.operation.correlation_id) } else if (latest.status !== 'not_found') setAuditError('L’état de l’audit n’est pas disponible pour le moment.') })
    return () => { controller.abort(); if (auditRequest.current === controller) auditRequest.current = null; stopPolling() }
  }, [apiBaseUrl, applyAuditOperation, beginPolling, onSessionExpired, selectedProvider, stopPolling, tenantId])

  function auditFailureMessage(errorCode: string | null): string { if (errorCode === 'credential') return 'Vérifiez la configuration du credential Notion.'; if (errorCode === 'unsupported') return 'Cet audit n’est pas disponible pour cette connexion.'; if (errorCode === 'invalid_context') return 'La configuration de l’audit est invalide.'; return 'L’audit n’a pas pu être terminé. Vous pouvez réessayer.' }
  async function launchAudit() {
    if (selectedProvider === null || selectedProvider.provider !== 'notion' || !selectedProvider.credential_configured || isLaunching || auditOperation?.status === 'pending' || auditOperation?.status === 'running') return
    const normalizedTitle = displayTitle.trim(); if (!normalizedTitle || normalizedTitle.length > 120) { setTitleError('Saisissez un titre de 1 à 120 caractères.'); return }
    auditRequest.current?.abort(); const controller = new AbortController(); auditRequest.current = controller; setIsLaunching(true); setAuditError(null); setTitleError(null)
    const result = await launchAdminTenantProviderAudit(apiBaseUrl, tenantId, selectedProvider.id, { signal: controller.signal, displayTitle: normalizedTitle })
    if (controller.signal.aborted) return
    if (result.status === 'unauthenticated') { auditRequest.current = null; setIsLaunching(false); onSessionExpired(); return }
    if (result.status === 'conflict') { const latest = await fetchLatestAdminTenantProviderAudit(apiBaseUrl, tenantId, selectedProvider.id, controller.signal); if (controller.signal.aborted) return; auditRequest.current = null; setIsLaunching(false); if (latest.status === 'loaded') { applyAuditOperation(latest.operation); if (latest.operation.status === 'pending' || latest.operation.status === 'running') beginPolling(selectedProvider.id, latest.operation.correlation_id) } else if (latest.status === 'unauthenticated') onSessionExpired(); else setAuditError('Un audit est déjà actif, mais son état ne peut pas être récupéré.'); return }
    auditRequest.current = null; setIsLaunching(false); if (result.status !== 'loaded') { setAuditError(result.status === 'invalid' ? 'L’audit Notion est indisponible ou mal configuré.' : 'L’audit n’a pas pu être lancé. Réessayez.'); return }
    applyAuditOperation(result.operation); if (result.operation.status === 'pending' || result.operation.status === 'running') beginPolling(selectedProvider.id, result.operation.correlation_id); else if (result.operation.status === 'completed') setReloadKey((key) => key + 1)
  }

  function renderAuditLauncher() {
    const auditActive = auditOperation?.status === 'pending' || auditOperation?.status === 'running'; const disabled = providerState !== 'loaded' || selectedProvider === null || selectedProvider.provider !== 'notion' || !selectedProvider.credential_configured || isLaunching || auditActive
    return <section aria-label="Lancement de l’audit Notion" className="tenant-audit__launcher"><div className="tenant-audit__launcher-title"><div><p className="tenant-audit__eyebrow">Nouvelle restitution</p><h4>Lancer un audit</h4></div><span className="tenant-audit__launcher-note">Le provider reste séparé du titre</span></div><div className="tenant-audit__launcher-fields"><div className="tenant-audit__field"><label className="tenant-audit__provider-label" htmlFor="audit-title">Titre de l’audit</label><input aria-describedby="audit-title-help" aria-invalid={titleError !== null} id="audit-title" maxLength={120} onChange={(event) => { titleWasEdited.current = true; setDisplayTitle(event.target.value); setTitleError(null) }} value={displayTitle} /><small id="audit-title-help">Ce titre sera visible dans l’historique et le rapport.</small>{titleError ? <p role="alert">{titleError}</p> : null}</div><div className="tenant-audit__field"><label className="tenant-audit__provider-label" htmlFor="audit-provider">Connexion à auditer</label><select aria-label="Connexion à auditer" disabled={auditActive || isLaunching || providerState !== 'loaded'} id="audit-provider" onChange={(event) => setSelectedProviderId(event.target.value)} value={selectedProviderId}><option value="">Sélectionner une connexion</option>{activeProviders.map((provider) => <option key={provider.id} value={provider.id}>{providerLabel(provider.provider)} — {provider.name}{provider.provider !== 'notion' ? ' · Audit indisponible' : ''}</option>)}</select></div><button className="primary-button" disabled={disabled} onClick={() => void launchAudit()} type="button">{isLaunching ? 'Lancement…' : auditActive ? 'Audit en cours…' : 'Lancer l’audit'}</button></div>{providerState === 'loading' ? <p aria-live="polite">Recherche des connexions…</p> : null}{providerState === 'error' ? <p role="alert">La connexion Notion ne peut pas être vérifiée pour le moment.</p> : null}{providerState === 'loaded' && activeProviders.length === 0 ? <p role="status">Aucune connexion active n’est disponible pour ce tenant.</p> : null}{selectedProvider?.provider !== 'notion' && selectedProvider !== null ? <p role="status">Audit indisponible pour cette connexion.</p> : null}{selectedProvider?.provider === 'notion' && !selectedProvider.credential_configured ? <p role="status">Configurez d’abord le credential Notion pour lancer l’audit.</p> : null}{auditOperation !== null ? <div className="tenant-audit__launcher-status">{auditOperation.status === 'failed' ? <><strong>Échec de l’audit</strong><p>{auditFailureMessage(auditOperation.error_code)}</p><AuditProgress lastActiveOperation={lastActiveAudit.current} operation={auditOperation} /></> : auditOperation.status === 'completed' ? <><strong>État : Terminé</strong><AuditProgress lastActiveOperation={null} operation={auditOperation} /><dl><div><dt>Sources analysées</dt><dd>{auditOperation.sources_total}</dd></div><div><dt>Sources retenues</dt><dd>{auditOperation.sources_retained}</dd></div><div><dt>Sources écartées</dt><dd>{auditOperation.sources_excluded}</dd></div><div><dt>Décisions nécessaires</dt><dd>{auditOperation.decisions_required}</dd></div><div><dt>Enregistrements retenus</dt><dd>{auditOperation.records_retained}</dd></div></dl></> : <AuditProgress lastActiveOperation={lastActiveAudit.current} operation={auditOperation} />}</div> : null}{auditError ? <p role="alert">{auditError}</p> : null}</section>
  }

  const reportReference = useCallback((report: AdminTenantReport): ReportReference | null => {
    if (report.correlation_id && report.tenant_provider_record_id) return { providerRecordId: report.tenant_provider_record_id, correlationId: report.correlation_id }
    const known = reportReferences.current.get(report.id); if (known) return known
    if (auditOperation?.report_id === report.id) return { providerRecordId: auditOperation.tenant_provider_record_id, correlationId: auditOperation.correlation_id }
    if (report.correlation_id && selectedProvider?.provider === report.provider) return { providerRecordId: selectedProvider.id, correlationId: report.correlation_id }
    return null
  }, [auditOperation, selectedProvider])

  useEffect(() => {
    const controller = new AbortController(); if (selectedReport === null) { setStructuredReport({ status: 'idle' }); return () => controller.abort() }
    const reference = reportReference(selectedReport); if (reference === null) { setStructuredReport({ status: 'unavailable' }); return () => controller.abort() }
    setStructuredReport({ status: 'loading' }); void fetchAdminTenantProviderAuditReport(apiBaseUrl, tenantId, reference.providerRecordId, reference.correlationId, controller.signal).then((result) => { if (controller.signal.aborted) return; if (result.status === 'unauthenticated') { onSessionExpired(); return } setStructuredReport(result.status === 'loaded' ? result : result.status === 'not_found' ? { status: 'unavailable' } : { status: 'error' }) })
    return () => controller.abort()
  }, [apiBaseUrl, onSessionExpired, reportReference, selectedReport, tenantId])

  async function archiveReport(reportId: string) {
    if (archiveRequest.current && !archiveRequest.current.signal.aborted) return
    const controller = new AbortController(); archiveRequest.current = controller; setPendingId(reportId); setArchiveError(null); const result = await archiveAdminTenantReport(apiBaseUrl, tenantId, reportId, controller.signal); if (controller.signal.aborted) return; archiveRequest.current = null; setPendingId(null)
    if (result.status === 'unauthenticated') { onSessionExpired(); setState({ status: 'unauthenticated' }) } else if (result.status === 'archived') { setConfirmationId(null); setReloadKey((key) => key + 1) } else setArchiveError(result.status === 'not_found' ? 'Ce rapport ou ce client n’est plus disponible. Rechargez les rapports.' : 'Le rapport n’a pas pu être archivé. Réessayez.')
  }
  function beginRename(report: AdminTenantReport) { setEditingReportId(report.id); setTitleDraft(report.title); setRenameError(null) }
  async function saveRename(report: AdminTenantReport) {
    const normalizedTitle = titleDraft.trim(); if (!normalizedTitle || normalizedTitle.length > 120) { setRenameError('Saisissez un titre de 1 à 120 caractères.'); return }
    const reference = reportReference(report); if (reference === null) { setRenameError('Le renommage de cet ancien rapport n’est pas disponible avec sa référence actuelle.'); return }
    renameRequest.current?.abort(); const controller = new AbortController(); renameRequest.current = controller; setIsRenaming(true); setRenameError(null)
    const result = await updateAdminTenantProviderAuditTitle(apiBaseUrl, tenantId, reference.providerRecordId, reference.correlationId, normalizedTitle, controller.signal); if (controller.signal.aborted) return; renameRequest.current = null; setIsRenaming(false)
    if (result.status === 'unauthenticated') { onSessionExpired(); return }
    if (result.status !== 'loaded') { setRenameError('Le titre n’a pas pu être enregistré. Réessayez.'); return }
    const savedTitle = result.operation.display_title
    setState((previous) => previous.status !== 'loaded' ? previous : { ...previous, reports: previous.reports.map((item) => item.id === report.id ? { ...item, title: savedTitle } : item) })
    setStructuredReport((previous) => previous.status !== 'loaded' ? previous : { ...previous, report: { ...previous.report, display_title: savedTitle } })
    setAuditOperation((previous) => previous?.correlation_id === reference.correlationId ? { ...previous, display_title: savedTitle } : previous)
    setEditingReportId(null); setRenameError(null)
  }

  function renderReportHistory(reports: AdminTenantReport[]) {
    return <section aria-label="Historique des rapports d’audit" className="tenant-audit__history"><div className="tenant-audit__section-heading"><div><p className="tenant-audit__eyebrow">Historique</p><h4>Rapports d’audit</h4></div><p>{reports.length} rapport{reports.length > 1 ? 's' : ''}</p></div><ul>{reports.map((report) => { const isSelected = selectedReport?.id === report.id; const renaming = editingReportId === report.id; return <li className="tenant-audit__history-row" key={report.id}><button aria-pressed={isSelected} className={isSelected ? 'tenant-audit__history-item tenant-audit__history-item--selected' : 'tenant-audit__history-item'} onClick={() => { userSelectedReportId.current = report.id; setSelectedReportId(report.id) }} type="button"><span className="tenant-audit__history-main"><strong>{report.title}</strong><span><time dateTime={report.report_date}>{formatReportDate(report.report_date)}</time> · {providerLabel(report.provider)}</span></span><span className="tenant-audit__history-stat"><strong className={report.status === 'archived' ? 'tenant-audit__status tenant-audit__status--archived' : 'tenant-audit__status'}>{reportStatusLabel(report.status)}</strong><span>{report.sources_analyzed} sources · Décisions nécessaires : {report.decisions_required ?? '—'}</span></span><span aria-hidden="true" className="tenant-audit__history-chevron">→</span></button><button aria-label={`Renommer ${report.title}`} className="tenant-audit__rename-button" disabled={isRenaming} onClick={() => beginRename(report)} type="button">Renommer</button>{renaming ? <div className="tenant-audit__inline-rename"><label htmlFor={`rename-${report.id}`}>Nouveau titre</label><input id={`rename-${report.id}`} maxLength={120} onChange={(event) => setTitleDraft(event.target.value)} value={titleDraft} /><div className="tenant-audit__actions"><button className="secondary-button" disabled={isRenaming} onClick={() => { setEditingReportId(null); setRenameError(null) }} type="button">Annuler</button><button className="primary-button" disabled={isRenaming} onClick={() => void saveRename(report)} type="button">{isRenaming ? 'Enregistrement…' : 'Enregistrer'}</button></div>{renameError ? <p role="alert">{renameError}</p> : null}</div> : null}</li> })}</ul></section>
  }

  function renderSelectedReport(report: AdminTenantReport) {
    const isArchived = report.status === 'archived'; const fallbackMetrics = { sources_analyzed: report.sources_analyzed, sources_retained: report.sources_retained, sources_excluded: report.sources_excluded, sources_pending: 0, records_retained: report.records_retained, decisions_required: report.decisions_required }; const structured = structuredReport.status === 'loaded' && structuredReport.report.report_id === report.id ? structuredReport.report : null; const renaming = editingReportId === report.id
    return <section aria-label="Rapport sélectionné" className="tenant-audit__selected-report"><article aria-label={`${report.title} — ${formatReportDate(report.report_date)}`} className={isArchived ? 'tenant-audit__report tenant-audit__report--archived' : 'tenant-audit__report'}><div className="tenant-audit__report-heading"><div><p className="tenant-audit__eyebrow">Restitution d’audit</p><h4>{structured?.display_title ?? report.title}</h4><p className="tenant-audit__report-client">Client : <strong>{tenantLabel}</strong></p></div><div className="tenant-audit__report-meta"><p>Provider : <strong>{providerLabel(structured?.provider ?? report.provider)}</strong></p><p>Date : <time dateTime={structured?.report_date ?? report.report_date}>{formatReportDate(structured?.report_date ?? report.report_date)}</time></p><p>Statut : <strong className={isArchived ? 'tenant-audit__status tenant-audit__status--archived' : 'tenant-audit__status'}>{isArchived ? 'Archivé' : 'Terminé'}</strong></p><button className="secondary-button tenant-audit__rename-header" disabled={isRenaming} onClick={() => beginRename(report)} type="button">Renommer</button></div></div>{renaming ? <div className="tenant-audit__header-rename"><label htmlFor={`header-rename-${report.id}`}>Titre de l’audit</label><input id={`header-rename-${report.id}`} maxLength={120} onChange={(event) => setTitleDraft(event.target.value)} value={titleDraft} /><div className="tenant-audit__actions"><button className="secondary-button" disabled={isRenaming} onClick={() => { setEditingReportId(null); setRenameError(null) }} type="button">Annuler</button><button className="primary-button" disabled={isRenaming} onClick={() => void saveRename(report)} type="button">{isRenaming ? 'Enregistrement…' : 'Enregistrer'}</button></div>{renameError ? <p role="alert">{renameError}</p> : null}</div> : null}{structured ? <StructuredReportView report={structured} /> : <ReportMetricCards metrics={fallbackMetrics} />}{!structured && structuredReport.status === 'loading' ? <p className="tenant-audit__report-loading" role="status">Chargement de la restitution structurée…</p> : null}{!structured && structuredReport.status === 'unavailable' ? <p className="tenant-audit__report-note">La restitution structurée n’est pas disponible pour cet ancien audit. Le PDF reste disponible.</p> : null}{!structured && structuredReport.status === 'error' ? <p className="tenant-audit__report-note" role="alert">La restitution structurée ne peut pas être chargée pour le moment. Réessayez plus tard ou utilisez le PDF.</p> : null}<div className="tenant-audit__report-footer"><div className="tenant-audit__actions"><button className="primary-button" onClick={() => setSelectedReportId(report.id)} type="button">Voir le rapport</button><a className="secondary-button" href={buildAdminTenantReportPdfUrl(apiBaseUrl, tenantId, report.id, true)}>Télécharger PDF</a>{report.status === 'completed' ? <button className="secondary-button" disabled={pendingId !== null} onClick={() => { setConfirmationId(report.id); setArchiveError(null) }} type="button">Archiver</button> : null}</div><p className="tenant-audit__summary">{isArchived ? 'Ce rapport est conservé dans l’historique et reste consultable.' : 'L’état Terminé concerne l’audit, pas la validation métier ni l’intégration des données.'}</p></div>{confirmationId === report.id ? <div className="tenant-audit__confirmation" role="alertdialog" aria-labelledby={`archive-${report.id}-title`} aria-describedby={`archive-${report.id}-description`}><strong id={`archive-${report.id}-title`}>Archiver {report.title} du {formatReportDate(report.report_date)} ?</strong><p id={`archive-${report.id}-description`}>Le rapport sera déplacé dans « Rapports archivés ». Son PDF et ses métadonnées seront conservés.</p><div className="tenant-audit__actions"><button autoFocus className="secondary-button" disabled={pendingId !== null} onClick={() => { setConfirmationId(null); setArchiveError(null) }} type="button">Annuler</button><button className="primary-button" disabled={pendingId !== null} onClick={() => void archiveReport(report.id)} type="button">{pendingId === report.id ? 'Archivage…' : 'Confirmer l’archivage'}</button></div>{archiveError && <p role="alert">{archiveError}</p>}</div> : null}</article></section>
  }

  return <section aria-label="Audit & cartographie" className="tenant-audit"><h3>Audit & cartographie</h3>{renderAuditLauncher()}{state.status === 'loading' ? <p role="status">Chargement des rapports…</p> : state.status !== 'loaded' ? <div role="alert"><p>Les rapports ne sont pas disponibles pour le moment.</p><button className="secondary-button" onClick={() => setReloadKey((key) => key + 1)} type="button">Réessayer</button></div> : state.reports.length === 0 ? <><p>{reportsError ?? 'Aucun rapport publié pour ce client.'}</p></> : <>{reportsError ? <p role="alert">{reportsError}</p> : null}{renderReportHistory(state.reports)}{selectedReport ? renderSelectedReport(selectedReport) : null}</>}</section>
}
