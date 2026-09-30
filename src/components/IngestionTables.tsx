import { useId, useState } from 'react'

import type { AdminInitialIngestion, AdminInitialIngestionSource } from '../api/adminTenantIngestions'
import type { AdminProviderRecord } from '../api/adminTenantProviders'
import { getProviderLabel } from '../providers/catalog'
import { getInitialIngestionStatusLabel, getProgressCountLabel, getProgressWidth, isInitialIngestionActive } from '../tenantIngestion'
import { ProviderLogo } from './ProviderLogo'
import { ActionMenu } from './ui/ActionMenu'

function formatDate(value: string | null): string {
  if (value === null) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date indisponible'
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function formatDuration(seconds: number | null, status: AdminInitialIngestion['status']): string {
  if (seconds === null) return isInitialIngestionActive(status) ? 'En cours' : 'Durée indisponible'
  if (!Number.isSafeInteger(seconds) || seconds < 0) return 'Durée indisponible'
  const minutes = Math.floor(seconds / 60)
  return minutes === 0 ? `${seconds} s` : `${minutes} min ${seconds % 60} s`
}

function Status({ status }: { status: AdminInitialIngestion['status'] }) {
  return <span className={`ingestion-status ingestion-status--${status}`}>
    {getInitialIngestionStatusLabel(status)}
  </span>
}

function RejectedCount({ count }: { count: number }) {
  return count > 0
    ? <span className="ingestion-rejected">{count} rejeté{count > 1 ? 's' : ''}</span>
    : <span className="ingestion-zero">0</span>
}

function ProgressBar({ operation }: { operation: AdminInitialIngestion }) {
  const width = getProgressWidth(operation.items_processed, operation.items_expected)
  const expected = operation.items_expected
  return <div
    aria-label={`Progression de l’ingestion ${operation.correlation_id}`}
    aria-valuemax={expected !== null && expected > 0 ? expected : undefined}
    aria-valuemin={expected !== null && expected > 0 ? 0 : undefined}
    aria-valuenow={expected !== null && expected > 0 ? Math.min(operation.items_processed, expected) : undefined}
    className={width === null ? 'ingestion-progress ingestion-progress--indeterminate' : 'ingestion-progress'}
    role="progressbar"
  ><span className="ingestion-progress__value" style={width === null ? undefined : { width: `${width}%` }} /></div>
}

function CounterStrip({ operation }: { operation: AdminInitialIngestion }) {
  return <dl className="ingestion-counters">
    <div><dt>Reçus</dt><dd>{operation.items_received}</dd></div>
    <div><dt>Traités</dt><dd>{operation.items_processed}</dd></div>
    <div><dt>Insérés</dt><dd>{operation.items_inserted}</dd></div>
    <div><dt>Doublons</dt><dd>{operation.items_duplicate}</dd></div>
    <div><dt>Rejetés</dt><dd><RejectedCount count={operation.items_rejected} /></dd></div>
  </dl>
}

function OperationTechnicalDetails({ operation }: { operation: AdminInitialIngestion }) {
  return <details className="ingestion-technical">
    <summary>Informations techniques</summary>
    <dl>
      <div><dt>Correlation ID</dt><dd><code>{operation.correlation_id}</code></dd></div>
      {operation.capture_contract_versions.length > 0 ? <div><dt>Versions de capture</dt><dd>{operation.capture_contract_versions.join(', ')}</dd></div> : null}
      {operation.error_codes.length > 0 ? <div><dt>Codes d’erreur</dt><dd>{operation.error_codes.join(', ')}</dd></div> : null}
    </dl>
  </details>
}

export function IngestionSummary({ operation }: { operation: AdminInitialIngestion }) {
  return <section aria-labelledby="ingestion-current-title" className="ingestion-operation">
    <h4 id="ingestion-current-title">{isInitialIngestionActive(operation.status) ? 'Ingestion en cours' : 'Dernière ingestion'}</h4>
    <dl className="ingestion-operation__facts">
      <div><dt>Outil</dt><dd className="ingestion-operation__provider"><ProviderLogo provider={operation.provider} />{getProviderLabel(operation.provider)}</dd></div>
      <div><dt>Statut</dt><dd><Status status={operation.status} /></dd></div>
      <div><dt>Démarrée</dt><dd>{formatDate(operation.started_at)}</dd></div>
      <div><dt>Durée</dt><dd>{formatDuration(operation.duration_seconds, operation.status)}</dd></div>
    </dl>
    <div className="ingestion-operation__progress">
      <div className="ingestion-operation__progress-heading">
        <strong>{getProgressCountLabel(operation.items_processed, operation.items_expected)}</strong>
      </div>
      <ProgressBar operation={operation} />
    </div>
    <CounterStrip operation={operation} />
    {operation.items_not_attempted > 0 ? <p className="ingestion-attention">{operation.items_not_attempted} élément{operation.items_not_attempted > 1 ? 's' : ''} non tenté{operation.items_not_attempted > 1 ? 's' : ''}</p> : null}
    <OperationTechnicalDetails operation={operation} />
  </section>
}

function SourceDetail({ source }: { source: AdminInitialIngestionSource }) {
  return <div className="ingestion-source-detail">
    <h5>{source.source_name}</h5>
    <dl className="ingestion-detail-list">
      <div><dt>Début</dt><dd>{formatDate(source.started_at)}</dd></div>
      <div><dt>Fin</dt><dd>{formatDate(source.completed_at)}</dd></div>
      <div><dt>Reçus</dt><dd>{source.items_received}</dd></div>
      <div><dt>Traités</dt><dd>{source.items_processed}</dd></div>
      <div><dt>Insérés</dt><dd>{source.items_inserted}</dd></div>
      <div><dt>Doublons</dt><dd>{source.items_duplicate}</dd></div>
      <div><dt>Rejetés</dt><dd><RejectedCount count={source.items_rejected} /></dd></div>
      {source.items_not_attempted > 0 ? <div className="ingestion-attention"><dt>Non tentés</dt><dd>{source.items_not_attempted}</dd></div> : null}
      {source.error_code !== null ? <div className="ingestion-attention"><dt>Erreur technique</dt><dd><code>{source.error_code}</code></dd></div> : null}
    </dl>
    <details className="ingestion-technical">
      <summary>Informations techniques</summary>
      <dl>
        <div><dt>Identifiant source</dt><dd><code>{source.external_source_id}</code></dd></div>
        {source.run_id !== null ? <div><dt>Run ID</dt><dd><code>{source.run_id}</code></dd></div> : null}
        {source.capture_contract_versions.length > 0 ? <div><dt>Versions de capture</dt><dd>{source.capture_contract_versions.join(', ')}</dd></div> : null}
      </dl>
    </details>
  </div>
}

export function IngestionSourcesTable({ operation }: { operation: AdminInitialIngestion }) {
  const [expandedSource, setExpandedSource] = useState<string | null>(null)
  const tableId = useId().replaceAll(':', '')
  if (operation.sources.length === 0) return <p className="ingestion-empty">Aucune source renseignée pour cette ingestion.</p>

  return <div className="ingestion-table-scroll" role="region" aria-label="Table des sources" tabIndex={0}>
    <table className="ingestion-table ingestion-sources-table">
      <thead><tr><th scope="col">Source</th><th scope="col">Attendus</th><th scope="col">Traités</th><th scope="col">Insérés</th><th scope="col">Doublons</th><th scope="col">Rejetés</th><th scope="col">Statut</th></tr></thead>
      <tbody>{operation.sources.map((source, index) => {
        const expanded = expandedSource === source.external_source_id
        const detailId = `${tableId}-source-${index}`
        const toggle = () => setExpandedSource((current) => current === source.external_source_id ? null : source.external_source_id)
        return <FragmentSourceRow key={source.external_source_id} source={source} expanded={expanded} detailId={detailId} onToggle={toggle} />
      })}</tbody>
    </table>
  </div>
}

function FragmentSourceRow({ source, expanded, detailId, onToggle }: {
  source: AdminInitialIngestionSource
  expanded: boolean
  detailId: string
  onToggle: () => void
}) {
  return <>
    <tr className="ingestion-table__row" onClick={onToggle}>
      <td><button aria-controls={detailId} aria-expanded={expanded} className="ingestion-table__expand" onClick={(event) => { event.stopPropagation(); onToggle() }} type="button"><span aria-hidden="true">{expanded ? '⌄' : '›'}</span>{source.source_name}</button></td>
      <td>{source.observed_record_count ?? '—'}</td>
      <td>{source.items_processed}</td>
      <td>{source.items_inserted}</td>
      <td>{source.items_duplicate}</td>
      <td><RejectedCount count={source.items_rejected} /></td>
      <td><Status status={source.status} /></td>
    </tr>
    <tr className="ingestion-table__detail-row" hidden={!expanded}><td colSpan={7} id={detailId}>{expanded ? <SourceDetail source={source} /> : null}</td></tr>
  </>
}

function HistoryDetail({ operation }: { operation: AdminInitialIngestion }) {
  return <div className="ingestion-history__detail">
    <div className="ingestion-operation__progress">
      <div className="ingestion-operation__progress-heading"><strong>{getProgressCountLabel(operation.items_processed, operation.items_expected)}</strong></div>
      <ProgressBar operation={operation} />
    </div>
    <CounterStrip operation={operation} />
    {operation.items_not_attempted > 0 ? <p className="ingestion-attention">{operation.items_not_attempted} éléments non tentés</p> : null}
    <h5>Sources</h5>
    <IngestionSourcesTable operation={operation} />
    <OperationTechnicalDetails operation={operation} />
  </div>
}

export function IngestionHistoryTable({ operations, providers, expandedCorrelationId, isArchiving, onToggle, onArchive }: {
  operations: AdminInitialIngestion[]
  providers: AdminProviderRecord[]
  expandedCorrelationId: string | null
  isArchiving: boolean
  onToggle: (correlationId: string) => void
  onArchive: (operation: AdminInitialIngestion) => void
}) {
  return <div className="ingestion-table-scroll" role="region" aria-label="Table de l’historique" tabIndex={0}>
    <table className="ingestion-table ingestion-history-table">
      <thead><tr><th scope="col">Date</th><th scope="col">Outil</th><th scope="col">Sources</th><th scope="col">Reçus</th><th scope="col">Insérés</th><th scope="col">Doublons</th><th scope="col">Rejetés</th><th scope="col">Durée</th><th scope="col">Statut</th></tr></thead>
      <tbody>{operations.map((operation) => {
        const expanded = expandedCorrelationId === operation.correlation_id
        const detailId = `ingestion-detail-${operation.correlation_id}`
        const providerName = providers.find((item) => item.id === operation.tenant_provider_record_id)?.name
        return <HistoryRows key={operation.correlation_id} operation={operation} providerName={providerName} expanded={expanded} detailId={detailId} isArchiving={isArchiving} onToggle={() => onToggle(operation.correlation_id)} onArchive={() => onArchive(operation)} />
      })}</tbody>
    </table>
  </div>
}

function HistoryRows({ operation, providerName, expanded, detailId, isArchiving, onToggle, onArchive }: {
  operation: AdminInitialIngestion
  providerName: string | undefined
  expanded: boolean
  detailId: string
  isArchiving: boolean
  onToggle: () => void
  onArchive: () => void
}) {
  return <>
    <tr className="ingestion-history__item ingestion-table__row" onClick={onToggle}>
      <td><button aria-controls={detailId} aria-expanded={expanded} className="ingestion-table__expand" onClick={(event) => { event.stopPropagation(); onToggle() }} type="button"><span aria-hidden="true">{expanded ? '⌄' : '›'}</span>{formatDate(operation.started_at)}</button></td>
      <td><span className="ingestion-history__tool"><ProviderLogo provider={operation.provider} /><span>{getProviderLabel(operation.provider)}{providerName ? <small>{providerName}</small> : null}</span></span></td>
      <td>{operation.sources_total}</td>
      <td>{operation.items_received}</td>
      <td>{operation.items_inserted}</td>
      <td>{operation.items_duplicate}</td>
      <td><RejectedCount count={operation.items_rejected} /></td>
      <td>{formatDuration(operation.duration_seconds, operation.status)}</td>
      <td><div className="ingestion-history__status-cell"><Status status={operation.status} />{!operation.archived && !isInitialIngestionActive(operation.status) ? <span onClick={(event) => event.stopPropagation()}><ActionMenu ariaLabel="Actions de l’ingestion" label="⋯" portal><button disabled={isArchiving} onClick={onArchive} type="button">Archiver</button></ActionMenu></span> : null}</div></td>
    </tr>
    <tr className="ingestion-table__detail-row" hidden={!expanded}><td colSpan={9} id={detailId}>{expanded ? <HistoryDetail operation={operation} /> : null}</td></tr>
  </>
}
