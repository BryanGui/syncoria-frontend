import { useEffect, useMemo, useRef, useState } from 'react'

import {
  addAdminIntegrationDdlFromAudit,
  createAdminIntegration,
  deleteAdminIntegrationDdl,
  fetchAdminIntegration,
  fetchAdminIntegrationDdl,
  fetchAdminIntegrationDdls,
  fetchAdminIntegrationIngestions,
  fetchAdminIntegrations,
  getDdlValidationError,
  importAdminIntegrationDdl,
  MAX_DDL_BYTES,
  renameAdminIntegrationDdl,
  selectAdminIntegrationDdl,
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
import { ActionMenu, Badge, Button, Notification, TextInput } from './ui'

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
  if (result.status === 'unauthenticated') return 'Votre session a expiré.'
  if (result.status === 'not_found') return 'Cette version ou cette ressource n’existe plus.'
  if (result.status === 'conflict') return 'Cette action n’est pas disponible pour l’état actuel de la version.'
  if (result.status === 'invalid') return 'Les informations saisies ne sont pas valides.'
  return fallback
}

function sortIntegrations(integrations: AdminIntegrationSummary[]): AdminIntegrationSummary[] {
  return [...integrations].sort((a, b) => b.version_number - a.version_number || b.updated_at.localeCompare(a.updated_at))
}

function validDdlTitle(title: string): boolean {
  return title.trim().length > 0
    && title === title.trim()
    && !title.includes('\u0000')
    && new TextEncoder().encode(title).byteLength <= 120
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

function ReadOnlyDdlLibrary({
  ddls,
  ddlPreview,
  onClosePreview,
  onPreview,
}: {
  ddls: AdminIntegrationDdlMetadata[]
  ddlPreview: AdminIntegrationDdl | null
  onClosePreview: () => void
  onPreview: (ddlId: string) => void
}) {
  return (
    <section aria-labelledby="integration-ddl-title" className="versioned-integration__section">
      <div className="versioned-integration__section-heading">
        <div>
          <p className="versioned-integration__eyebrow">Modèle / DDL</p>
          <h4 id="integration-ddl-title">DDL disponibles</h4>
        </div>
      </div>
      {ddls.length === 0 ? <p className="versioned-integration__empty">Aucun DDL n’est associé à cette version.</p> : (
        <div aria-label="Bibliothèque DDL" className="versioned-integration__ddl-list">
          {ddls.map((ddl) => (
            <div className={`versioned-integration__ddl-row versioned-integration__ddl-row--readonly${ddl.is_selected ? ' versioned-integration__ddl-row--selected' : ''}`} key={ddl.id}>
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
      )}
      {ddlPreview ? <DdlPreview ddl={ddlPreview} onClose={onClosePreview} /> : null}
    </section>
  )
}

function ingestionSummary(ingestion: AdminIntegrationIngestion): string {
  return `${formatDate(ingestion.started_at)} · ${ingestion.items_received} reçus · ${ingestion.items_inserted} nouveaux · ${ingestion.items_duplicate} doublons`
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
  const [ingestionIntegrationId, setIngestionIntegrationId] = useState<string | null>(null)
  const [ingestionState, setIngestionState] = useState<LoadState>('loading')
  const [ingestionReloadKey, setIngestionReloadKey] = useState(0)
  const [auditReports, setAuditReports] = useState<AdminTenantReport[]>([])
  const [auditState, setAuditState] = useState<LoadState>('loading')
  const [auditReloadKey, setAuditReloadKey] = useState(0)
  const [notification, setNotification] = useState<NotificationState>(null)
  const [mutationPending, setMutationPending] = useState(false)
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameTitle, setRenameTitle] = useState('')
  const [renameError, setRenameError] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [fileInputKey, setFileInputKey] = useState(0)
  const initializedTenant = useRef<string | null>(null)
  const selectedIdRef = useRef<string | null>(selectedId)
  const viewRef = useRef<IntegrationView>(view)
  const fileInputRef = useRef<HTMLInputElement>(null)

  selectedIdRef.current = selectedId
  viewRef.current = view

  const activeIntegration = integrations.find((item) => item.status === 'active') ?? null
  const drafts = integrations.filter((item) => item.status === 'draft')
  const selectedSummary = selectedId === null ? null : integrations.find((item) => item.id === selectedId) ?? null
  const currentDetail = selectedId !== null && detailIntegrationId === selectedId ? detail : null
  const currentDdls = selectedId !== null && ddlIntegrationId === selectedId ? ddls : []
  const currentDdlState: LoadState = selectedId !== null && ddlIntegrationId === selectedId ? ddlState : selectedId === null ? 'loaded' : 'loading'
  const currentIngestions = selectedId !== null && ingestionIntegrationId === selectedId ? ingestions : []
  const currentIngestionState: LoadState = selectedId !== null && ingestionIntegrationId === selectedId ? ingestionState : selectedId === null ? 'loaded' : 'loading'
  const isArchivedTenant = tenantStatus !== 'active'

  function showFailure(result: AdminIntegrationFailure, fallback: string) {
    setNotification({ tone: 'error', message: failureMessage(result, fallback) })
  }

  function applyIntegration(next: AdminIntegration) {
    setDetail(next)
    setDetailIntegrationId(next.id)
    setIntegrations((current) => sortIntegrations(
      current.some((item) => item.id === next.id)
        ? current.map((item) => item.id === next.id ? next : item)
        : [next, ...current],
    ))
    setSelectedId(next.id)
  }

  function applySelectedDdl(integrationId: string, ddlId: string) {
    setDdls((current) => current.map((ddl) => ({ ...ddl, is_selected: ddl.id === ddlId })))
    setDetail((current) => current?.id === integrationId ? { ...current, selected_ddl_id: ddlId } : current)
    setIntegrations((current) => current.map((item) => item.id === integrationId ? { ...item, selected_ddl_id: ddlId } : item))
  }

  useEffect(() => {
    const controller = new AbortController()
    const tenantChanged = initializedTenant.current !== tenantId
    if (tenantChanged) {
      initializedTenant.current = tenantId
      setIntegrations([])
      setSelectedId(null)
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
      const active = sorted.find((item) => item.status === 'active') ?? null
      const draft = sorted.find((item) => item.status === 'draft') ?? null
      setIntegrations(sorted)
      if (tenantChanged) {
        setView(active ? 'active' : 'create')
        setSelectedId(active?.id ?? draft?.id ?? null)
      } else {
        setSelectedId((current) => {
          if (viewRef.current === 'active') return active?.id ?? null
          if (viewRef.current === 'create') return draft?.id ?? null
          return current && sorted.some((item) => item.id === current) ? current : sorted[0]?.id ?? null
        })
      }
      setListState('loaded')
    })
    return () => controller.abort()
  }, [apiBaseUrl, listReloadKey, onSessionExpired, tenantId])

  useEffect(() => {
    setDetail(null)
    setDetailIntegrationId(selectedId)
    if (selectedId === null) {
      setDetailState('loaded')
      return undefined
    }
    const controller = new AbortController()
    setDetailState('loading')
    void fetchAdminIntegration(apiBaseUrl, tenantId, selectedId, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      if (result.status === 'unauthenticated') {
        onSessionExpired()
        return
      }
      if (result.status !== 'loaded') {
        setDetailState('error')
        return
      }
      setDetail(result.integration)
      setDetailIntegrationId(selectedId)
      setDetailState('loaded')
    })
    return () => controller.abort()
  }, [apiBaseUrl, detailReloadKey, onSessionExpired, selectedId, tenantId])

  useEffect(() => {
    setDdls([])
    setDdlIntegrationId(selectedId)
    setDdlPreview(null)
    if (selectedId === null) {
      setDdlState('loaded')
      return undefined
    }
    const controller = new AbortController()
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
    setIngestions([])
    setIngestionIntegrationId(selectedId)
    if (selectedId === null || view === 'create') {
      setIngestionState('loaded')
      return undefined
    }
    const controller = new AbortController()
    setIngestionState('loading')
    void fetchAdminIntegrationIngestions(apiBaseUrl, tenantId, selectedId, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      if (result.status === 'unauthenticated') {
        onSessionExpired()
        return
      }
      if (result.status !== 'loaded') {
        setIngestionState('error')
        return
      }
      setIngestions(result.ingestions)
      setIngestionIntegrationId(selectedId)
      setIngestionState('loaded')
    })
    return () => controller.abort()
  }, [apiBaseUrl, ingestionReloadKey, onSessionExpired, selectedId, tenantId, view])

  useEffect(() => {
    setAuditReports([])
    if (view !== 'create' || isArchivedTenant) {
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
  }, [apiBaseUrl, auditReloadKey, isArchivedTenant, onSessionExpired, tenantId, view])

  function selectView(nextView: IntegrationView) {
    setView(nextView)
    setNotification(null)
    setRenameId(null)
    setDeleteId(null)
    if (nextView === 'active') {
      setSelectedId(activeIntegration?.id ?? null)
    } else if (nextView === 'create') {
      setSelectedId(drafts[0]?.id ?? null)
    } else {
      setSelectedId((current) => current && integrations.some((item) => item.id === current) ? current : integrations[0]?.id ?? null)
    }
  }

  async function ensureDraft(): Promise<AdminIntegrationSummary | null> {
    const draft = integrations.find((item) => item.status === 'draft') ?? null
    if (draft !== null) {
      if (selectedIdRef.current !== draft.id) setSelectedId(draft.id)
      return draft
    }
    const result = await createAdminIntegration(apiBaseUrl, tenantId)
    if (result.status === 'unauthenticated') {
      onSessionExpired()
      return null
    }
    if (result.status !== 'loaded') {
      showFailure(result, 'Le DDL ne peut pas être préparé pour le moment.')
      return null
    }
    applyIntegration(result.integration)
    setDdlIntegrationId(result.integration.id)
    setDdls([])
    setDdlState('loaded')
    return result.integration
  }

  async function selectExistingDdl(integrationId: string, ddlId: string) {
    const result = await selectAdminIntegrationDdl(apiBaseUrl, tenantId, integrationId, ddlId)
    if (result.status === 'unauthenticated') {
      onSessionExpired()
      return false
    }
    if (result.status !== 'loaded') {
      showFailure(result, 'Le DDL ne peut pas être sélectionné pour le moment.')
      return false
    }
    applySelectedDdl(integrationId, ddlId)
    return true
  }

  async function selectAuditDdl(report: AdminTenantReport) {
    if (mutationPending || currentDdlState === 'loading') return
    setMutationPending(true)
    setNotification(null)
    try {
      const draft = await ensureDraft()
      if (draft === null) return
      const knownDdls = ddlIntegrationId === draft.id ? ddls : []
      let artifact = knownDdls.find((ddl) => ddl.kind === 'source' && ddl.source_report_id === report.id) ?? null
      if (artifact === null) {
        const addResult = await addAdminIntegrationDdlFromAudit(apiBaseUrl, tenantId, draft.id, report.id)
        if (addResult.status === 'unauthenticated') {
          onSessionExpired()
          return
        }
        if (addResult.status !== 'loaded') {
          showFailure(addResult, 'Le DDL de l’audit ne peut pas être préparé.')
          return
        }
        artifact = addResult.ddl
        setDdlIntegrationId(draft.id)
        setDdls((current) => current.some((ddl) => ddl.id === artifact?.id) ? current : [...current, artifact as AdminIntegrationDdlMetadata])
      }
      if (await selectExistingDdl(draft.id, artifact.id)) {
        setNotification({ tone: 'success', message: 'DDL sélectionné.' })
      }
    } finally {
      setMutationPending(false)
    }
  }

  async function selectImportedDdl(ddlId: string) {
    if (mutationPending || selectedId === null) return
    setMutationPending(true)
    setNotification(null)
    try {
      if (await selectExistingDdl(selectedId, ddlId)) {
        setNotification({ tone: 'success', message: 'DDL sélectionné.' })
      }
    } finally {
      setMutationPending(false)
    }
  }

  async function handleUpload(file: File | undefined) {
    setFileInputKey((current) => current + 1)
    if (file === undefined || mutationPending) return
    setNotification(null)
    if (!file.name.toLowerCase().endsWith('.sql')) {
      setNotification({ tone: 'error', message: 'Le fichier doit être au format .sql.' })
      return
    }
    if (!validDdlTitle(file.name)) {
      setNotification({ tone: 'error', message: 'Le nom du fichier doit contenir au maximum 120 octets UTF-8.' })
      return
    }
    if (file.size > MAX_DDL_BYTES) {
      setNotification({ tone: 'error', message: 'Le fichier dépasse la taille maximale de 1 MiB.' })
      return
    }
    setMutationPending(true)
    try {
      const content = await file.text()
      const validation = getDdlValidationError(content)
      if (validation === 'empty') {
        setNotification({ tone: 'error', message: 'Le fichier SQL est vide.' })
        return
      }
      if (validation === 'too_large') {
        setNotification({ tone: 'error', message: 'Le fichier dépasse la taille maximale de 1 MiB.' })
        return
      }
      if (validation !== null) {
        setNotification({ tone: 'error', message: 'Le fichier SQL ne peut pas être importé.' })
        return
      }
      const draft = await ensureDraft()
      if (draft === null) return
      const result = await importAdminIntegrationDdl(apiBaseUrl, tenantId, draft.id, file.name, content)
      if (result.status === 'unauthenticated') {
        onSessionExpired()
        return
      }
      if (result.status !== 'loaded') {
        showFailure(result, 'Le DDL ne peut pas être importé.')
        return
      }
      setDdlIntegrationId(draft.id)
      setDdls((current) => [...current.filter((ddl) => ddl.id !== result.ddl.id), result.ddl])
      setNotification({ tone: 'success', message: `${file.name} a été chargé.` })
    } catch {
      setNotification({ tone: 'error', message: 'Le fichier SQL ne peut pas être importé.' })
    } finally {
      setMutationPending(false)
    }
  }

  function startRename(ddl: AdminIntegrationDdlMetadata) {
    setRenameId(ddl.id)
    setRenameTitle(ddl.title)
    setRenameError(null)
    setDeleteId(null)
  }

  async function saveRename(ddlId: string) {
    if (selectedId === null || mutationPending) return
    const normalized = renameTitle.trim()
    if (!validDdlTitle(normalized)) {
      setRenameError('Le titre est obligatoire et limité à 120 octets UTF-8.')
      return
    }
    if (currentDdls.some((ddl) => ddl.id !== ddlId && ddl.title.trim().toLocaleLowerCase('fr-FR') === normalized.toLocaleLowerCase('fr-FR'))) {
      setRenameError('Ce titre existe déjà. Choisissez un autre titre.')
      return
    }
    setMutationPending(true)
    setRenameError(null)
    try {
      const result = await renameAdminIntegrationDdl(apiBaseUrl, tenantId, selectedId, ddlId, normalized)
      if (result.status === 'unauthenticated') {
        onSessionExpired()
        return
      }
      if (result.status !== 'loaded') {
        setRenameError(failureMessage(result, 'Le DDL ne peut pas être renommé.'))
        return
      }
      setDdls((current) => current.map((ddl) => ddl.id === ddlId ? result.ddl : ddl))
      setRenameId(null)
      setNotification({ tone: 'success', message: 'DDL renommé.' })
    } finally {
      setMutationPending(false)
    }
  }

  async function confirmDelete(ddlId: string) {
    if (selectedId === null || mutationPending) return
    setMutationPending(true)
    setNotification(null)
    try {
      const integrationId = selectedId
      const result = await deleteAdminIntegrationDdl(apiBaseUrl, tenantId, integrationId, ddlId)
      if (result.status === 'unauthenticated') {
        onSessionExpired()
        return
      }
      if (result.status !== 'deleted') {
        showFailure(result, 'Le DDL ne peut pas être supprimé.')
        return
      }
      const [detailResult, ddlResult] = await Promise.all([
        fetchAdminIntegration(apiBaseUrl, tenantId, integrationId),
        fetchAdminIntegrationDdls(apiBaseUrl, tenantId, integrationId),
      ])
      if (detailResult.status === 'loaded') applyIntegration(detailResult.integration)
      if (ddlResult.status === 'loaded') {
        setDdlIntegrationId(integrationId)
        setDdls(ddlResult.ddls)
      } else {
        setDdls((current) => current.filter((ddl) => ddl.id !== ddlId))
      }
      setDeleteId(null)
      setRenameId(null)
      setNotification({ tone: 'success', message: 'DDL supprimé.' })
    } finally {
      setMutationPending(false)
    }
  }

  async function openDdlPreview(ddlId: string) {
    if (ddlPreview?.id === ddlId) {
      setDdlPreview(null)
      return
    }
    if (selectedId === null || currentDdlState !== 'loaded') return
    const requestIntegrationId = selectedId
    setNotification(null)
    const result = await fetchAdminIntegrationDdl(apiBaseUrl, tenantId, requestIntegrationId, ddlId)
    if (selectedIdRef.current !== requestIntegrationId) return
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

  function renderCreateView() {
    const defaultAudit = auditReports[0] ?? null
    const defaultAuditDdl = defaultAudit
      ? currentDdls.find((ddl) => ddl.kind === 'source' && ddl.source_report_id === defaultAudit.id) ?? null
      : null
    const importedDdls = currentDdls.filter((ddl) => ddl.kind === 'imported')
    const isLoading = auditState === 'loading' || (selectedId !== null && currentDdlState === 'loading')

    return (
      <section aria-labelledby="integration-ddl-step-title" className="versioned-integration__ddl-step">
        <div className="versioned-integration__ddl-step-heading">
          <h4 id="integration-ddl-step-title">Étape 1 — Choisir un DDL</h4>
          <Button disabled={isArchivedTenant || mutationPending} loading={mutationPending} onClick={() => fileInputRef.current?.click()} variant="primary">Charger un DDL</Button>
          <input
            accept=".sql,text/plain,application/sql"
            aria-label="Fichier DDL à charger"
            className="versioned-integration__file-input"
            disabled={isArchivedTenant || mutationPending}
            key={fileInputKey}
            onChange={(event) => void handleUpload(event.target.files?.[0])}
            ref={fileInputRef}
            type="file"
          />
        </div>
        {isArchivedTenant ? <p className="versioned-integration__empty">Ce client archivé est en lecture seule.</p> : null}
        {!isArchivedTenant && auditState === 'error' ? <StructuralError message="Impossible de charger le DDL d’audit." onRetry={() => setAuditReloadKey((current) => current + 1)} /> : null}
        {!isArchivedTenant && currentDdlState === 'error' ? <StructuralError message="Impossible de charger les DDL." onRetry={() => setDdlReloadKey((current) => current + 1)} /> : null}
        {!isArchivedTenant && isLoading ? <p className="versioned-integration__empty" role="status">Chargement des DDL…</p> : null}
        {!isArchivedTenant && !isLoading && auditState !== 'error' && currentDdlState !== 'error' ? (
          <div aria-label="DDL disponibles" className="versioned-integration__ddl-list versioned-integration__ddl-list--editable">
            {defaultAudit ? (
              <div className={`versioned-integration__ddl-row${defaultAuditDdl?.is_selected ? ' versioned-integration__ddl-row--selected' : ''}`}>
                <input aria-label={`Sélectionner DDL audit — ${defaultAudit.title}`} checked={defaultAuditDdl?.is_selected ?? false} disabled={mutationPending} name="selected-ddl" onChange={() => void selectAuditDdl(defaultAudit)} type="radio" />
                {defaultAuditDdl ? (
                  <button className="versioned-integration__ddl-title" onClick={() => void openDdlPreview(defaultAuditDdl.id)} type="button"><strong>DDL audit — {defaultAudit.title}</strong><span>Source : Audit</span></button>
                ) : <div className="versioned-integration__ddl-title"><strong>DDL audit — {defaultAudit.title}</strong><span>Source : Audit</span></div>}
                <Badge tone="neutral">Par défaut</Badge>
              </div>
            ) : null}
            {importedDdls.map((ddl) => (
              <div className={`versioned-integration__ddl-row versioned-integration__ddl-row--imported${ddl.is_selected ? ' versioned-integration__ddl-row--selected' : ''}`} key={ddl.id}>
                <input aria-label={`Sélectionner ${ddl.title}`} checked={ddl.is_selected} disabled={mutationPending} name="selected-ddl" onChange={() => void selectImportedDdl(ddl.id)} type="radio" />
                {renameId === ddl.id ? (
                  <div className="versioned-integration__rename-form">
                    <TextInput aria-label="Nouveau titre du DDL" disabled={mutationPending} onChange={(event) => setRenameTitle(event.target.value)} value={renameTitle} />
                    {renameError ? <p role="alert">{renameError}</p> : null}
                    <div><Button disabled={mutationPending} onClick={() => { setRenameId(null); setRenameError(null) }} size="compact" variant="ghost">Annuler</Button><Button loading={mutationPending} onClick={() => void saveRename(ddl.id)} size="compact" variant="secondary">Enregistrer</Button></div>
                  </div>
                ) : (
                  <button className="versioned-integration__ddl-title" onClick={() => void openDdlPreview(ddl.id)} type="button"><strong>{ddl.title}</strong><span>Source : Import manuel</span></button>
                )}
                {deleteId === ddl.id ? (
                  <div aria-label={`Confirmer la suppression de ${ddl.title}`} className="versioned-integration__delete-confirmation" role="alertdialog">
                    <span>Supprimer ce DDL ?</span>
                    <div><Button disabled={mutationPending} onClick={() => setDeleteId(null)} size="compact" variant="ghost">Annuler</Button><Button loading={mutationPending} onClick={() => void confirmDelete(ddl.id)} size="compact" variant="danger">Supprimer</Button></div>
                  </div>
                ) : renameId === ddl.id ? null : (
                  <ActionMenu ariaLabel={`Actions pour ${ddl.title}`} label="⋯">
                    <button onClick={() => startRename(ddl)} type="button">Renommer</button>
                    <button onClick={() => { setDeleteId(ddl.id); setRenameId(null); setRenameError(null) }} type="button">Supprimer</button>
                  </ActionMenu>
                )}
              </div>
            ))}
            {defaultAudit === null && importedDdls.length === 0 ? <p className="versioned-integration__ddl-empty">Aucun DDL disponible.</p> : null}
          </div>
        ) : null}
        {ddlPreview ? <DdlPreview ddl={ddlPreview} onClose={() => setDdlPreview(null)} /> : null}
      </section>
    )
  }

  function renderVersionDetails() {
    if (detailState === 'loading' || detailIntegrationId !== selectedId) return <p className="versioned-integration__empty" role="status">Chargement de la version…</p>
    if (currentDetail === null || detailState === 'error') return <StructuralError message="Impossible de charger cette version." onRetry={() => setDetailReloadKey((current) => current + 1)} />
    if (currentDdlState === 'loading' || currentIngestionState === 'loading') return <p className="versioned-integration__empty" role="status">Chargement des données de la version…</p>
    if (currentDdlState === 'error' || currentIngestionState === 'error') {
      return <StructuralError message="Impossible de charger les données de cette version." onRetry={() => { setDdlReloadKey((current) => current + 1); setIngestionReloadKey((current) => current + 1) }} />
    }
    const basedOn = currentDetail.based_on_integration_id
      ? integrations.find((item) => item.id === currentDetail.based_on_integration_id) ?? null
      : null
    return (
      <>
        <ReadOnlyVersion basedOn={basedOn} ddls={currentDdls} ingestions={currentIngestions} integration={currentDetail} />
        <ReadOnlyDdlLibrary ddls={currentDdls} ddlPreview={ddlPreview} onClosePreview={() => setDdlPreview(null)} onPreview={(ddlId) => void openDdlPreview(ddlId)} />
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
        <h3 id="tenant-versioned-integration-title">Intégration</h3>
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
          {activeIntegration ? renderVersionDetails() : <div className="versioned-integration__empty"><h4>Aucune intégration active.</h4><p>Une intégration apparaîtra ici après son activation.</p></div>}
        </div>
      ) : (
        <div className="versioned-integration__versions-layout">
          <div className="versioned-integration__version-list" aria-label="Versions d’intégration">
            {integrations.map((integration) => {
              const basedOn = integration.based_on_integration_id ? integrations.find((item) => item.id === integration.based_on_integration_id) : null
              return <button aria-current={selectedId === integration.id ? 'true' : undefined} className={selectedId === integration.id ? 'versioned-integration__version-row versioned-integration__version-row--selected' : 'versioned-integration__version-row'} key={integration.id} onClick={() => setSelectedId(integration.id)} type="button"><strong>{integration.display_name}</strong><span>v{integration.version_number} · {statusLabel(integration.status)}</span><small>{basedOn ? `Basée sur ${integrationLabel(basedOn)}` : 'Version initiale'}</small></button>
            })}
          </div>
          <div className="versioned-integration__content">
            {selectedSummary ? renderVersionDetails() : <p className="versioned-integration__empty">Sélectionnez une version.</p>}
            {!isArchivedTenant && currentDetail?.status === 'draft' && selectedSummary?.id === currentDetail.id ? <Button onClick={() => selectView('create')} variant="secondary">Reprendre dans Créer</Button> : null}
          </div>
        </div>
      )}
    </section>
  )
}
