import { useEffect, useMemo, useRef, useState } from 'react'

import {
  activateAdminIntegration,
  addAdminIntegrationDdlFromAudit,
  cloneAdminIntegration,
  createAdminIntegration,
  deleteAdminIntegrationIngestion,
  fetchAdminIntegration,
  fetchAdminIntegrationDdl,
  fetchAdminIntegrationDdls,
  fetchAdminIntegrationIngestionCandidates,
  fetchAdminIntegrationIngestions,
  fetchAdminIntegrations,
  getDdlValidationError,
  importAdminIntegrationDdl,
  MAX_DDL_BYTES,
  patchAdminIntegration,
  selectAdminIntegrationDdl,
  selectAdminIntegrationIngestion,
  type AdminIntegration,
  type AdminIntegrationDdl,
  type AdminIntegrationDdlMetadata,
  type AdminIntegrationFailure,
  type AdminIntegrationIngestion,
  type AdminIntegrationSummary,
  type IntegrationStatus,
} from '../api/adminIntegrations'
import {
  fetchAdminTenantReports,
  type AdminTenantReport,
} from '../api/adminTenantReports'
import { ActionMenu, Badge, Button, FormField, Notification, SelectableList, SelectInput, TextareaInput, TextInput } from './ui'

interface AdminTenantVersionedIntegrationProps {
  apiBaseUrl: string | null
  tenantId: string
  tenantLabel: string
  tenantStatus: string
  onSessionExpired: () => void
}

type IntegrationView = 'create' | 'active' | 'versions'
type LoadState = 'loading' | 'loaded' | 'error'
type NotificationState = { tone: 'success' | 'error' | 'info'; message: string } | null

function formatDate(value: string | null): string {
  if (value === null) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date indisponible'
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(date)
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date indisponible'
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function statusLabel(status: IntegrationStatus): string {
  if (status === 'active') return 'Actif'
  if (status === 'archived') return 'Archivé'
  return 'Brouillon'
}

function statusTone(status: IntegrationStatus): 'success' | 'neutral' | 'warning' {
  if (status === 'active') return 'success'
  if (status === 'archived') return 'neutral'
  return 'warning'
}

function providerLabel(provider: string): string {
  return provider.length === 0
    ? 'Provider inconnu'
    : provider === 'n8n'
      ? 'n8n'
      : provider.slice(0, 1).toUpperCase() + provider.slice(1)
}

function integrationLabel(integration: AdminIntegrationSummary | AdminIntegration): string {
  return `${integration.display_name} · v${integration.version_number}`
}

function failureMessage(result: AdminIntegrationFailure, fallback: string): string {
  if (result.code === 'duplicate_title') return 'Ce titre existe déjà. Choisissez un autre titre.'
  if (result.code === 'duplicate_content') return 'Ce DDL est déjà présent dans l’intégration.'
  if (result.code === 'duplicate_audit') return 'Cet audit est déjà associé à cette version.'
  if (result.code === 'too_large') return 'Le fichier dépasse la taille maximale de 1 MiB.'
  if (result.code === 'invalid') return 'Les informations saisies ne sont pas valides.'
  if (result.code === 'not_found') return 'Cette version ou cette ressource n’existe plus.'
  if (result.code === 'conflict') return 'Cette action n’est pas disponible pour l’état actuel de la version.'
  if (result.status === 'unauthenticated') return 'Votre session a expiré.'
  if (result.status === 'not_found') return 'Cette version ou cette ressource n’existe plus.'
  if (result.status === 'conflict') return 'Cette action n’est pas disponible pour l’état actuel de la version.'
  if (result.status === 'invalid') return 'Les informations saisies ne sont pas valides.'
  return fallback
}

function isDraft(integration: AdminIntegration | AdminIntegrationSummary | null): boolean {
  return integration?.status === 'draft'
}

function sortIntegrations(integrations: AdminIntegrationSummary[]): AdminIntegrationSummary[] {
  return [...integrations].sort((a, b) => b.version_number - a.version_number || b.updated_at.localeCompare(a.updated_at))
}

function StructuralError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="versioned-integration__empty" role="alert">
      <p>{message}</p>
      <Button onClick={onRetry} size="compact" variant="secondary">Réessayer</Button>
    </div>
  )
}

function DdlPreview({ ddl, onClose }: { ddl: AdminIntegrationDdl; onClose: () => void }) {
  const downloadUrl = useMemo(
    () => URL.createObjectURL(new Blob([ddl.ddl_content], { type: 'text/plain;charset=utf-8' })),
    [ddl.ddl_content],
  )
  useEffect(() => () => URL.revokeObjectURL(downloadUrl), [downloadUrl])
  return (
    <section aria-label={`Aperçu de ${ddl.title}`} className="versioned-integration__ddl-preview">
      <div className="versioned-integration__preview-heading">
        <strong>{ddl.title}</strong>
        <div>
          <a className="ui-button ui-button--secondary ui-button--compact" download={`${ddl.title}.sql`} href={downloadUrl}>
            Télécharger
          </a>
          <Button onClick={onClose} size="compact" variant="ghost">Fermer</Button>
        </div>
      </div>
      <pre>{ddl.ddl_content}</pre>
    </section>
  )
}

function DdlLibrary({
  ddls,
  ddlPreview,
  isDraftVersion,
  loadState,
  mutationPending,
  onAddAudit,
  onImport,
  onPreview,
  onRetry,
  onSelect,
  onClosePreview,
}: {
  ddls: AdminIntegrationDdlMetadata[]
  ddlPreview: AdminIntegrationDdl | null
  isDraftVersion: boolean
  loadState: LoadState
  mutationPending: boolean
  onAddAudit: () => void
  onImport: () => void
  onPreview: (ddlId: string) => void
  onRetry: () => void
  onSelect: (ddlId: string) => void
  onClosePreview: () => void
}) {
  return (
    <section aria-labelledby="integration-ddl-title" className="versioned-integration__section">
      <div className="versioned-integration__section-heading">
        <div>
          <p className="versioned-integration__eyebrow">Modèle / DDL</p>
          <h4 id="integration-ddl-title">DDL disponibles</h4>
        </div>
        {isDraftVersion ? (
          <ActionMenu label="Ajouter">
            <button disabled={mutationPending} onClick={onAddAudit} type="button">Ajouter depuis un audit</button>
            <button disabled={mutationPending} onClick={onImport} type="button">Importer un DDL</button>
          </ActionMenu>
        ) : null}
      </div>
      {loadState === 'loading' ? <p className="versioned-integration__empty" role="status">Chargement des DDL…</p> : null}
      {loadState === 'error' ? <StructuralError message="Impossible de charger les DDL de cette version." onRetry={onRetry} /> : null}
      {loadState === 'loaded' && ddls.length === 0 ? <p className="versioned-integration__empty">Aucun DDL n’est encore associé à cette version.</p> : null}
      {loadState === 'loaded' && ddls.length > 0 ? (
        <div aria-label="Bibliothèque DDL" className="versioned-integration__ddl-list">
          {ddls.map((ddl) => (
            <div className={`versioned-integration__ddl-row${ddl.is_selected ? ' versioned-integration__ddl-row--selected' : ''}`} key={ddl.id}>
              {isDraftVersion ? (
                <input
                  aria-label={`Sélectionner ${ddl.title}`}
                  checked={ddl.is_selected}
                  disabled={mutationPending}
                  name="selected-ddl"
                  onChange={() => onSelect(ddl.id)}
                  type="radio"
                />
              ) : <span aria-hidden="true" className="versioned-integration__ddl-radio" />}
              <button className="versioned-integration__ddl-title" onClick={() => onPreview(ddl.id)} type="button">
                <strong>{ddl.title}</strong>
                <span>
                  {ddl.kind === 'source' ? 'Source' : 'Importé'}
                  {ddl.source_provider ? ` · ${providerLabel(ddl.source_provider)}` : ''}
                  {ddl.source_audit_title ? ` · ${ddl.source_audit_title}` : ''}
                  {ddl.source_report_date ? ` · ${formatDate(ddl.source_report_date)}` : ''}
                </span>
              </button>
              {ddl.is_selected ? <Badge tone="success">Sélectionné</Badge> : <Badge tone="neutral">{ddl.kind === 'source' ? 'Source' : 'Importé'}</Badge>}
            </div>
          ))}
        </div>
      ) : null}
      {loadState === 'loaded' && ddlPreview ? <DdlPreview ddl={ddlPreview} onClose={onClosePreview} /> : null}
    </section>
  )
}

function ingestionSummary(ingestion: AdminIntegrationIngestion): string {
  return `${formatDate(ingestion.started_at)} · ${ingestion.items_received} reçus · ${ingestion.items_inserted} nouveaux · ${ingestion.items_duplicate} doublons`
}

function ReferenceIngestions({
  candidates,
  canEdit,
  ingestions,
  loadState,
  onDelete,
  onRetry,
  onSelect,
  pendingProviderIds,
}: {
  candidates: AdminIntegrationIngestion[]
  canEdit: boolean
  ingestions: AdminIntegrationIngestion[]
  loadState: LoadState
  onDelete: (providerRecordId: string) => void
  onRetry: () => void
  onSelect: (ingestion: AdminIntegrationIngestion) => void
  pendingProviderIds: ReadonlySet<string>
}) {
  const groups = useMemo(() => {
    const ids = new Set([
      ...ingestions.map((item) => item.tenant_provider_record_id),
      ...candidates.map((item) => item.tenant_provider_record_id),
    ])
    return [...ids].map((id) => ({
      id,
      selected: ingestions.find((item) => item.tenant_provider_record_id === id) ?? null,
      candidates: candidates.filter((item) => item.tenant_provider_record_id === id),
    }))
  }, [candidates, ingestions])

  return (
    <section aria-labelledby="integration-ingestions-title" className="versioned-integration__section">
      <div className="versioned-integration__section-heading">
        <div>
          <p className="versioned-integration__eyebrow">Références d’exécution</p>
          <h4 id="integration-ingestions-title">Ingestions de référence</h4>
        </div>
      </div>
      {loadState === 'loading' ? <p className="versioned-integration__empty" role="status">Chargement des ingestions…</p> : null}
      {loadState === 'error' ? <StructuralError message="Impossible de charger les ingestions de référence." onRetry={onRetry} /> : null}
      {loadState === 'loaded' && groups.length === 0 ? <p className="versioned-integration__empty">Aucune ingestion de référence choisie.</p> : null}
      {loadState === 'loaded' ? <div className="versioned-integration__ingestion-list">
        {groups.map(({ id, selected, candidates: groupCandidates }) => {
          const display = selected ?? groupCandidates[0] ?? null
          if (display === null) return null
          return (
            <div className="versioned-integration__ingestion-row" key={id}>
              <div>
                <strong>{providerLabel(display.provider)}</strong>
                <span>{selected ? ingestionSummary(selected) : 'Aucune ingestion choisie'}</span>
                {selected?.archived ? <Badge tone="neutral">Archivée</Badge> : null}
              </div>
              {canEdit ? (
                <ActionMenu ariaLabel={`Modifier ${providerLabel(display.provider)}`} label="⋯">
                  {groupCandidates.map((candidate) => (
                    <button disabled={pendingProviderIds.has(id)} key={candidate.correlation_id} onClick={() => onSelect(candidate)} type="button">
                      Choisir {ingestionSummary(candidate)}
                    </button>
                  ))}
                  {selected ? <button disabled={pendingProviderIds.has(id)} onClick={() => onDelete(id)} type="button">Retirer la référence</button> : null}
                </ActionMenu>
              ) : null}
            </div>
          )
        })}
      </div> : null}
    </section>
  )
}

function ReadOnlyVersion({
  basedOn,
  ddls,
  ingestions,
  integration,
}: {
  basedOn: AdminIntegrationSummary | null
  ddls: AdminIntegrationDdlMetadata[]
  ingestions: AdminIntegrationIngestion[]
  integration: AdminIntegration
}) {
  const selected = ddls.find((ddl) => ddl.is_selected) ?? null
  return (
    <div className="versioned-integration__readonly">
      <div className="versioned-integration__version-heading">
        <div>
          <p className="versioned-integration__eyebrow">Version {integration.version_number}</p>
          <h4>{integration.display_name}</h4>
          {basedOn ? <p>Basée sur {integrationLabel(basedOn)}</p> : null}
        </div>
        <Badge tone={statusTone(integration.status)}>{statusLabel(integration.status)}</Badge>
      </div>
      <dl className="versioned-integration__metadata">
        <div><dt>DDL sélectionné</dt><dd>{selected?.title ?? 'Aucun DDL sélectionné'}</dd></div>
        <div><dt>Créée le</dt><dd>{formatDateTime(integration.created_at)}</dd></div>
        <div><dt>Mise à jour le</dt><dd>{formatDateTime(integration.updated_at)}</dd></div>
      </dl>
      <div className="versioned-integration__readonly-list">
        <h5>Sources de DDL</h5>
        {ddls.filter((ddl) => ddl.kind === 'source').length === 0
          ? <p className="versioned-integration__empty">Aucune source d’audit associée.</p>
          : ddls.filter((ddl) => ddl.kind === 'source').map((ddl) => <p key={ddl.id}>{ddl.source_provider ? providerLabel(ddl.source_provider) : 'Source'} — {ddl.source_audit_title ?? ddl.title}</p>)}
      </div>
      <div className="versioned-integration__readonly-list">
        <h5>Ingestions de référence</h5>
        {ingestions.length === 0 ? <p className="versioned-integration__empty">Aucune ingestion de référence.</p> : ingestions.map((ingestion) => <p key={ingestion.tenant_provider_record_id}>{providerLabel(ingestion.provider)} — {ingestionSummary(ingestion)}{ingestion.archived ? ' · Archivée' : ''}</p>)}
      </div>
      <div className="versioned-integration__readonly-note">
        <h5>Note de conception</h5>
        <p>{integration.design_note?.trim() || 'Aucune note de conception.'}</p>
      </div>
    </div>
  )
}

export function AdminTenantVersionedIntegration({
  apiBaseUrl,
  tenantId,
  tenantLabel,
  tenantStatus,
  onSessionExpired,
}: AdminTenantVersionedIntegrationProps) {
  const [view, setView] = useState<IntegrationView>('create')
  const [integrations, setIntegrations] = useState<AdminIntegrationSummary[]>([])
  const [listState, setListState] = useState<LoadState>('loading')
  const [listReloadKey, setListReloadKey] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<AdminIntegration | null>(null)
  const [detailIntegrationId, setDetailIntegrationId] = useState<string | null>(null)
  const [detailState, setDetailState] = useState<LoadState>('loading')
  const [detailReloadKey, setDetailReloadKey] = useState(0)
  const [ddls, setDdls] = useState<AdminIntegrationDdlMetadata[]>([])
  const [ddlIntegrationId, setDdlIntegrationId] = useState<string | null>(null)
  const [ddlState, setDdlState] = useState<LoadState>('loading')
  const [ddlReloadKey, setDdlReloadKey] = useState(0)
  const [ddlPreview, setDdlPreview] = useState<AdminIntegrationDdl | null>(null)
  const [ingestions, setIngestions] = useState<AdminIntegrationIngestion[]>([])
  const [candidates, setCandidates] = useState<AdminIntegrationIngestion[]>([])
  const [ingestionIntegrationId, setIngestionIntegrationId] = useState<string | null>(null)
  const [ingestionState, setIngestionState] = useState<LoadState>('loading')
  const [ingestionReloadKey, setIngestionReloadKey] = useState(0)
  const [auditReports, setAuditReports] = useState<AdminTenantReport[]>([])
  const [auditState, setAuditState] = useState<LoadState>('loaded')
  const [auditReloadKey, setAuditReloadKey] = useState(0)
  const [notification, setNotification] = useState<NotificationState>(null)
  const [pendingMutations, setPendingMutations] = useState<ReadonlySet<string>>(new Set())
  const [activationConfirmation, setActivationConfirmation] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [designNote, setDesignNote] = useState('')
  const [newVersionName, setNewVersionName] = useState('')
  const [cloneSourceId, setCloneSourceId] = useState('')
  const [addAuditOpen, setAddAuditOpen] = useState(false)
  const [selectedAuditId, setSelectedAuditId] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [importTitle, setImportTitle] = useState('')
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importInputKey, setImportInputKey] = useState(0)
  const initializedTenant = useRef<string | null>(null)
  const detailRequest = useRef<AbortController | null>(null)
  const ddlRequest = useRef<AbortController | null>(null)
  const ddlPreviewRequest = useRef<AbortController | null>(null)
  const ingestionRequest = useRef<AbortController | null>(null)
  const mutationLocks = useRef(new Set<string>())
  const fileValidationSequence = useRef(0)
  const selectedIdRef = useRef<string | null>(selectedId)
  const viewRef = useRef<IntegrationView>(view)

  selectedIdRef.current = selectedId
  viewRef.current = view

  const activeIntegration = integrations.find((item) => item.status === 'active') ?? null
  const drafts = integrations.filter((item) => item.status === 'draft')
  const selectedSummary = selectedId === null
    ? null
    : integrations.find((item) => item.id === selectedId) ?? null
  const currentDetail = selectedId !== null && detailIntegrationId === selectedId ? detail : null
  const currentDdls = selectedId !== null && ddlIntegrationId === selectedId ? ddls : []
  const currentDdlState: LoadState = selectedId !== null && ddlIntegrationId === selectedId ? ddlState : 'loading'
  const currentIngestions = selectedId !== null && ingestionIntegrationId === selectedId ? ingestions : []
  const currentCandidates = selectedId !== null && ingestionIntegrationId === selectedId ? candidates : []
  const currentIngestionState: LoadState = selectedId !== null && ingestionIntegrationId === selectedId ? ingestionState : 'loading'
  const isCurrentDraft = isDraft(currentDetail)
  const isArchivedTenant = tenantStatus !== 'active'
  const canEdit = !isArchivedTenant && isCurrentDraft
  const versionCreatePending = pendingMutations.has('version-create')
  const savePending = pendingMutations.has('save-version')
  const activationPending = pendingMutations.has('activate-version')
  const draftMutationPending = savePending || activationPending
  const ddlMutationPending = pendingMutations.has('ddl-mutation')
  const pendingProviderIds = useMemo(() => new Set(
    [...pendingMutations]
      .filter((key) => key.startsWith('ingestion:'))
      .map((key) => key.slice('ingestion:'.length)),
  ), [pendingMutations])

  function showNotification(next: NotificationState) {
    setNotification(next)
  }

  function showFailure(result: AdminIntegrationFailure, fallback: string) {
    showNotification({ tone: 'error', message: failureMessage(result, fallback) })
  }

  function beginMutation(key: string): boolean {
    if (mutationLocks.current.has(key)) return false
    mutationLocks.current.add(key)
    setPendingMutations((current) => new Set(current).add(key))
    setNotification(null)
    return true
  }

  function finishMutation(key: string) {
    mutationLocks.current.delete(key)
    setPendingMutations((current) => {
      const next = new Set(current)
      next.delete(key)
      return next
    })
  }

  function beginDraftMutation(key: 'save-version' | 'activate-version'): boolean {
    if (mutationLocks.current.has('save-version') || mutationLocks.current.has('activate-version')) return false
    return beginMutation(key)
  }

  function clearImportFile() {
    fileValidationSequence.current += 1
    setImportFile(null)
    setImportInputKey((current) => current + 1)
  }

  function applyIntegration(next: AdminIntegration) {
    setDetail(next)
    setDetailIntegrationId(next.id)
    setIntegrations((current) => {
      const summary: AdminIntegrationSummary = next
      const existing = current.some((item) => item.id === next.id)
      const updated = existing ? current.map((item) => item.id === next.id ? summary : item) : [summary, ...current]
      return [...updated].sort((a, b) => b.version_number - a.version_number || b.updated_at.localeCompare(a.updated_at))
    })
    setSelectedId(next.id)
  }

  useEffect(() => {
    const controller = new AbortController()
    const tenantChanged = initializedTenant.current !== tenantId
    if (tenantChanged) {
      initializedTenant.current = tenantId
      setIntegrations([])
      setSelectedId(null)
      setCloneSourceId('')
      setView('create')
    }
    setListState('loading')
    void fetchAdminIntegrations(apiBaseUrl, tenantId, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      if (result.status === 'unauthenticated') {
        onSessionExpired()
        return
      }
      if (result.status !== 'loaded') {
        setListState('error')
        return
      }
      const sorted = sortIntegrations(result.integrations)
      setIntegrations(sorted)
      const active = sorted.find((item) => item.status === 'active')
      const draft = sorted.find((item) => item.status === 'draft')
      if (tenantChanged) {
        setView(active ? 'active' : 'create')
        setSelectedId(active?.id ?? draft?.id ?? null)
      } else {
        setSelectedId((current) => {
          if (viewRef.current === 'active') return active?.id ?? null
          if (current && sorted.some((item) => item.id === current)) return current
          if (viewRef.current === 'create') return draft?.id ?? null
          return sorted[0]?.id ?? null
        })
      }
      setCloneSourceId((current) => sorted.some((item) => item.id === current) ? current : sorted[0]?.id ?? '')
      setListState('loaded')
    })
    return () => controller.abort()
  }, [apiBaseUrl, listReloadKey, onSessionExpired, tenantId])

  useEffect(() => {
    detailRequest.current?.abort()
    setDetail(null)
    setDetailIntegrationId(selectedId)
    setDisplayName('')
    setDesignNote('')
    if (selectedId === null) {
      setDetailState('loaded')
      return undefined
    }
    const controller = new AbortController()
    detailRequest.current = controller
    setDetailState('loading')
    void fetchAdminIntegration(apiBaseUrl, tenantId, selectedId, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      if (result.status === 'unauthenticated') {
        onSessionExpired()
        return
      }
      if (result.status !== 'loaded') {
        setDetailState('error')
        setDetail(null)
        return
      }
      setDetail(result.integration)
      setDetailIntegrationId(selectedId)
      setDisplayName(result.integration.display_name)
      setDesignNote(result.integration.design_note ?? '')
      setDetailState('loaded')
    })
    return () => controller.abort()
  }, [apiBaseUrl, detailReloadKey, onSessionExpired, selectedId, tenantId])

  useEffect(() => {
    ddlRequest.current?.abort()
    ddlPreviewRequest.current?.abort()
    setDdls([])
    setDdlIntegrationId(selectedId)
    setDdlPreview(null)
    if (selectedId === null) {
      setDdlState('loaded')
      return undefined
    }
    const controller = new AbortController()
    ddlRequest.current = controller
    setDdlState('loading')
    void fetchAdminIntegrationDdls(apiBaseUrl, tenantId, selectedId, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      if (result.status === 'unauthenticated') {
        onSessionExpired()
        return
      }
      if (result.status !== 'loaded') {
        setDdlState('error')
        return
      }
      setDdls(result.ddls)
      setDdlIntegrationId(selectedId)
      setDdlState('loaded')
    })
    return () => controller.abort()
  }, [apiBaseUrl, ddlReloadKey, onSessionExpired, selectedId, tenantId])

  useEffect(() => {
    ingestionRequest.current?.abort()
    setIngestions([])
    setCandidates([])
    setIngestionIntegrationId(selectedId)
    if (selectedId === null) {
      setIngestionState('loaded')
      return undefined
    }
    const controller = new AbortController()
    ingestionRequest.current = controller
    setIngestionState('loading')
    void Promise.all([
      fetchAdminIntegrationIngestions(apiBaseUrl, tenantId, selectedId, controller.signal),
      fetchAdminIntegrationIngestionCandidates(apiBaseUrl, tenantId, selectedId, controller.signal),
    ]).then(([ingestionResult, candidateResult]) => {
      if (controller.signal.aborted) return
      if (ingestionResult.status === 'unauthenticated' || candidateResult.status === 'unauthenticated') {
        onSessionExpired()
        return
      }
      if (ingestionResult.status !== 'loaded' || candidateResult.status !== 'loaded') {
        setIngestionState('error')
        return
      }
      setIngestions(ingestionResult.ingestions)
      setCandidates(candidateResult.ingestions)
      setIngestionIntegrationId(selectedId)
      setIngestionState('loaded')
    })
    return () => controller.abort()
  }, [apiBaseUrl, ingestionReloadKey, onSessionExpired, selectedId, tenantId])

  useEffect(() => {
    setAuditReports([])
    if (selectedId === null || !canEdit) {
      setAuditState('loaded')
      return undefined
    }
    const controller = new AbortController()
    setAuditState('loading')
    void fetchAdminTenantReports(apiBaseUrl, tenantId, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      if (result.status === 'unauthenticated') {
        onSessionExpired()
        return
      }
      if (result.status !== 'loaded') {
        setAuditState('error')
        return
      }
      setAuditReports(result.reports.filter((report) => report.status === 'completed'))
      setAuditState('loaded')
    })
    return () => controller.abort()
  }, [apiBaseUrl, auditReloadKey, canEdit, onSessionExpired, selectedId, tenantId])

  useEffect(() => () => {
    detailRequest.current?.abort()
    ddlRequest.current?.abort()
    ddlPreviewRequest.current?.abort()
    ingestionRequest.current?.abort()
  }, [])

  function selectView(nextView: IntegrationView) {
    setView(nextView)
    setNotification(null)
    setActivationConfirmation(false)
    if (nextView === 'active') {
      setSelectedId(activeIntegration?.id ?? null)
      return
    }
    if (nextView === 'create') {
      setSelectedId((current) => drafts.some((item) => item.id === current) ? current : drafts[0]?.id ?? null)
      return
    }
    setSelectedId((current) => current && integrations.some((item) => item.id === current) ? current : integrations[0]?.id ?? null)
  }

  async function createEmpty() {
    if (!beginMutation('version-create')) return
    try {
      const result = await createAdminIntegration(apiBaseUrl, tenantId, newVersionName)
      if (result.status === 'unauthenticated') {
        onSessionExpired()
        return
      }
      if (result.status !== 'loaded') {
        showFailure(result, 'La version ne peut pas être créée pour le moment.')
        return
      }
      setNewVersionName('')
      applyIntegration(result.integration)
      setView('create')
      showNotification({ tone: 'success', message: 'Version brouillon créée.' })
    } finally {
      finishMutation('version-create')
    }
  }

  async function cloneVersion() {
    if (!cloneSourceId || !beginMutation('version-create')) return
    try {
      const source = integrations.find((item) => item.id === cloneSourceId)
      const result = await cloneAdminIntegration(apiBaseUrl, tenantId, cloneSourceId)
      if (result.status === 'unauthenticated') {
        onSessionExpired()
        return
      }
      if (result.status !== 'loaded') {
        showFailure(result, 'La version ne peut pas être clonée pour le moment.')
        return
      }
      applyIntegration(result.integration)
      setView('create')
      showNotification({ tone: 'success', message: source ? `${integrationLabel(result.integration)} basée sur ${integrationLabel(source)}.` : 'Version brouillon clonée.' })
    } finally {
      finishMutation('version-create')
    }
  }

  async function saveDraft() {
    if (currentDetail === null || !canEdit || !beginDraftMutation('save-version')) return
    try {
      const result = await patchAdminIntegration(apiBaseUrl, tenantId, currentDetail.id, {
        display_name: displayName,
        design_note: designNote,
      })
      if (result.status === 'unauthenticated') {
        onSessionExpired()
        return
      }
      if (result.status !== 'loaded') {
        showFailure(result, 'La version ne peut pas être enregistrée pour le moment.')
        return
      }
      applyIntegration(result.integration)
      showNotification({ tone: 'success', message: 'Version enregistrée.' })
    } finally {
      finishMutation('save-version')
    }
  }

  async function activateDraft() {
    if (currentDetail === null || !canEdit || !beginDraftMutation('activate-version')) return
    try {
      const result = await activateAdminIntegration(apiBaseUrl, tenantId, currentDetail.id)
      setActivationConfirmation(false)
      if (result.status === 'unauthenticated') {
        onSessionExpired()
        return
      }
      if (result.status !== 'loaded') {
        showFailure(result, 'La version ne peut pas être activée pour le moment.')
        return
      }
      const canonical = await fetchAdminIntegrations(apiBaseUrl, tenantId)
      if (canonical.status === 'unauthenticated') {
        onSessionExpired()
        return
      }
      if (canonical.status !== 'loaded') {
        setListState('error')
        return
      }
      const sorted = sortIntegrations(canonical.integrations)
      const active = sorted.find((item) => item.status === 'active') ?? null
      setIntegrations(sorted)
      setListState('loaded')
      setView('active')
      setSelectedId(active?.id ?? result.integration.id)
      setDetailIntegrationId(null)
      setDdlIntegrationId(null)
      setIngestionIntegrationId(null)
      setDdlPreview(null)
      setDetailReloadKey((current) => current + 1)
      setDdlReloadKey((current) => current + 1)
      setIngestionReloadKey((current) => current + 1)
      showNotification({ tone: 'success', message: 'Version activée. L’ancienne version reste conservée dans l’historique.' })
    } finally {
      finishMutation('activate-version')
    }
  }

  async function openDdlPreview(ddlId: string) {
    if (ddlPreview?.id === ddlId) {
      ddlPreviewRequest.current?.abort()
      setDdlPreview(null)
      return
    }
    if (selectedId === null || currentDdlState !== 'loaded') return
    ddlPreviewRequest.current?.abort()
    const requestIntegrationId = selectedId
    const controller = new AbortController()
    ddlPreviewRequest.current = controller
    setNotification(null)
    const result = await fetchAdminIntegrationDdl(apiBaseUrl, tenantId, requestIntegrationId, ddlId, controller.signal)
    if (controller.signal.aborted || selectedIdRef.current !== requestIntegrationId) return
    if (result.status === 'unauthenticated') {
      onSessionExpired()
      return
    }
    if (result.status !== 'loaded') {
      showFailure(result, 'Le DDL ne peut pas être consulté pour le moment.')
      return
    }
    setDdlPreview(result.ddl)
  }

  async function selectDdl(ddlId: string) {
    if (selectedId === null || !canEdit || !beginMutation('ddl-mutation')) return
    const integrationId = selectedId
    try {
      const result = await selectAdminIntegrationDdl(apiBaseUrl, tenantId, integrationId, ddlId)
      if (result.status === 'unauthenticated') {
        onSessionExpired()
        return
      }
      if (result.status !== 'loaded') {
        showFailure(result, 'Le DDL ne peut pas être sélectionné pour le moment.')
        return
      }
      setDetailReloadKey((current) => current + 1)
      setDdlReloadKey((current) => current + 1)
      showNotification({ tone: 'success', message: 'DDL sélectionné pour cette version.' })
    } finally {
      finishMutation('ddl-mutation')
    }
  }

  async function addAuditDdl() {
    if (selectedId === null || !selectedAuditId || !canEdit || !beginMutation('ddl-mutation')) return
    const integrationId = selectedId
    try {
      const result = await addAdminIntegrationDdlFromAudit(apiBaseUrl, tenantId, integrationId, selectedAuditId)
      if (result.status === 'unauthenticated') {
        onSessionExpired()
        return
      }
      if (result.status !== 'loaded') {
        showFailure(result, 'Le DDL de l’audit ne peut pas être ajouté.')
        return
      }
      setAddAuditOpen(false)
      setSelectedAuditId('')
      setDdlReloadKey((current) => current + 1)
      showNotification({ tone: 'success', message: 'Le DDL a été ajouté à la bibliothèque sans être sélectionné.' })
    } finally {
      finishMutation('ddl-mutation')
    }
  }

  async function importDdl() {
    if (selectedId === null || !canEdit) return
    if (importTitle.trim() === '') {
      setImportError('Le titre du DDL est obligatoire.')
      return
    }
    if (importFile === null) {
      setImportError('Sélectionnez un fichier SQL valide.')
      return
    }
    if (!beginMutation('ddl-mutation')) return
    const integrationId = selectedId
    try {
      const content = await importFile.text()
      const validation = getDdlValidationError(content)
      if (validation === 'empty') {
        clearImportFile()
        setImportError('Le fichier SQL est vide.')
        return
      }
      if (validation === 'too_large') {
        clearImportFile()
        setImportError('Le fichier dépasse la taille maximale de 1 MiB.')
        return
      }
      if (validation !== null) {
        clearImportFile()
        setImportError('Le fichier SQL ne peut pas être importé.')
        return
      }
      const result = await importAdminIntegrationDdl(apiBaseUrl, tenantId, integrationId, importTitle, content)
      if (result.status === 'unauthenticated') {
        onSessionExpired()
        return
      }
      if (result.status !== 'loaded') {
        if (result.code === 'duplicate_content' || result.code === 'too_large' || result.code === 'invalid') clearImportFile()
        setImportError(failureMessage(result, 'Le DDL ne peut pas être importé.'))
        return
      }
      setImportOpen(false)
      setImportTitle('')
      clearImportFile()
      setImportError(null)
      setDdlReloadKey((current) => current + 1)
      showNotification({ tone: 'success', message: 'Le DDL a été importé sans être sélectionné automatiquement.' })
    } catch {
      clearImportFile()
      setImportError('Le fichier SQL ne peut pas être importé.')
    } finally {
      finishMutation('ddl-mutation')
    }
  }

  async function selectIngestion(ingestion: AdminIntegrationIngestion) {
    if (selectedId === null || !canEdit) return
    const mutationKey = `ingestion:${ingestion.tenant_provider_record_id}`
    if (!beginMutation(mutationKey)) return
    const integrationId = selectedId
    try {
      const result = await selectAdminIntegrationIngestion(
        apiBaseUrl, tenantId, integrationId, ingestion.tenant_provider_record_id, ingestion.correlation_id,
      )
      if (result.status === 'unauthenticated') {
        onSessionExpired()
        return
      }
      if (result.status !== 'loaded') {
        showFailure(result, 'Cette ingestion ne peut pas être référencée.')
        return
      }
      setIngestionReloadKey((current) => current + 1)
      showNotification({ tone: 'success', message: 'La référence d’ingestion a été mise à jour pour cette version.' })
    } finally {
      finishMutation(mutationKey)
    }
  }

  async function deleteIngestion(providerRecordId: string) {
    if (selectedId === null || !canEdit) return
    const mutationKey = `ingestion:${providerRecordId}`
    if (!beginMutation(mutationKey)) return
    const integrationId = selectedId
    try {
      const result = await deleteAdminIntegrationIngestion(apiBaseUrl, tenantId, integrationId, providerRecordId)
      if (result.status === 'unauthenticated') {
        onSessionExpired()
        return
      }
      if (result.status !== 'deleted') {
        showFailure(result, 'La référence d’ingestion ne peut pas être retirée.')
        return
      }
      setIngestionReloadKey((current) => current + 1)
      showNotification({ tone: 'success', message: 'La référence a été retirée de la version.' })
    } finally {
      finishMutation(mutationKey)
    }
  }

  function startImport() {
    if (ddlMutationPending) return
    setImportOpen(true)
    setAddAuditOpen(false)
    setImportError(null)
  }

  async function handleFile(file: File | undefined) {
    const sequence = fileValidationSequence.current + 1
    fileValidationSequence.current = sequence
    setImportFile(null)
    setImportError(null)
    if (file === undefined) {
      setImportInputKey((current) => current + 1)
      return
    }
    if (!file.name.toLowerCase().endsWith('.sql')) {
      setImportInputKey((current) => current + 1)
      setImportError('Le fichier doit être au format .sql.')
      return
    }
    if (file.size > MAX_DDL_BYTES) {
      setImportInputKey((current) => current + 1)
      setImportError('Le fichier dépasse la taille maximale de 1 MiB.')
      return
    }
    try {
      const validation = getDdlValidationError(await file.text())
      if (fileValidationSequence.current !== sequence) return
      if (validation === 'empty') {
        setImportInputKey((current) => current + 1)
        setImportError('Le fichier SQL est vide.')
        return
      }
      if (validation === 'too_large') {
        setImportInputKey((current) => current + 1)
        setImportError('Le fichier dépasse la taille maximale de 1 MiB.')
        return
      }
      if (validation !== null) {
        setImportInputKey((current) => current + 1)
        setImportError('Le fichier SQL ne peut pas être importé.')
        return
      }
      setImportFile(file)
    } catch {
      if (fileValidationSequence.current !== sequence) return
      setImportInputKey((current) => current + 1)
      setImportError('Le fichier SQL ne peut pas être importé.')
    }
  }

  function renderCreateControls() {
    const selectedDraftId = selectedSummary?.status === 'draft' ? selectedSummary.id : undefined
    return (
      <section aria-labelledby="integration-create-title" className="versioned-integration__create-manager">
        <div className="versioned-integration__section-heading">
          <div>
            <p className="versioned-integration__eyebrow">Atelier de version</p>
            <h4 id="integration-create-title">Créer ou reprendre</h4>
          </div>
        </div>
        <div className="versioned-integration__draft-picker">
          <h5>Brouillons existants</h5>
          {drafts.length > 0 ? (
            <SelectableList
              ariaLabel="Brouillons existants"
              name="integration-draft"
              onChange={(value, checked) => { if (checked) setSelectedId(value) }}
              options={drafts.map((draft) => {
                const basedOn = draft.based_on_integration_id
                  ? integrations.find((item) => item.id === draft.based_on_integration_id) ?? null
                  : null
                return {
                  value: draft.id,
                  title: integrationLabel(draft),
                  description: basedOn ? `Basée sur ${integrationLabel(basedOn)}` : 'Version initiale',
                  status: <Badge tone="warning">Brouillon</Badge>,
                }
              })}
              selectedValue={selectedDraftId}
            />
          ) : <p className="versioned-integration__compact-note">Aucun brouillon en cours.</p>}
        </div>
        <div className="versioned-integration__creation-grid">
          <div className="versioned-integration__creation-option">
            <FormField htmlFor="new-version-name" label="Nouvelle version vide" hint="Nom facultatif : le backend peut générer le nom.">
              <TextInput disabled={versionCreatePending} id="new-version-name" onChange={(event) => setNewVersionName(event.target.value)} value={newVersionName} />
            </FormField>
            <Button loading={versionCreatePending} onClick={() => void createEmpty()} variant="primary">Créer une version vide</Button>
          </div>
          {integrations.length > 0 ? <div className="versioned-integration__creation-option">
            <FormField htmlFor="integration-clone-source" label="Créer depuis une version">
              <SelectInput disabled={versionCreatePending} id="integration-clone-source" onChange={(event) => setCloneSourceId(event.target.value)} value={cloneSourceId}>
                {integrations.map((integration) => <option key={integration.id} value={integration.id}>{integrationLabel(integration)} · {statusLabel(integration.status)}</option>)}
              </SelectInput>
            </FormField>
            <Button disabled={versionCreatePending} onClick={() => void cloneVersion()} variant="secondary">Cloner cette version</Button>
          </div> : null}
        </div>
      </section>
    )
  }

  function renderImportForm() {
    if (!importOpen || !isCurrentDraft) return null
    return (
      <section aria-label="Importer un DDL" className="versioned-integration__inline-form">
        <div>
          <h5>Importer un DDL</h5>
          <p>Fichier `.sql` non vide, 1 MiB maximum.</p>
        </div>
        <FormField htmlFor="integration-ddl-import-title" label="Titre">
          <TextInput id="integration-ddl-import-title" onChange={(event) => setImportTitle(event.target.value)} value={importTitle} />
        </FormField>
        <label className="versioned-integration__file-label" htmlFor="integration-ddl-file">Fichier .sql</label>
        <input accept=".sql,text/plain,application/sql" disabled={ddlMutationPending} id="integration-ddl-file" key={importInputKey} onChange={(event) => void handleFile(event.target.files?.[0])} type="file" />
        {importFile ? <span>{importFile.name}</span> : null}
        {importError ? <p className="versioned-integration__inline-error" role="alert">{importError}</p> : null}
        <div className="versioned-integration__form-actions">
          <Button disabled={ddlMutationPending} onClick={() => { setImportOpen(false); setImportError(null); clearImportFile() }} variant="ghost">Annuler</Button>
          <Button loading={ddlMutationPending} onClick={() => void importDdl()} variant="primary">Importer</Button>
        </div>
      </section>
    )
  }

  function renderAuditForm() {
    if (!addAuditOpen || !isCurrentDraft) return null
    return (
      <section aria-label="Ajouter un audit" className="versioned-integration__inline-form">
        {auditState === 'loading' ? <p role="status">Chargement des audits…</p> : null}
        {auditState === 'error' ? <StructuralError message="Impossible de charger les audits disponibles." onRetry={() => setAuditReloadKey((current) => current + 1)} /> : null}
        {auditState === 'loaded' ? <>
          <FormField htmlFor="integration-audit-source" label="Audit publié">
            <SelectInput disabled={ddlMutationPending} id="integration-audit-source" onChange={(event) => setSelectedAuditId(event.target.value)} value={selectedAuditId}>
              <option value="">Choisir un audit</option>
              {auditReports.map((report) => <option key={report.id} value={report.id}>{report.title} · {providerLabel(report.provider)} · {formatDate(report.report_date)}</option>)}
            </SelectInput>
          </FormField>
          {auditReports.length === 0 ? <p>Aucun audit publié n’est disponible.</p> : null}
          <div className="versioned-integration__form-actions">
            <Button disabled={ddlMutationPending} onClick={() => setAddAuditOpen(false)} variant="ghost">Annuler</Button>
            <Button disabled={!selectedAuditId} loading={ddlMutationPending} onClick={() => void addAuditDdl()} variant="primary">Ajouter</Button>
          </div>
        </> : null}
      </section>
    )
  }

  function renderDraftEditor() {
    if (currentDetail === null || !isCurrentDraft) return null
    const basedOn = currentDetail.based_on_integration_id
      ? integrations.find((item) => item.id === currentDetail.based_on_integration_id) ?? null
      : null
    return (
      <>
        <div className="versioned-integration__version-heading">
          <div>
            <p className="versioned-integration__eyebrow">Version {currentDetail.version_number}</p>
            <h4>{currentDetail.display_name}</h4>
            {basedOn ? <p>Basée sur {integrationLabel(basedOn)}</p> : null}
          </div>
          <Badge tone="warning">Brouillon</Badge>
        </div>
        <section aria-labelledby="draft-settings-title" className="versioned-integration__section">
          <div className="versioned-integration__section-heading"><h4 id="draft-settings-title">Paramètres de version</h4><Button disabled={draftMutationPending} loading={savePending} onClick={() => void saveDraft()} size="compact" variant="secondary">Enregistrer</Button></div>
          <div className="versioned-integration__form-grid">
            <FormField htmlFor="integration-display-name" label="Nom de version">
              <TextInput disabled={draftMutationPending} id="integration-display-name" onChange={(event) => setDisplayName(event.target.value)} value={displayName} />
            </FormField>
            <FormField htmlFor="integration-design-note" label="Note de conception" hint="Cette note est visible avec la version et n’est pas un secret.">
              <TextareaInput disabled={draftMutationPending} id="integration-design-note" maxLength={8192} onChange={(event) => setDesignNote(event.target.value)} rows={4} value={designNote} />
            </FormField>
          </div>
        </section>
        <DdlLibrary ddls={currentDdls} ddlPreview={currentDdlState === 'loaded' ? ddlPreview : null} isDraftVersion={canEdit} loadState={currentDdlState} mutationPending={ddlMutationPending} onAddAudit={() => { setAddAuditOpen(true); setImportOpen(false) }} onClosePreview={() => setDdlPreview(null)} onImport={startImport} onPreview={(ddlId) => void openDdlPreview(ddlId)} onRetry={() => setDdlReloadKey((current) => current + 1)} onSelect={(ddlId) => void selectDdl(ddlId)} />
        {renderAuditForm()}
        {renderImportForm()}
        <ReferenceIngestions candidates={currentCandidates} canEdit={canEdit} ingestions={currentIngestions} loadState={currentIngestionState} onDelete={(id) => void deleteIngestion(id)} onRetry={() => setIngestionReloadKey((current) => current + 1)} onSelect={(ingestion) => void selectIngestion(ingestion)} pendingProviderIds={pendingProviderIds} />
        <section className="versioned-integration__activation">
          <div><h4>Activation</h4><p>La version active actuelle sera conservée comme archivée. Aucun historique ne sera supprimé.</p></div>
          {activationConfirmation ? (
            <div aria-label="Confirmation d’activation" className="versioned-integration__confirmation" role="alertdialog">
              <strong>Activer {currentDetail.display_name} ?</strong>
              <p>Cette version draft deviendra active et l’ancienne version active sera archivée.</p>
              <div><Button disabled={activationPending} onClick={() => setActivationConfirmation(false)} variant="ghost">Annuler</Button><Button loading={activationPending} onClick={() => void activateDraft()} variant="primary">Confirmer l’activation</Button></div>
            </div>
          ) : <Button disabled={isArchivedTenant || draftMutationPending} onClick={() => setActivationConfirmation(true)} variant="primary">Activer cette version</Button>}
        </section>
      </>
    )
  }

  function renderCreateView() {
    if (isArchivedTenant) {
      return (
        <section aria-labelledby="archived-integration-title" className="versioned-integration__empty-create">
          <p className="versioned-integration__eyebrow">Atelier de version</p>
          <h4 id="archived-integration-title">Client archivé</h4>
          <p>Les versions restent consultables dans Active et Versions, mais aucune création ni modification n’est disponible.</p>
        </section>
      )
    }
    const hasSelectedDraft = selectedSummary?.status === 'draft'
    return (
      <>
        {renderCreateControls()}
        {hasSelectedDraft
          ? renderVersionDetails(false)
          : <p className="versioned-integration__compact-note">Créez une version ou choisissez un brouillon existant pour reprendre sa préparation.</p>}
      </>
    )
  }

  function renderVersionDetails(readOnly = true) {
    if (detailState === 'loading' || detailIntegrationId !== selectedId) return <p className="versioned-integration__empty" role="status">Chargement de la version…</p>
    if (currentDetail === null || detailState === 'error') return <StructuralError message="Impossible de charger cette version." onRetry={() => setDetailReloadKey((current) => current + 1)} />
    const basedOn = currentDetail.based_on_integration_id
      ? integrations.find((item) => item.id === currentDetail.based_on_integration_id) ?? null
      : null
    if (!readOnly && canEdit) return renderDraftEditor()
    if (currentDdlState === 'loading' || currentIngestionState === 'loading') return <p className="versioned-integration__empty" role="status">Chargement des données de la version…</p>
    if (currentDdlState === 'error' || currentIngestionState === 'error') {
      return <StructuralError message="Impossible de charger les données de cette version." onRetry={() => { setDdlReloadKey((current) => current + 1); setIngestionReloadKey((current) => current + 1) }} />
    }
    return (
      <>
        <ReadOnlyVersion basedOn={basedOn} ddls={currentDdls} ingestions={currentIngestions} integration={currentDetail} />
        <DdlLibrary ddls={currentDdls} ddlPreview={ddlPreview} isDraftVersion={false} loadState="loaded" mutationPending={false} onAddAudit={() => undefined} onClosePreview={() => setDdlPreview(null)} onImport={() => undefined} onPreview={(ddlId) => void openDdlPreview(ddlId)} onRetry={() => setDdlReloadKey((current) => current + 1)} onSelect={() => undefined} />
      </>
    )
  }

  if (listState === 'loading') {
    return <section aria-labelledby="tenant-versioned-integration-title" className="versioned-integration"><h3 id="tenant-versioned-integration-title">Intégration</h3><p className="versioned-integration__empty" role="status">Chargement des versions…</p></section>
  }

  if (listState === 'error') {
    return <section aria-labelledby="tenant-versioned-integration-title" className="versioned-integration"><h3 id="tenant-versioned-integration-title">Intégration</h3><div className="versioned-integration__empty" role="alert"><p>Les versions d’intégration ne peuvent pas être chargées.</p><Button onClick={() => setListReloadKey((key) => key + 1)} variant="secondary">Réessayer</Button></div></section>
  }

  return (
    <section aria-labelledby="tenant-versioned-integration-title" className="versioned-integration">
      <div className="versioned-integration__heading">
        <div><p className="versioned-integration__eyebrow">Modèle versionné</p><h3 id="tenant-versioned-integration-title">Intégration</h3><p>Construisez une version reproductible à partir des DDL et ingestions réellement disponibles.</p></div>
        <span className="versioned-integration__tenant">{tenantLabel}</span>
      </div>
      {notification ? <Notification onDismiss={() => setNotification(null)} tone={notification.tone}>{notification.message}</Notification> : null}
      <nav aria-label="Vues de l’intégration" className="versioned-integration__tabs">
        {(['create', 'active', 'versions'] as const).map((item) => {
          const labels = { create: 'Créer', active: 'Active', versions: 'Versions' }
          return <button aria-current={view === item ? 'page' : undefined} className={view === item ? 'versioned-integration__tab versioned-integration__tab--active' : 'versioned-integration__tab'} key={item} onClick={() => selectView(item)} type="button">{labels[item]}</button>
        })}
      </nav>
      {view === 'create' ? (
        <div className="versioned-integration__content">{renderCreateView()}</div>
      ) : view === 'active' ? (
        <div className="versioned-integration__content">
          {activeIntegration ? renderVersionDetails(true) : <div className="versioned-integration__empty"><h4>Aucune version active</h4><p>Créez puis activez une version depuis l’atelier Créer.</p></div>}
        </div>
      ) : (
        <div className="versioned-integration__versions-layout">
          <div className="versioned-integration__version-list" aria-label="Versions d’intégration">
            {integrations.map((integration) => {
              const basedOn = integration.based_on_integration_id ? integrations.find((item) => item.id === integration.based_on_integration_id) : null
              return <button aria-current={selectedId === integration.id ? 'true' : undefined} className={selectedId === integration.id ? 'versioned-integration__version-row versioned-integration__version-row--selected' : 'versioned-integration__version-row'} key={integration.id} onClick={() => setSelectedId(integration.id)} type="button"><strong>{integration.display_name}</strong><span>v{integration.version_number} · {statusLabel(integration.status)}</span><small>{basedOn ? `Basée sur ${integrationLabel(basedOn)}` : 'Version initiale'}</small></button>
            })}
          </div>
          <div className="versioned-integration__content">{selectedSummary ? renderVersionDetails(true) : <p className="versioned-integration__empty">Sélectionnez une version.</p>}{!isArchivedTenant && currentDetail?.status === 'draft' && selectedSummary?.id === currentDetail.id ? <Button onClick={() => { setView('create'); setSelectedId(currentDetail.id) }} variant="secondary">Reprendre dans Créer</Button> : null}</div>
        </div>
      )}
    </section>
  )
}
