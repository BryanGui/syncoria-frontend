import { useEffect, useMemo, useState } from 'react'

import {
  fetchAdminIntegrationModelStructure,
  fetchAdminIntegrations,
  type AdminIntegrationModelStructure,
  type AdminIntegrationSummary,
  type IntegrationStatus,
} from '../api/adminIntegrations'
import { Badge, Button } from './ui'

interface AdminTenantDataProps {
  apiBaseUrl: string | null
  tenantId: string
  onSessionExpired: () => void
}

type VersionsState = 'loading' | 'loaded' | 'error'
type StructureState = 'idle' | 'loading' | 'loaded' | 'unavailable' | 'error'

function statusLabel(status: IntegrationStatus): string {
  if (status === 'active') return 'Actif'
  if (status === 'archived') return 'Archivé'
  return 'Test'
}

function statusTone(status: IntegrationStatus): 'success' | 'neutral' | 'warning' {
  if (status === 'active') return 'success'
  if (status === 'archived') return 'neutral'
  return 'warning'
}

function sortedVersions(versions: AdminIntegrationSummary[]): AdminIntegrationSummary[] {
  return [...versions].sort((left, right) => (
    right.version_number - left.version_number || right.updated_at.localeCompare(left.updated_at)
  ))
}

function isTechnicalProvenanceColumn(columnName: string): boolean {
  return columnName.startsWith('__syncoria_')
}

export function AdminTenantData({
  apiBaseUrl,
  tenantId,
  onSessionExpired,
}: AdminTenantDataProps) {
  const [versionsState, setVersionsState] = useState<VersionsState>('loading')
  const [versions, setVersions] = useState<AdminIntegrationSummary[]>([])
  const [selectedVersionId, setSelectedVersionId] = useState('')
  const [structureState, setStructureState] = useState<StructureState>('idle')
  const [structure, setStructure] = useState<AdminIntegrationModelStructure | null>(null)
  const [selectedTableName, setSelectedTableName] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setVersionsState('loading')
    void fetchAdminIntegrations(apiBaseUrl, tenantId, controller.signal).then((result) => {
      if (!active) return
      if (result.status === 'unauthenticated') {
        onSessionExpired()
        return
      }
      if (result.status !== 'loaded') {
        setVersionsState('error')
        return
      }
      const nextVersions = sortedVersions(result.integrations)
      setVersions(nextVersions)
      setSelectedVersionId((current) => {
        if (nextVersions.some((version) => version.id === current)) return current
        return nextVersions.find((version) => version.status === 'active')?.id
          ?? nextVersions[0]?.id
          ?? ''
      })
      setVersionsState('loaded')
    })
    return () => {
      active = false
      controller.abort()
    }
  }, [apiBaseUrl, onSessionExpired, reloadKey, tenantId])

  useEffect(() => {
    if (selectedVersionId === '') {
      setStructure(null)
      setStructureState('idle')
      setSelectedTableName('')
      return
    }
    const controller = new AbortController()
    let active = true
    setStructure(null)
    setStructureState('loading')
    setSelectedTableName('')
    void fetchAdminIntegrationModelStructure(
      apiBaseUrl, tenantId, selectedVersionId, controller.signal,
    ).then((result) => {
      if (!active) return
      if (result.status === 'unauthenticated') {
        onSessionExpired()
        return
      }
      if (result.status === 'conflict' && result.code === 'model_not_built') {
        setStructureState('unavailable')
        return
      }
      if (result.status !== 'loaded') {
        setStructureState('error')
        return
      }
      setStructure(result.structure)
      setSelectedTableName(result.structure.tables[0]?.name ?? '')
      setStructureState('loaded')
    })
    return () => {
      active = false
      controller.abort()
    }
  }, [apiBaseUrl, onSessionExpired, reloadKey, selectedVersionId, tenantId])

  const selectedVersion = useMemo(
    () => versions.find((version) => version.id === selectedVersionId) ?? null,
    [selectedVersionId, versions],
  )
  const selectedTable = structure?.tables.find(
    (table) => table.name === selectedTableName,
  ) ?? null
  const displayedStatus = structure?.status ?? selectedVersion?.status

  return (
    <section aria-labelledby="tenant-data-title" className="tenant-model-data">
      <div className="tenant-model-data__heading">
        <div>
          <h3 id="tenant-data-title">Données</h3>
          <p>Structure du modèle PostgreSQL matérialisé pour une version d’intégration.</p>
          <p>Les colonnes marquées « Technique » correspondent aux métadonnées de provenance ajoutées par Syncoria.</p>
        </div>
        {versionsState === 'loaded' && versions.length > 0 ? (
          <label>
            Version
            <select
              onChange={(event) => setSelectedVersionId(event.target.value)}
              value={selectedVersionId}
            >
              {versions.map((version) => (
                <option key={version.id} value={version.id}>
                  {version.display_name} · v{version.version_number} · {statusLabel(version.status)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {versionsState === 'loading' ? <p role="status">Chargement des versions…</p> : null}
      {versionsState === 'error' ? (
        <div className="tenant-model-data__state" role="alert">
          <p>Les versions d’intégration ne peuvent pas être chargées.</p>
          <Button onClick={() => setReloadKey((key) => key + 1)} size="compact" variant="secondary">
            Réessayer
          </Button>
        </div>
      ) : null}
      {versionsState === 'loaded' && versions.length === 0 ? (
        <p className="tenant-model-data__state">Aucune version d’intégration n’est disponible.</p>
      ) : null}

      {selectedVersion !== null ? (
        <div className="tenant-model-data__summary">
          <div>
            <span>Version sélectionnée</span>
            <strong>{selectedVersion.display_name} · v{selectedVersion.version_number}</strong>
          </div>
          {displayedStatus !== undefined ? (
            <Badge tone={statusTone(displayedStatus)}>{statusLabel(displayedStatus)}</Badge>
          ) : null}
          {structureState === 'loaded' && structure !== null ? (
            <div>
              <span>Tables</span>
              <strong>{structure.tables.length}</strong>
            </div>
          ) : null}
        </div>
      ) : null}

      {structureState === 'loading' ? <p role="status">Chargement du modèle PostgreSQL…</p> : null}
      {structureState === 'unavailable' ? (
        <p className="tenant-model-data__state">Aucun modèle PostgreSQL construit pour cette version.</p>
      ) : null}
      {structureState === 'error' ? (
        <div className="tenant-model-data__state" role="alert">
          <p>La structure du modèle PostgreSQL ne peut pas être chargée.</p>
          <Button onClick={() => setReloadKey((key) => key + 1)} size="compact" variant="secondary">
            Réessayer
          </Button>
        </div>
      ) : null}
      {structureState === 'loaded' && structure?.tables.length === 0 ? (
        <p className="tenant-model-data__state">Le modèle PostgreSQL ne contient aucune table.</p>
      ) : null}

      {structureState === 'loaded' && structure !== null && structure.tables.length > 0 ? (
        <div className="tenant-model-data__explorer">
          <nav aria-label="Tables du modèle PostgreSQL" className="tenant-model-data__tables">
            {structure.tables.map((table) => (
              <button
                aria-current={table.name === selectedTableName ? 'true' : undefined}
                className={table.name === selectedTableName ? 'tenant-model-data__table tenant-model-data__table--selected' : 'tenant-model-data__table'}
                key={table.name}
                onClick={() => setSelectedTableName(table.name)}
                type="button"
              >
                <strong>{table.name}</strong>
                <span>{table.columns.length} colonne{table.columns.length > 1 ? 's' : ''}</span>
              </button>
            ))}
          </nav>
          {selectedTable !== null ? (
            <div className="tenant-model-data__columns">
              <h4>{selectedTable.name}</h4>
              {selectedTable.columns.length === 0 ? (
                <p>Cette table ne contient aucune colonne visible.</p>
              ) : (
                <div className="tenant-model-data__column-table">
                  <div className="tenant-model-data__column-heading">
                    <span>Colonne</span><span>Type</span><span>Nullable</span>
                  </div>
                  {selectedTable.columns.map((column) => (
                    <div className="tenant-model-data__column" key={column.name}>
                      <span className="tenant-model-data__column-name">
                        <code>{column.name}</code>
                        {isTechnicalProvenanceColumn(column.name) ? <Badge tone="info">Technique</Badge> : null}
                      </span>
                      <code>{column.data_type}</code>
                      <span>{column.nullable ? 'Oui' : 'Non'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
