import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchAdminIntegrations, type AdminIntegrationSummary } from '../api/adminIntegrations.ts'
import { fetchExplorerProfile, fetchExplorerRows, fetchExplorerSummary, type ExplorerProfile, type ExplorerResult, type ExplorerRows, type ExplorerSort, type ExplorerSummary } from '../api/dataExplorer.ts'
import { businessColumns, type GridColumnState } from '../dataExplorer/gridState.ts'
import { DataExplorerGrid } from './DataExplorerGrid.tsx'

interface Props { apiBaseUrl: string | null; tenantId: string; onSessionExpired: () => void }
type State<T> = { status: 'loading' } | Exclude<ExplorerResult<T>, { status: 'unauthenticated' }>
const errorText = (status: string) => ({
  not_found: 'Aucun modèle matérialisé disponible pour cette version.',
  conflict: 'Le modèle a changé. Rechargez les données.',
  invalid: 'Cette demande de données n’est plus valide.',
  unavailable: 'Les données sont temporairement indisponibles.',
} as Record<string, string>)[status] ?? 'Les données ne peuvent pas être chargées pour le moment.'
const sourceLabel = (source: { provider: string; source_name: string | null }) => [source.provider, source.source_name].filter(Boolean).join(' · ')

function TableView({ apiBaseUrl, tenantId, versionId, tableName, onSessionExpired }: Props & { versionId: string; tableName: string }) {
  const [profile, setProfile] = useState<State<ExplorerProfile>>({ status: 'loading' })
  const [profileReload, setProfileReload] = useState(0)
  const [columns, setColumns] = useState<GridColumnState[]>([])
  const [sorts, setSorts] = useState<ExplorerSort[]>([])
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const [searchRevision, setSearchRevision] = useState(0)
  const previousDraft = useRef('')
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [page, setPage] = useState<ExplorerRows | null>(null)
  const [status, setStatus] = useState<State<ExplorerRows>>({ status: 'loading' })
  const [loadingMore, setLoadingMore] = useState(false)
  const [reload, setReload] = useState(0)
  const request = useRef({ generation: 0, controller: null as AbortController | null, cursor: null as string | null, seen: new Set<string>(), busy: false })

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setProfile({ status: 'loading' })
    void fetchExplorerProfile(apiBaseUrl, tenantId, versionId, tableName, controller.signal).then((result) => {
      if (!active) return
      if (result.status === 'unauthenticated') { onSessionExpired(); return }
      setProfile(result)
      if (result.status === 'loaded') setColumns(businessColumns(result.value.columns).slice(0, 100))
    })
    return () => { active = false; controller.abort() }
  }, [apiBaseUrl, tenantId, versionId, tableName, onSessionExpired, profileReload])

  const columnNames = useMemo(() => columns.filter((column) => column.visible).map((column) => column.name).sort().join('\u0000'), [columns])
  const sortKey = useMemo(() => sorts.map((sort) => `${sort.column}:${sort.direction}`).join(','), [sorts])
  useEffect(() => {
    if (profile.status !== 'loaded' || columns.length === 0) return
    const current = request.current
    current.generation++
    current.controller?.abort()
    current.controller = new AbortController()
    current.cursor = null
    current.seen.clear()
    current.busy = true
    const generation = current.generation
    setRows([])
    setPage(null)
    setStatus({ status: 'loading' })
    setLoadingMore(false)
    void fetchExplorerRows(apiBaseUrl, tenantId, versionId, tableName, {
      columns: columnNames.split('\u0000'), sorts, search: search || null, cursor: null, limit: 100,
    }, current.controller.signal).then((result) => {
      if (generation !== request.current.generation) return
      current.busy = false
      if (result.status === 'unauthenticated') { onSessionExpired(); return }
      setStatus(result)
      if (result.status === 'loaded') {
        setRows(result.value.rows)
        setPage(result.value)
        current.cursor = result.value.next_cursor
      }
    })
    return () => { current.generation++; current.controller?.abort(); current.busy = false }
    // Column order and width do not change requested columns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBaseUrl, tenantId, versionId, tableName, profile.status, columnNames, sortKey, search, searchRevision, reload, onSessionExpired])

  function loadMore() {
    const current = request.current
    const cursor = current.cursor
    if (!page?.has_more || cursor === null || current.busy || current.seen.has(cursor)) return
    current.busy = true
    current.seen.add(cursor)
    current.controller = new AbortController()
    const generation = current.generation
    setLoadingMore(true)
    void fetchExplorerRows(apiBaseUrl, tenantId, versionId, tableName, {
      columns: columnNames.split('\u0000'), sorts, search: search || null, cursor, limit: 100,
    }, current.controller.signal).then((result) => {
      if (generation !== request.current.generation) return
      current.busy = false
      setLoadingMore(false)
      if (result.status === 'unauthenticated') { onSessionExpired(); return }
      if (result.status === 'loaded') {
        setRows((previous) => [...previous, ...result.value.rows])
        setPage(result.value)
        current.cursor = result.value.next_cursor
      } else {
        current.seen.delete(cursor)
        setStatus(result)
      }
    })
  }

  useEffect(() => {
    if (draft === previousDraft.current) return
    previousDraft.current = draft
    const timeout = window.setTimeout(() => { setSearch(draft.trim()); setSearchRevision((revision) => revision + 1) }, 300)
    return () => window.clearTimeout(timeout)
  }, [draft])

  if (profile.status === 'loading') return <p role="status">Chargement des colonnes…</p>
  if (profile.status !== 'loaded') return <div role="alert"><p>{errorText(profile.status)}</p>
    <button className="secondary-button" type="button" onClick={() => setProfileReload((key) => key + 1)}>Réessayer</button></div>
  if (columns.length === 0) return <p>Aucune colonne métier disponible dans cette table.</p>
  return <div className="data-explorer__table-view">
    <label className="data-explorer__search">Rechercher dans la table
      <input type="search" value={draft} maxLength={200} placeholder="Rechercher…" onChange={(event) => {
        setDraft(event.target.value)
        request.current.generation++
        request.current.controller?.abort()
        request.current.busy = false
        setRows([])
        setPage(null)
        setStatus({ status: 'loading' })
      }} />
    </label>
    {status.status === 'loading' && rows.length === 0 ? <p role="status">Chargement des lignes…</p> : null}
    {status.status !== 'loading' && status.status !== 'loaded' ? <div role="alert"><p>{errorText(status.status)}</p>
      <button className="secondary-button" type="button" onClick={() => setReload((key) => key + 1)}>Réessayer</button></div> : null}
    {status.status === 'loaded' && rows.length === 0 ? <p>Cette table ne contient aucune ligne pour la recherche actuelle.</p> : null}
    {rows.length > 0 ? <DataExplorerGrid columns={columns} onColumnsChange={setColumns} page={page} rows={rows}
      loadingMore={loadingMore} onLoadMore={loadMore} sorts={sorts} onSortsChange={(next) => {
        request.current.generation++
        request.current.controller?.abort()
        request.current.busy = false
        setRows([])
        setPage(null)
        setStatus({ status: 'loading' })
        setSorts(next)
      }} /> : null}
  </div>
}

function VersionView({ apiBaseUrl, tenantId, versionId, onSessionExpired }: Props & { versionId: string }) {
  const [summary, setSummary] = useState<State<ExplorerSummary>>({ status: 'loading' })
  const [table, setTable] = useState('')
  const [reload, setReload] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setSummary({ status: 'loading' })
    void fetchExplorerSummary(apiBaseUrl, tenantId, versionId, controller.signal).then((result) => {
      if (!active) return
      if (result.status === 'unauthenticated') { onSessionExpired(); return }
      setSummary(result)
      if (result.status === 'loaded') setTable(result.value.tables[0]?.name ?? '')
    })
    return () => { active = false; controller.abort() }
  }, [apiBaseUrl, tenantId, versionId, onSessionExpired, reload])
  if (summary.status === 'loading') return <p role="status">Chargement du résumé…</p>
  if (summary.status !== 'loaded') return <div role="alert"><p>{errorText(summary.status)}</p>
    <button className="secondary-button" type="button" onClick={() => setReload((key) => key + 1)}>Réessayer</button></div>
  const value = summary.value
  const date = new Date(value.profiled_at)
  return <>
    <div className="data-explorer__summary" aria-label="Résumé du modèle">
      <div><span>Tables matérialisées</span><strong>{value.table_count}</strong></div>
      <div><span>Lignes matérialisées</span><strong>{value.total_row_count.toLocaleString('fr-FR')}</strong></div>
      <div><span>Dernière matérialisation</span><strong>{new Date(value.materialized_at).toLocaleString('fr-FR')}</strong></div>
      <div><span>Dernier profil</span><strong>{Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('fr-FR')}</strong></div>
      <div><span>Sources</span><strong>{value.sources.map(sourceLabel).join(', ') || '—'}</strong></div>
    </div>
    {value.tables.length === 0 ? <p>Aucune table matérialisée dans ce modèle.</p> : <div className="data-explorer__layout">
      <nav aria-label="Tables matérialisées" className="data-explorer__tables">
        {value.tables.map((item) => <button key={item.name} type="button" aria-current={table === item.name ? 'true' : undefined}
          className={table === item.name ? 'data-explorer__table data-explorer__table--active' : 'data-explorer__table'}
          onClick={() => setTable(item.name)}>
          <strong>{item.name}</strong><span>{item.row_count.toLocaleString('fr-FR')} lignes · {item.column_count} colonnes</span>
          {item.sources.length > 0 ? <small>{item.sources.map(sourceLabel).join(', ')}</small> : null}
        </button>)}
      </nav>
      {table ? <TableView key={table} apiBaseUrl={apiBaseUrl} tenantId={tenantId} versionId={versionId}
        tableName={table} onSessionExpired={onSessionExpired} /> : null}
    </div>}
  </>
}

export function AdminTenantData({ apiBaseUrl, tenantId, onSessionExpired }: Props) {
  const [versions, setVersions] = useState<{ status: 'loading' | 'error'; value?: never } | { status: 'loaded'; value: AdminIntegrationSummary[] }>({ status: 'loading' })
  const [versionId, setVersionId] = useState('')
  const [reload, setReload] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setVersions({ status: 'loading' })
    setVersionId('')
    void fetchAdminIntegrations(apiBaseUrl, tenantId, controller.signal).then((result) => {
      if (!active) return
      if (result.status === 'unauthenticated') { onSessionExpired(); return }
      if (result.status !== 'loaded') { setVersions({ status: 'error' }); return }
      const next = [...result.integrations].sort((a, b) => b.version_number - a.version_number || b.updated_at.localeCompare(a.updated_at))
      setVersions({ status: 'loaded', value: next })
      setVersionId(next.find((item) => item.status === 'active')?.id ?? next[0]?.id ?? '')
    })
    return () => { active = false; controller.abort() }
  }, [apiBaseUrl, tenantId, onSessionExpired, reload])
  return <section aria-labelledby="tenant-data-title" className="data-explorer">
    <div className="data-explorer__heading">
      <div><h2 id="tenant-data-title">Données</h2><p>Explorez les données matérialisées en lecture seule.</p></div>
      {versions.status === 'loaded' && versions.value.length > 0 ? <label>Version d’intégration
        <select value={versionId} onChange={(event) => setVersionId(event.target.value)}>
          {versions.value.map((item) => <option key={item.id} value={item.id}>{item.display_name} · v{item.version_number}</option>)}
        </select></label> : null}
    </div>
    {versions.status === 'loading' ? <p role="status">Chargement des versions…</p> : null}
    {versions.status === 'error' ? <div role="alert"><p>Les versions d’intégration ne peuvent pas être chargées.</p>
      <button className="secondary-button" type="button" onClick={() => setReload((key) => key + 1)}>Réessayer</button></div> : null}
    {versions.status === 'loaded' && versions.value.length === 0 ? <p>Aucune version d’intégration n’est disponible.</p> : null}
    {versionId ? <VersionView key={versionId} apiBaseUrl={apiBaseUrl} tenantId={tenantId}
      versionId={versionId} onSessionExpired={onSessionExpired} /> : null}
  </section>
}
