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
import { ActionMenu, Badge, Button, FormField, Notification, SelectInput, TextareaInput, TextInput } from './ui'

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
  if (result.status === 'unauthenticated') return 'Votre session a expiré.'
  if (result.status === 'not_found') return 'Cette version ou cette ressource n’existe plus.'
  if (result.status === 'conflict') return 'Cette action n’est pas disponible pour l’état actuel de la version.'
  if (result.status === 'invalid') return 'Les informations saisies ne sont pas valides.'
  return fallback
}

function isDraft(integration: AdminIntegration | AdminIntegrationSummary | null): boolean {
  return integration?.status === 'draft'
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
  isLoading,
  onAddAudit,
  onImport,
  onPreview,
  onSelect,
  onClosePreview,
}: {
  ddls: AdminIntegrationDdlMetadata[]
  ddlPreview: AdminIntegrationDdl | null
  isDraftVersion: boolean
  isLoading: boolean
  onAddAudit: () => void
  onImport: () => void
  onPreview: (ddlId: string) => void
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
            <button onClick={onAddAudit} type="button">Ajouter depuis un audit</button>
            <button onClick={onImport} type="button">Importer un DDL</button>
          </ActionMenu>
        ) : null}
      </div>
      {isLoading ? <p className="versioned-integration__empty" role="status">Chargement des DDL…</p> : null}
      {!isLoading && ddls.length === 0 ? <p className="versioned-integration__empty">Aucun DDL n’est encore associé à cette version.</p> : null}
      {ddls.length > 0 ? (
        <div aria-label="Bibliothèque DDL" className="versioned-integration__ddl-list">
          {ddls.map((ddl) => (
            <div className={`versioned-integration__ddl-row${ddl.is_selected ? ' versioned-integration__ddl-row--selected' : ''}`} key={ddl.id}>
              {isDraftVersion ? (
                <input
                  aria-label={`Sélectionner ${ddl.title}`}
                  checked={ddl.is_selected}
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
      {ddlPreview ? <DdlPreview ddl={ddlPreview} onClose={onClosePreview} /> : null}
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
  isLoading,
  onDelete,
  onSelect,
}: {
  candidates: AdminIntegrationIngestion[]
  canEdit: boolean
  ingestions: AdminIntegrationIngestion[]
  isLoading: boolean
  onDelete: (providerRecordId: string) => void
  onSelect: (ingestion: AdminIntegrationIngestion) => void
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
      {isLoading ? <p className="versioned-integration__empty" role="status">Chargement des ingestions…</p> : null}
      {!isLoading && groups.length === 0 ? <p className="versioned-integration__empty">Aucune ingestion de référence choisie.</p> : null}
      <div className="versioned-integration__ingestion-list">
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
                    <button key={candidate.correlation_id} onClick={() => onSelect(candidate)} type="button">
                      Choisir {ingestionSummary(candidate)}
                    </button>
                  ))}
                  {selected ? <button onClick={() => onDelete(id)} type="button">Retirer la référence</button> : null}
                </ActionMenu>
              ) : null}
            </div>
          )
        })}
      </div>
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
  const [detailState, setDetailState] = useState<LoadState>('loading')
  const [ddls, setDdls] = useState<AdminIntegrationDdlMetadata[]>([])
  const [ddlState, setDdlState] = useState<LoadState>('loading')
  const [ddlPreview, setDdlPreview] = useState<AdminIntegrationDdl | null>(null)
  const [ingestions, setIngestions] = useState<AdminIntegrationIngestion[]>([])
  const [candidates, setCandidates] = useState<AdminIntegrationIngestion[]>([])
  const [ingestionState, setIngestionState] = useState<LoadState>('loading')
  const [auditReports, setAuditReports] = useState<AdminTenantReport[]>([])
  const [notification, setNotification] = useState<NotificationState>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isActivating, setIsActivating] = useState(false)
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
  const didInitialize = useRef(false)
  const detailRequest = useRef<AbortController | null>(null)

  const activeIntegration = integrations.find((item) => item.status === 'active') ?? null
  const drafts = integrations.filter((item) => item.status === 'draft')
  const selectedSummary = selectedId === null
    ? null
    : integrations.find((item) => item.id === selectedId) ?? null
  const isCurrentDraft = isDraft(detail)
  const isArchivedTenant = tenantStatus !== 'active'
  const canEdit = !isArchivedTenant && isCurrentDraft

  function showNotification(next: NotificationState) {
    setNotification(next)
    setErrorMessage(null)
  }

  function applyIntegration(next: AdminIntegration) {
    setDetail(next)
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
      const sorted = [...result.integrations].sort((a, b) => b.version_number - a.version_number || b.updated_at.localeCompare(a.updated_at))
      setIntegrations(sorted)
      if (!didInitialize.current) {
        const active = sorted.find((item) => item.status === 'active')
        const draft = sorted.find((item) => item.status === 'draft')
        setView(active ? 'active' : 'create')
        setSelectedId(active?.id ?? draft?.id ?? null)
        didInitialize.current = true
      }
      setCloneSourceId((current) => current || sorted[0]?.id || '')
      setListState('loaded')
    })
    return () => controller.abort()
  }, [apiBaseUrl, listReloadKey, onSessionExpired, tenantId])

  useEffect(() => {
    detailRequest.current?.abort()
    if (selectedId === null) {
      setDetail(null)
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
      setDisplayName(result.integration.display_name)
      setDesignNote(result.integration.design_note ?? '')
      setDetailState('loaded')
    })
    return () => controller.abort()
  }, [apiBaseUrl, onSessionExpired, selectedId, tenantId])

  useEffect(() => {
    if (selectedId === null) {
      setDdls([])
      setIngestions([])
      setCandidates([])
      return undefined
    }
    const controller = new AbortController()
    setDdlState('loading')
    setIngestionState('loading')
    void Promise.all([
      fetchAdminIntegrationDdls(apiBaseUrl, tenantId, selectedId, controller.signal),
      fetchAdminIntegrationIngestions(apiBaseUrl, tenantId, selectedId, controller.signal),
      fetchAdminIntegrationIngestionCandidates(apiBaseUrl, tenantId, selectedId, controller.signal),
    ]).then(([ddlResult, ingestionResult, candidateResult]) => {
      if (controller.signal.aborted) return
      if ([ddlResult, ingestionResult, candidateResult].some((result) => result.status === 'unauthenticated')) {
        onSessionExpired()
        return
      }
      if (ddlResult.status === 'loaded') setDdls(ddlResult.ddls)
      else setDdlState('error')
      if (ingestionResult.status === 'loaded') setIngestions(ingestionResult.ingestions)
      if (candidateResult.status === 'loaded') setCandidates(candidateResult.ingestions)
      if (ingestionResult.status !== 'loaded' || candidateResult.status !== 'loaded') setIngestionState('error')
      else setIngestionState('loaded')
      if (ddlResult.status === 'loaded') setDdlState('loaded')
    })
    return () => controller.abort()
  }, [apiBaseUrl, onSessionExpired, selectedId, tenantId])

  useEffect(() => {
    if (selectedId === null || !isCurrentDraft) {
      setAuditReports([])
      return undefined
    }
    const controller = new AbortController()
    void fetchAdminTenantReports(apiBaseUrl, tenantId, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      if (result.status === 'unauthenticated') onSessionExpired()
      else if (result.status === 'loaded') setAuditReports(result.reports.filter((report) => report.status === 'completed'))
    })
    return () => controller.abort()
  }, [apiBaseUrl, isCurrentDraft, onSessionExpired, selectedId, tenantId])

  function selectView(nextView: IntegrationView) {
    setView(nextView)
    setErrorMessage(null)
    setActivationConfirmation(false)
    if (nextView === 'active') {
      setSelectedId(activeIntegration?.id ?? null)
      return
    }
    if (nextView === 'create') {
      setSelectedId(drafts[0]?.id ?? null)
      return
    }
    setSelectedId((current) => current ?? integrations[0]?.id ?? null)
  }

  async function createEmpty() {
    setIsCreating(true)
    setErrorMessage(null)
    const result = await createAdminIntegration(apiBaseUrl, tenantId, newVersionName)
    setIsCreating(false)
    if (result.status === 'unauthenticated') {
      onSessionExpired()
      return
    }
    if (result.status !== 'loaded') {
      setErrorMessage(failureMessage(result, 'La version ne peut pas être créée pour le moment.'))
      return
    }
    setNewVersionName('')
    applyIntegration(result.integration)
    setView('create')
    showNotification({ tone: 'success', message: 'Version brouillon créée.' })
  }

  async function cloneVersion() {
    if (!cloneSourceId) return
    setIsCreating(true)
    setErrorMessage(null)
    const source = integrations.find((item) => item.id === cloneSourceId)
    const result = await cloneAdminIntegration(apiBaseUrl, tenantId, cloneSourceId)
    setIsCreating(false)
    if (result.status === 'unauthenticated') {
      onSessionExpired()
      return
    }
    if (result.status !== 'loaded') {
      setErrorMessage(failureMessage(result, 'La version ne peut pas être clonée pour le moment.'))
      return
    }
    applyIntegration(result.integration)
    setView('create')
    showNotification({ tone: 'success', message: source ? `${integrationLabel(result.integration)} basée sur ${integrationLabel(source)}.` : 'Version brouillon clonée.' })
  }

  async function saveDraft() {
    if (detail === null || !isCurrentDraft) return
    setIsSaving(true)
    setErrorMessage(null)
    const result = await patchAdminIntegration(apiBaseUrl, tenantId, detail.id, {
      display_name: displayName,
      design_note: designNote,
    })
    setIsSaving(false)
    if (result.status === 'unauthenticated') {
      onSessionExpired()
      return
    }
    if (result.status !== 'loaded') {
      setErrorMessage(failureMessage(result, 'La version ne peut pas être enregistrée pour le moment.'))
      return
    }
    applyIntegration(result.integration)
    showNotification({ tone: 'success', message: 'Version enregistrée.' })
  }

  async function activateDraft() {
    if (detail === null || !isCurrentDraft) return
    setIsActivating(true)
    setErrorMessage(null)
    const result = await activateAdminIntegration(apiBaseUrl, tenantId, detail.id)
    setIsActivating(false)
    setActivationConfirmation(false)
    if (result.status === 'unauthenticated') {
      onSessionExpired()
      return
    }
    if (result.status !== 'loaded') {
      setErrorMessage(failureMessage(result, 'La version ne peut pas être activée pour le moment.'))
      return
    }
    setView('active')
    applyIntegration(result.integration)
    setNotification({ tone: 'success', message: 'Version activée. L’ancienne version reste conservée dans l’historique.' })
  }

  async function openDdlPreview(ddlId: string) {
    if (ddlPreview?.id === ddlId) {
      setDdlPreview(null)
      return
    }
    if (selectedId === null) return
    const result = await fetchAdminIntegrationDdl(apiBaseUrl, tenantId, selectedId, ddlId)
    if (result.status === 'unauthenticated') {
      onSessionExpired()
      return
    }
    if (result.status !== 'loaded') {
      setErrorMessage(failureMessage(result, 'Le DDL ne peut pas être consulté pour le moment.'))
      return
    }
    setDdlPreview(result.ddl)
  }

  async function selectDdl(ddlId: string) {
    if (selectedId === null || !isCurrentDraft) return
    const result = await selectAdminIntegrationDdl(apiBaseUrl, tenantId, selectedId, ddlId)
    if (result.status === 'unauthenticated') {
      onSessionExpired()
      return
    }
    if (result.status !== 'loaded') {
      setErrorMessage(failureMessage(result, 'Le DDL ne peut pas être sélectionné pour le moment.'))
      return
    }
    setDdls((current) => current.map((ddl) => ({ ...ddl, is_selected: ddl.id === ddlId })))
    setDetail((current) => current ? { ...current, selected_ddl_id: ddlId } : current)
    showNotification({ tone: 'success', message: 'DDL sélectionné pour cette version.' })
  }

  async function addAuditDdl() {
    if (selectedId === null || !selectedAuditId) return
    const result = await addAdminIntegrationDdlFromAudit(apiBaseUrl, tenantId, selectedId, selectedAuditId)
    if (result.status === 'unauthenticated') {
      onSessionExpired()
      return
    }
    if (result.status !== 'loaded') {
      setErrorMessage(failureMessage(result, 'Le DDL de l’audit ne peut pas être ajouté.'))
      return
    }
    setDdls((current) => [...current, result.ddl])
    setAddAuditOpen(false)
    setSelectedAuditId('')
    showNotification({ tone: 'success', message: 'Le DDL a été ajouté à la bibliothèque.' })
  }

  async function importDdl() {
    if (selectedId === null || importFile === null || importTitle.trim() === '') {
      setImportError('Le titre du DDL est obligatoire.')
      return
    }
    const content = await importFile.text()
    const validation = getDdlValidationError(content)
    if (validation === 'empty') {
      setImportError('Le fichier SQL est vide.')
      return
    }
    if (validation === 'too_large') {
      setImportError('Le fichier dépasse la taille maximale de 1 MiB.')
      return
    }
    if (validation !== null) {
      setImportError('Le fichier SQL ne peut pas être importé.')
      return
    }
    const result = await importAdminIntegrationDdl(apiBaseUrl, tenantId, selectedId, importTitle, content)
    if (result.status === 'unauthenticated') {
      onSessionExpired()
      return
    }
    if (result.status !== 'loaded') {
      setImportError(failureMessage(result, 'Le DDL ne peut pas être importé.'))
      return
    }
    setDdls((current) => [...current, result.ddl])
    setImportOpen(false)
    setImportTitle('')
    setImportFile(null)
    setImportError(null)
    showNotification({ tone: 'success', message: 'Le DDL a été importé sans être sélectionné automatiquement.' })
  }

  async function selectIngestion(ingestion: AdminIntegrationIngestion) {
    if (selectedId === null || !isCurrentDraft) return
    const result = await selectAdminIntegrationIngestion(
      apiBaseUrl, tenantId, selectedId, ingestion.tenant_provider_record_id, ingestion.correlation_id,
    )
    if (result.status === 'unauthenticated') {
      onSessionExpired()
      return
    }
    if (result.status !== 'loaded') {
      setErrorMessage(failureMessage(result, 'Cette ingestion ne peut pas être référencée.'))
      return
    }
    setIngestions((current) => [...current.filter((item) => item.tenant_provider_record_id !== ingestion.tenant_provider_record_id), result.ingestion])
    showNotification({ tone: 'success', message: 'La référence d’ingestion a été mise à jour pour cette version.' })
  }

  async function deleteIngestion(providerRecordId: string) {
    if (selectedId === null || !isCurrentDraft) return
    const result = await deleteAdminIntegrationIngestion(apiBaseUrl, tenantId, selectedId, providerRecordId)
    if (result.status === 'unauthenticated') {
      onSessionExpired()
      return
    }
    if (result.status !== 'deleted') {
      setErrorMessage(failureMessage(result, 'La référence d’ingestion ne peut pas être retirée.'))
      return
    }
    setIngestions((current) => current.filter((item) => item.tenant_provider_record_id !== providerRecordId))
    showNotification({ tone: 'success', message: 'La référence a été retirée de la version.' })
  }

  function startImport() {
    setImportOpen(true)
    setAddAuditOpen(false)
    setImportError(null)
  }

  function handleFile(file: File | undefined) {
    setImportError(null)
    if (file === undefined) return
    if (!file.name.toLowerCase().endsWith('.sql')) {
      setImportError('Le fichier doit être au format .sql.')
      return
    }
    if (file.size > MAX_DDL_BYTES) {
      setImportError('Le fichier dépasse la taille maximale de 1 MiB.')
      return
    }
    setImportFile(file)
  }

  function renderCreateEmpty() {
    if (isArchivedTenant) {
      return (
        <section aria-labelledby="new-integration-title" className="versioned-integration__empty-create">
          <p className="versioned-integration__eyebrow">Atelier de version</p>
          <h4 id="new-integration-title">Client archivé</h4>
          <p>Les versions d’intégration sont consultables, mais aucune création ni modification n’est possible.</p>
        </section>
      )
    }
    return (
      <section aria-labelledby="new-integration-title" className="versioned-integration__empty-create">
        <p className="versioned-integration__eyebrow">Atelier de version</p>
        <h4 id="new-integration-title">Créer une version</h4>
        <p>Commencez avec une version vide ou reprenez une version existante via un clone indépendant.</p>
        <FormField htmlFor="new-version-name" label="Nom de version" hint="Laissez vide pour utiliser le nom généré par le backend.">
          <TextInput id="new-version-name" onChange={(event) => setNewVersionName(event.target.value)} value={newVersionName} />
        </FormField>
        <div className="versioned-integration__creation-actions">
          <Button loading={isCreating} onClick={() => void createEmpty()} variant="primary">Créer une version vide</Button>
        </div>
        {integrations.length > 0 ? (
          <div className="versioned-integration__clone-control">
            <FormField htmlFor="integration-clone-source" label="Créer depuis une version">
              <SelectInput id="integration-clone-source" onChange={(event) => setCloneSourceId(event.target.value)} value={cloneSourceId}>
                {integrations.map((integration) => <option key={integration.id} value={integration.id}>{integrationLabel(integration)} · {statusLabel(integration.status)}</option>)}
              </SelectInput>
            </FormField>
            <Button loading={isCreating} onClick={() => void cloneVersion()} variant="secondary">Cloner cette version</Button>
          </div>
        ) : null}
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
        <FormField htmlFor="integration-ddl-title" label="Titre">
          <TextInput id="integration-ddl-title" onChange={(event) => setImportTitle(event.target.value)} value={importTitle} />
        </FormField>
        <label className="versioned-integration__file-label" htmlFor="integration-ddl-file">Fichier .sql</label>
        <input accept=".sql,text/plain,application/sql" id="integration-ddl-file" onChange={(event) => handleFile(event.target.files?.[0])} type="file" />
        {importFile ? <span>{importFile.name}</span> : null}
        {importError ? <p className="versioned-integration__inline-error" role="alert">{importError}</p> : null}
        <div className="versioned-integration__form-actions">
          <Button onClick={() => { setImportOpen(false); setImportError(null) }} variant="ghost">Annuler</Button>
          <Button onClick={() => void importDdl()} variant="primary">Importer</Button>
        </div>
      </section>
    )
  }

  function renderAuditForm() {
    if (!addAuditOpen || !isCurrentDraft) return null
    return (
      <section aria-label="Ajouter un audit" className="versioned-integration__inline-form">
        <FormField htmlFor="integration-audit-source" label="Audit publié">
          <SelectInput id="integration-audit-source" onChange={(event) => setSelectedAuditId(event.target.value)} value={selectedAuditId}>
            <option value="">Choisir un audit</option>
            {auditReports.map((report) => <option key={report.id} value={report.id}>{report.title} · {providerLabel(report.provider)} · {formatDate(report.report_date)}</option>)}
          </SelectInput>
        </FormField>
        <div className="versioned-integration__form-actions">
          <Button onClick={() => setAddAuditOpen(false)} variant="ghost">Annuler</Button>
          <Button disabled={!selectedAuditId} onClick={() => void addAuditDdl()} variant="primary">Ajouter</Button>
        </div>
      </section>
    )
  }

  function renderDraftEditor() {
    if (detail === null || !isCurrentDraft) return renderCreateEmpty()
    const basedOn = detail.based_on_integration_id
      ? integrations.find((item) => item.id === detail.based_on_integration_id) ?? null
      : null
    return (
      <>
        <div className="versioned-integration__version-heading">
          <div>
            <p className="versioned-integration__eyebrow">Version {detail.version_number}</p>
            <h4>{detail.display_name}</h4>
            {basedOn ? <p>Basée sur {integrationLabel(basedOn)}</p> : null}
          </div>
          <Badge tone="warning">Brouillon</Badge>
        </div>
        <section aria-labelledby="draft-settings-title" className="versioned-integration__section">
          <div className="versioned-integration__section-heading"><h4 id="draft-settings-title">Paramètres de version</h4><Button loading={isSaving} onClick={() => void saveDraft()} size="compact" variant="secondary">Enregistrer</Button></div>
          <div className="versioned-integration__form-grid">
            <FormField htmlFor="integration-display-name" label="Nom de version">
              <TextInput id="integration-display-name" onChange={(event) => setDisplayName(event.target.value)} value={displayName} />
            </FormField>
            <FormField htmlFor="integration-design-note" label="Note de conception" hint="Cette note est visible avec la version et n’est pas un secret.">
              <TextareaInput id="integration-design-note" maxLength={8192} onChange={(event) => setDesignNote(event.target.value)} rows={4} value={designNote} />
            </FormField>
          </div>
        </section>
        <DdlLibrary ddls={ddls} ddlPreview={ddlPreview} isDraftVersion={canEdit} onAddAudit={() => { setAddAuditOpen(true); setImportOpen(false) }} onClosePreview={() => setDdlPreview(null)} onImport={startImport} onPreview={(ddlId) => void openDdlPreview(ddlId)} onSelect={(ddlId) => void selectDdl(ddlId)} isLoading={ddlState === 'loading'} />
        {renderAuditForm()}
        {renderImportForm()}
        <ReferenceIngestions candidates={candidates} canEdit={canEdit} ingestions={ingestions} isLoading={ingestionState === 'loading'} onDelete={(id) => void deleteIngestion(id)} onSelect={(ingestion) => void selectIngestion(ingestion)} />
        <section className="versioned-integration__activation">
          <div><h4>Activation</h4><p>La version active actuelle sera conservée comme archivée. Aucun historique ne sera supprimé.</p></div>
          {activationConfirmation ? (
            <div aria-label="Confirmation d’activation" className="versioned-integration__confirmation" role="alertdialog">
              <strong>Activer {detail.display_name} ?</strong>
              <p>Cette version draft deviendra active et l’ancienne version active sera archivée.</p>
              <div><Button onClick={() => setActivationConfirmation(false)} variant="ghost">Annuler</Button><Button loading={isActivating} onClick={() => void activateDraft()} variant="primary">Confirmer l’activation</Button></div>
            </div>
          ) : <Button disabled={isArchivedTenant} onClick={() => setActivationConfirmation(true)} variant="primary">Activer cette version</Button>}
        </section>
      </>
    )
  }

  function renderVersionDetails(readOnly = true) {
    if (detailState === 'loading') return <p className="versioned-integration__empty" role="status">Chargement de la version…</p>
    if (detail === null || detailState === 'error') return <p className="versioned-integration__empty" role="alert">La version ne peut pas être chargée.</p>
    const basedOn = detail.based_on_integration_id
      ? integrations.find((item) => item.id === detail.based_on_integration_id) ?? null
      : null
    if (!readOnly && canEdit) return renderDraftEditor()
    return (
      <>
        <ReadOnlyVersion basedOn={basedOn} ddls={ddls} ingestions={ingestions} integration={detail} />
        <DdlLibrary ddls={ddls} ddlPreview={ddlPreview} isDraftVersion={false} onAddAudit={() => undefined} onClosePreview={() => setDdlPreview(null)} onImport={() => undefined} onPreview={(ddlId) => void openDdlPreview(ddlId)} onSelect={() => undefined} isLoading={ddlState === 'loading'} />
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
      {errorMessage ? <p className="versioned-integration__error" role="alert">{errorMessage}</p> : null}
      <nav aria-label="Vues de l’intégration" className="versioned-integration__tabs">
        {(['create', 'active', 'versions'] as const).map((item) => {
          const labels = { create: 'Créer', active: 'Active', versions: 'Versions' }
          return <button aria-current={view === item ? 'page' : undefined} className={view === item ? 'versioned-integration__tab versioned-integration__tab--active' : 'versioned-integration__tab'} key={item} onClick={() => selectView(item)} type="button">{labels[item]}</button>
        })}
      </nav>
      {view === 'create' ? (
        <div className="versioned-integration__content">{renderVersionDetails(false)}</div>
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
          <div className="versioned-integration__content">{selectedSummary ? renderVersionDetails(true) : <p className="versioned-integration__empty">Sélectionnez une version.</p>}{detail?.status === 'draft' && selectedSummary?.id === detail.id ? <Button onClick={() => { setView('create'); setSelectedId(detail.id) }} variant="secondary">Reprendre dans Créer</Button> : null}</div>
        </div>
      )}
    </section>
  )
}
