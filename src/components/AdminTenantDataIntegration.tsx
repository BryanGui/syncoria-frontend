import { useCallback, useEffect, useRef, useState } from 'react'

import {
  createAdminIntegrationWorkspaceFromAudit,
  createAdminIntegrationWorkspaceFromUpload,
  fetchAdminIntegrationWorkspace,
  fetchAdminIntegrationWorkspaceAuditSources,
  fetchAdminIntegrationWorkspaces,
  getDdlValidationError,
  MAX_DDL_BYTES,
  replaceAdminIntegrationWorkspaceWorkingDdl,
  type AdminIntegrationWorkspace,
  type AdminIntegrationWorkspaceAuditSource,
  type AdminIntegrationWorkspaceResult,
  type AdminIntegrationWorkspaceSummary,
} from '../api/adminIntegrationWorkspaces'

interface AdminTenantDataIntegrationProps {
  apiBaseUrl: string | null
  tenantId: string
  tenantLabel: string
  tenantStatus: string
  onSessionExpired: () => void
}

type DetailState =
  | { status: 'idle' }
  | { status: 'loading'; workspaceId: string }
  | { status: 'loaded'; workspace: AdminIntegrationWorkspace }
  | { status: 'not_found' | 'error'; workspaceId: string }

type PendingDdlFile = { content: string; fileName: string }

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date indisponible'
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} octets`
  return `${(value / 1024).toFixed(0)} Ko`
}

function workspaceLabel(workspace: AdminIntegrationWorkspaceSummary): string {
  if (workspace.source_type === 'audit') {
    return `Audit ${workspace.source_report_id ?? 'sans référence'}`
  }
  return workspace.source_filename ?? 'Fichier SQL importé'
}

function artifactFilenamePart(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'workspace'
}

function downloadDdl(content: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function errorMessage(result: Exclude<AdminIntegrationWorkspaceResult, { status: 'loaded' }>): string {
  if (result.status === 'not_found') return 'Ce workspace n’existe plus ou n’est pas disponible.'
  if (result.status === 'conflict') return 'Le workspace a changé. Rechargez-le avant de réessayer.'
  if (result.status === 'invalid') return 'Le fichier SQL est vide, invalide ou dépasse 1 MiB.'
  return 'Cette opération est temporairement indisponible.'
}

function validationMessage(error: ReturnType<typeof getDdlValidationError>): string {
  if (error === 'empty') return 'Le fichier SQL est vide.'
  if (error === 'too_large') return 'Le fichier SQL dépasse la limite de 1 MiB.'
  return 'Le contenu SQL ne peut pas être importé.'
}

function handleAuthentication(
  result: { status: string },
  onSessionExpired: () => void,
): boolean {
  if (result.status !== 'unauthenticated') return false
  onSessionExpired()
  return true
}

function FilePicker({
  disabled,
  label,
  onFile,
}: {
  disabled: boolean
  label: string
  onFile: (file: File | undefined) => void
}) {
  return (
    <label className="tenant-data-integration__file-picker">
      <span>{label}</span>
      <input
        accept=".sql,text/plain,application/sql"
        disabled={disabled}
        onChange={(event) => {
          onFile(event.currentTarget.files?.[0])
          event.currentTarget.value = ''
        }}
        type="file"
      />
    </label>
  )
}

function WorkspaceDdlBlock({
  content,
  fileName,
  kind,
  label,
  note,
  onDownload,
}: {
  content: string
  fileName: string
  kind: 'source' | 'target'
  label: string
  note: string
  onDownload: () => void
}) {
  return (
    <article className={`tenant-data-integration__ddl-block tenant-data-integration__ddl-block--${kind}`}>
      <div className="tenant-data-integration__ddl-heading">
        <div>
          <p className="tenant-data-integration__eyebrow">{kind === 'source' ? 'Point de départ' : 'Résultat attendu'}</p>
          <h4>{label}</h4>
        </div>
        <span className="tenant-data-integration__ddl-badge">
          {kind === 'source' ? 'Non modifiable' : 'Lecture seule'}
        </span>
      </div>
      <p className="tenant-data-integration__ddl-note">{note}</p>
      <pre aria-label={label}>{content}</pre>
      <button className="secondary-button" onClick={onDownload} type="button">
        Télécharger le DDL
      </button>
      <span className="visually-hidden">Fichier : {fileName}</span>
    </article>
  )
}

export function AdminTenantDataIntegration({
  apiBaseUrl,
  tenantId,
  tenantLabel,
  tenantStatus,
  onSessionExpired,
}: AdminTenantDataIntegrationProps) {
  const [workspaces, setWorkspaces] = useState<AdminIntegrationWorkspaceSummary[]>([])
  const [auditSources, setAuditSources] = useState<AdminIntegrationWorkspaceAuditSource[]>([])
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null)
  const [detailState, setDetailState] = useState<DetailState>({ status: 'idle' })
  const [listState, setListState] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [auditSourcesState, setAuditSourcesState] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [selectedAuditId, setSelectedAuditId] = useState('')
  const [creationFile, setCreationFile] = useState<PendingDdlFile | null>(null)
  const [targetFile, setTargetFile] = useState<PendingDdlFile | null>(null)
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<'audit' | 'upload' | 'replace' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const listRequest = useRef<AbortController | null>(null)
  const detailRequest = useRef<AbortController | null>(null)

  const selectWorkspace = useCallback((workspaceId: string) => {
    setSelectedWorkspaceId(workspaceId)
    setDetailState({ status: 'loading', workspaceId })
    setError(null)
    setNotice(null)
    detailRequest.current?.abort()
    const controller = new AbortController()
    detailRequest.current = controller
    void fetchAdminIntegrationWorkspace(apiBaseUrl, tenantId, workspaceId, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      if (handleAuthentication(result, onSessionExpired)) return
      setDetailState(result.status === 'loaded'
        ? { status: 'loaded', workspace: result.workspace }
        : { status: result.status === 'not_found' ? 'not_found' : 'error', workspaceId })
      if (result.status !== 'loaded') setError(errorMessage(result))
    })
  }, [apiBaseUrl, onSessionExpired, tenantId])

  useEffect(() => {
    listRequest.current?.abort()
    const controller = new AbortController()
    listRequest.current = controller
    setListState('loading')
    setAuditSourcesState('loading')
    void Promise.all([
      fetchAdminIntegrationWorkspaces(apiBaseUrl, tenantId, controller.signal),
      fetchAdminIntegrationWorkspaceAuditSources(apiBaseUrl, tenantId, controller.signal),
    ]).then(([workspaceResult, sourceResult]) => {
      if (controller.signal.aborted) return
      if (handleAuthentication(workspaceResult, onSessionExpired)
        || handleAuthentication(sourceResult, onSessionExpired)) return
      if (workspaceResult.status === 'loaded') {
        setWorkspaces(workspaceResult.workspaces)
        setListState('loaded')
        if (selectedWorkspaceId !== null
          && !workspaceResult.workspaces.some((workspace) => workspace.id === selectedWorkspaceId)) {
          setSelectedWorkspaceId(null)
          setDetailState({ status: 'idle' })
        }
      } else {
        setListState('error')
      }
      if (sourceResult.status === 'loaded') {
        setAuditSources(sourceResult.sources)
        setSelectedAuditId((current) => current || sourceResult.sources[0]?.report_id || '')
        setAuditSourcesState('loaded')
      } else {
        setAuditSourcesState('error')
      }
    })
    return () => {
      controller.abort()
      if (listRequest.current === controller) listRequest.current = null
    }
    // The selected workspace is intentionally not a reload trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBaseUrl, onSessionExpired, tenantId])

  useEffect(() => () => {
    listRequest.current?.abort()
    detailRequest.current?.abort()
  }, [])

  function updateAfterWorkspaceChange(workspace: AdminIntegrationWorkspace) {
    setWorkspaces((current) => {
      const summary: AdminIntegrationWorkspaceSummary = {
        id: workspace.id,
        tenant_id: workspace.tenant_id,
        source_type: workspace.source_type,
        source_report_id: workspace.source_report_id,
        source_filename: workspace.source_filename,
        version: workspace.version,
        status: workspace.status,
        created_at: workspace.created_at,
        updated_at: workspace.updated_at,
      }
      const existing = current.some((item) => item.id === workspace.id)
      return existing ? current.map((item) => item.id === workspace.id ? summary : item) : [summary, ...current]
    })
    setSelectedWorkspaceId(workspace.id)
    setDetailState({ status: 'loaded', workspace })
  }

  async function createFromAudit() {
    if (tenantStatus !== 'active' || selectedAuditId === '') return
    setPendingAction('audit')
    setError(null)
    setNotice(null)
    const result = await createAdminIntegrationWorkspaceFromAudit(apiBaseUrl, tenantId, selectedAuditId)
    setPendingAction(null)
    if (handleAuthentication(result, onSessionExpired)) return
    if (result.status !== 'loaded') {
      setError(errorMessage(result))
      return
    }
    updateAfterWorkspaceChange(result.workspace)
    setNotice('Workspace créé depuis l’audit sélectionné.')
  }

  async function createFromUpload() {
    if (tenantStatus !== 'active' || creationFile === null) return
    setPendingAction('upload')
    setError(null)
    setNotice(null)
    const result = await createAdminIntegrationWorkspaceFromUpload(
      apiBaseUrl, tenantId, creationFile.content, creationFile.fileName,
    )
    setPendingAction(null)
    if (handleAuthentication(result, onSessionExpired)) return
    if (result.status !== 'loaded') {
      setError(errorMessage(result))
      return
    }
    setCreationFile(null)
    updateAfterWorkspaceChange(result.workspace)
    setNotice('Workspace créé depuis le fichier SQL.')
  }

  async function replaceTarget() {
    if (tenantStatus !== 'active' || targetFile === null || detailState.status !== 'loaded') return
    setPendingAction('replace')
    setError(null)
    setNotice(null)
    const result = await replaceAdminIntegrationWorkspaceWorkingDdl(
      apiBaseUrl, tenantId, detailState.workspace.id, targetFile.content,
    )
    setPendingAction(null)
    setConfirmationOpen(false)
    if (handleAuthentication(result, onSessionExpired)) return
    if (result.status !== 'loaded') {
      setError(errorMessage(result))
      return
    }
    setTargetFile(null)
    updateAfterWorkspaceChange(result.workspace)
    setNotice('DDL cible remplacé. Le DDL source est resté inchangé.')
  }

  async function readDdlFile(file: File | undefined, target: 'creation' | 'target') {
    if (file === undefined) return
    setError(null)
    setNotice(null)
    if (!file.name.toLowerCase().endsWith('.sql')) {
      setError('Sélectionnez un fichier portant l’extension .sql.')
      return
    }
    if (file.size === 0 || file.size > MAX_DDL_BYTES) {
      setError(file.size === 0 ? 'Le fichier SQL est vide.' : `Le fichier SQL dépasse 1 MiB (${formatBytes(file.size)}).`)
      return
    }
    const content = await file.text()
    const validationError = getDdlValidationError(content)
    if (validationError !== null) {
      setError(validationMessage(validationError))
      return
    }
    const pendingFile = { content, fileName: file.name }
    if (target === 'creation') setCreationFile(pendingFile)
    else setTargetFile(pendingFile)
  }

  const selectedSummary = selectedWorkspaceId === null
    ? null
    : workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null
  const isArchived = tenantStatus !== 'active'
  const loadedWorkspace = detailState.status === 'loaded' ? detailState.workspace : null
  const targetIsInitial = loadedWorkspace !== null
    && loadedWorkspace.version === 1
    && loadedWorkspace.working_ddl === loadedWorkspace.source_ddl
  const sourceFileName = loadedWorkspace?.source_filename
    ?? `${artifactFilenamePart(tenantLabel)}-ddl-source.sql`
  const targetFileName = `${artifactFilenamePart(tenantLabel)}-ddl-cible-v${loadedWorkspace?.version ?? 1}.sql`

  return (
    <section aria-labelledby="tenant-data-integration-title" className="tenant-data-integration">
      <div className="tenant-data-integration__heading">
        <div>
          <p className="tenant-data-integration__eyebrow">Workspace d’intégration</p>
          <h3 id="tenant-data-integration-title">Intégration des données</h3>
          <p>Conservez la source auditée et importez explicitement le DDL cible préparé pour ce client.</p>
        </div>
        <span className="tenant-data-integration__opaque-note">SQL conservé comme texte opaque</span>
      </div>

      {isArchived ? (
        <p className="tenant-data-integration__notice" role="status">
          Client archivé : les workspaces restent consultables si disponibles, mais aucune création ni modification n’est possible.
        </p>
      ) : null}
      {error ? <p className="tenant-data-integration__error" role="alert">{error}</p> : null}
      {notice ? <p className="tenant-data-integration__notice" role="status">{notice}</p> : null}

      <div className="tenant-data-integration__creation">
        <div className="tenant-data-integration__section-heading">
          <div>
            <p className="tenant-data-integration__eyebrow">Nouveau workspace</p>
            <h4>Créer depuis une source existante</h4>
          </div>
          <span>Une création ne modifie aucun workspace existant.</span>
        </div>
        <div className="tenant-data-integration__creation-grid">
          <label className="tenant-data-integration__field">
            <span>Audit publié</span>
            <select
              aria-label="Audit publié"
              disabled={isArchived || auditSourcesState !== 'loaded' || pendingAction !== null}
              onChange={(event) => setSelectedAuditId(event.target.value)}
              value={selectedAuditId}
            >
              <option value="">Sélectionner un audit</option>
              {auditSources.map((source) => (
                <option key={source.report_id} value={source.report_id}>
                  {source.title} · {source.provider} · {source.report_date}
                </option>
              ))}
            </select>
            {auditSourcesState === 'error' ? <small>Les audits disponibles ne peuvent pas être chargés.</small> : null}
          </label>
          <button
            className="primary-button"
            disabled={isArchived || selectedAuditId === '' || pendingAction !== null}
            onClick={() => void createFromAudit()}
            type="button"
          >
            {pendingAction === 'audit' ? 'Création…' : 'Créer depuis cet audit'}
          </button>
          <div className="tenant-data-integration__upload-field">
            <FilePicker disabled={isArchived || pendingAction !== null} label="Fichier SQL source (.sql)" onFile={(file) => void readDdlFile(file, 'creation')} />
            {creationFile ? <span className="tenant-data-integration__file-name">{creationFile.fileName} · prêt à importer</span> : null}
          </div>
          <button
            className="secondary-button"
            disabled={isArchived || creationFile === null || pendingAction !== null}
            onClick={() => void createFromUpload()}
            type="button"
          >
            {pendingAction === 'upload' ? 'Création…' : 'Créer depuis ce fichier'}
          </button>
        </div>
        <small className="tenant-data-integration__limit">Fichier SQL non vide, 1 MiB maximum. Le contenu ne sera pas exécuté.</small>
      </div>

      <div className="tenant-data-integration__layout">
        <aside aria-label="Workspaces d’intégration" className="tenant-data-integration__sidebar">
          <div className="tenant-data-integration__section-heading">
            <div>
              <p className="tenant-data-integration__eyebrow">Workspaces</p>
              <h4>Choisir un workspace</h4>
            </div>
            {listState === 'loaded' ? <span>{workspaces.length}</span> : null}
          </div>
          {listState === 'loading' ? <p className="tenant-data-integration__empty">Chargement des workspaces…</p> : null}
          {listState === 'error' ? <p className="tenant-data-integration__empty">Les workspaces ne peuvent pas être chargés.</p> : null}
          {listState === 'loaded' && workspaces.length === 0 ? <p className="tenant-data-integration__empty">Aucun workspace pour ce client.</p> : null}
          {workspaces.length > 0 ? (
            <ul className="tenant-data-integration__workspace-list">
              {workspaces.map((workspace) => (
                <li key={workspace.id}>
                  <button
                    aria-current={selectedWorkspaceId === workspace.id ? 'true' : undefined}
                    className={selectedWorkspaceId === workspace.id
                      ? 'tenant-data-integration__workspace-item tenant-data-integration__workspace-item--selected'
                      : 'tenant-data-integration__workspace-item'}
                    onClick={() => selectWorkspace(workspace.id)}
                    type="button"
                  >
                    <strong>{workspaceLabel(workspace)}</strong>
                    <span>Version {workspace.version} · {formatDate(workspace.updated_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </aside>

        <div className="tenant-data-integration__detail">
          {selectedSummary ? <p className="tenant-data-integration__selected-label">Workspace ouvert : <strong>{workspaceLabel(selectedSummary)}</strong></p> : null}
          {detailState.status === 'idle' ? (
            <div className="tenant-data-integration__empty tenant-data-integration__empty--detail">
              <h4>Ouvrez un workspace</h4>
              <p>Le détail et les DDL seront chargés uniquement après votre sélection.</p>
            </div>
          ) : null}
          {detailState.status === 'loading' ? <p className="tenant-data-integration__empty">Chargement du workspace…</p> : null}
          {detailState.status === 'not_found' || detailState.status === 'error' ? (
            <p className="tenant-data-integration__empty" role="alert">Le détail du workspace n’est pas disponible.</p>
          ) : null}
          {loadedWorkspace ? (
            <>
              <div className="tenant-data-integration__detail-heading">
                <div>
                  <p className="tenant-data-integration__eyebrow">Workspace ouvert</p>
                  <h4>{workspaceLabel(loadedWorkspace)}</h4>
                </div>
                <span className="tenant-data-integration__status">Brouillon · version {loadedWorkspace.version}</span>
              </div>
              <dl className="tenant-data-integration__metadata">
                <div><dt>Source</dt><dd>{loadedWorkspace.source_type === 'audit' ? 'Audit publié' : 'Fichier SQL externe'}</dd></div>
                <div><dt>Créé le</dt><dd>{formatDate(loadedWorkspace.created_at)}</dd></div>
                <div><dt>Mis à jour le</dt><dd>{formatDate(loadedWorkspace.updated_at)}</dd></div>
                <div><dt>Identifiant</dt><dd><code>{loadedWorkspace.id}</code></dd></div>
              </dl>
              <div className="tenant-data-integration__ddl-grid">
                <WorkspaceDdlBlock
                  content={loadedWorkspace.source_ddl}
                  fileName={sourceFileName}
                  kind="source"
                  label="DDL source"
                  note="Source conservée telle qu’importée ou produite par l’audit. Elle n’est pas modifiable."
                  onDownload={() => downloadDdl(loadedWorkspace.source_ddl, sourceFileName)}
                />
                <WorkspaceDdlBlock
                  content={loadedWorkspace.working_ddl}
                  fileName={targetFileName}
                  kind="target"
                  label="DDL cible"
                  note={targetIsInitial
                    ? 'Aucun DDL cible n’a encore été importé : la source initiale est encore utilisée.'
                    : 'Dernier DDL cible importé explicitement. Aucun SQL n’est exécuté par cet écran.'}
                  onDownload={() => downloadDdl(loadedWorkspace.working_ddl, targetFileName)}
                />
              </div>
              {!isArchived ? (
                <div className="tenant-data-integration__target-upload">
                  <div>
                    <h5>Importer / remplacer le DDL cible</h5>
                    <p>Préparez le fichier à l’extérieur de Syncoria, puis importez-le pour remplacer le DDL courant.</p>
                  </div>
                  <FilePicker disabled={pendingAction !== null} label="Choisir un fichier .sql" onFile={(file) => void readDdlFile(file, 'target')} />
                  {targetFile ? <span className="tenant-data-integration__file-name">{targetFile.fileName} · prêt à remplacer</span> : null}
                  <button
                    className="primary-button"
                    disabled={targetFile === null || pendingAction !== null}
                    onClick={() => {
                      if (targetIsInitial) void replaceTarget()
                      else setConfirmationOpen(true)
                    }}
                    type="button"
                  >
                    {targetIsInitial ? 'Importer le DDL cible' : 'Préparer le remplacement'}
                  </button>
                </div>
              ) : null}
              {confirmationOpen ? (
                <div
                  aria-describedby="tenant-data-integration-confirmation-description"
                  aria-labelledby="tenant-data-integration-confirmation-title"
                  className="tenant-data-integration__confirmation"
                  role="alertdialog"
                >
                  <strong id="tenant-data-integration-confirmation-title">Remplacer le DDL cible ?</strong>
                  <p id="tenant-data-integration-confirmation-description">
                    Le fichier sélectionné remplacera le DDL cible courant. Le DDL source restera strictement inchangé et aucun SQL ne sera exécuté.
                  </p>
                  <div>
                    <button className="secondary-button" disabled={pendingAction !== null} onClick={() => setConfirmationOpen(false)} type="button">Annuler</button>
                    <button className="primary-button" disabled={pendingAction !== null} onClick={() => void replaceTarget()} type="button">
                      {pendingAction === 'replace' ? 'Remplacement…' : 'Confirmer le remplacement'}
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </section>
  )
}
