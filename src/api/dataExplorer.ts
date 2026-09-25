import { technicalLogger, type TechnicalLogger } from '../observability/logger.ts'

export interface ExplorerSource { provider: string; source_id: string | null; source_name: string | null }
export interface ExplorerTable { name: string; row_count: number; column_count: number; sources: ExplorerSource[] }
export interface ExplorerSummary {
  integration_version_id: string
  table_count: number
  total_row_count: number
  materialized_at: string
  profiled_at: string
  sources: ExplorerSource[]
  tables: ExplorerTable[]
}
export interface ExplorerColumn {
  name: string
  ordinal_position: number
  data_type: string
  type_family: string
  is_technical: boolean
}
export interface ExplorerProfile { name: string; columns: ExplorerColumn[] }
export interface ExplorerRows {
  columns: string[]
  rows: Record<string, unknown>[]
  table_row_count: number
  has_more: boolean
  next_cursor: string | null
}
export interface ExplorerSort { column: string; direction: 'asc' | 'desc' }
export interface ExplorerRowsQuery {
  columns: string[]
  sorts: ExplorerSort[]
  search: string | null
  cursor: string | null
  limit: number
}
export type ExplorerResult<T> = { status: 'loaded'; value: T } | {
  status: 'unauthenticated' | 'not_found' | 'conflict' | 'invalid' | 'unavailable' | 'error'
}

const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0
const source = (value: unknown): value is ExplorerSource => object(value) && typeof value.provider === 'string'
  && (value.source_id === null || typeof value.source_id === 'string')
  && (value.source_name === null || typeof value.source_name === 'string')
const sources = (value: unknown): value is ExplorerSource[] => Array.isArray(value) && value.every(source)
const table = (value: unknown): value is ExplorerTable => object(value) && typeof value.name === 'string'
  && count(value.row_count) && count(value.column_count) && sources(value.sources)
const column = (value: unknown): value is ExplorerColumn => object(value) && typeof value.name === 'string'
  && count(value.ordinal_position) && typeof value.data_type === 'string'
  && typeof value.type_family === 'string' && typeof value.is_technical === 'boolean'

function summary(value: unknown): value is ExplorerSummary {
  return object(value) && typeof value.integration_version_id === 'string'
    && count(value.table_count) && count(value.total_row_count)
    && typeof value.materialized_at === 'string' && typeof value.profiled_at === 'string'
    && sources(value.sources) && Array.isArray(value.tables) && value.tables.every(table)
}
function profile(value: unknown): value is ExplorerProfile {
  return object(value) && typeof value.name === 'string'
    && Array.isArray(value.columns) && value.columns.every(column)
}
function rows(value: unknown): value is ExplorerRows {
  return object(value) && Array.isArray(value.columns) && value.columns.every((item) => typeof item === 'string')
    && Array.isArray(value.rows) && value.rows.every(object) && count(value.table_row_count)
    && typeof value.has_more === 'boolean'
    && (value.next_cursor === null || typeof value.next_cursor === 'string')
    && (!value.has_more || typeof value.next_cursor === 'string')
}

async function requestExplorer<T>(
  base: string | null, tenantId: string, versionId: string, suffix: string,
  method: 'GET' | 'POST', parse: (value: unknown) => value is T,
  body?: unknown, signal?: AbortSignal, request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<ExplorerResult<T>> {
  if (base === null || !uuid.test(tenantId) || !uuid.test(versionId)) return { status: 'error' }
  const endpoint = `/admin/tenants/${tenantId}/integrations/${versionId}/data${suffix}`
  try {
    const response = await request(`${base}${endpoint}`, {
      method, credentials: 'include', signal,
      headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    if (response.status === 401) return { status: 'unauthenticated' }
    if (response.status === 404) return { status: 'not_found' }
    if (response.status === 409) return { status: 'conflict' }
    if (response.status === 422) return { status: 'invalid' }
    if (response.status === 503) return { status: 'unavailable' }
    if (!response.ok) return { status: 'error' }
    const value: unknown = await response.json()
    return parse(value) ? { status: 'loaded', value } : { status: 'error' }
  } catch (error: unknown) {
    if (!signal?.aborted) logger.error('Data Explorer request failed.', {
      page: 'data_explorer', action: method === 'POST' ? 'load_rows' : 'load_metadata',
      endpoint: '/admin/tenants/{tenant_id}/integrations/{integration_version_id}/data',
      errorType: error instanceof Error ? error.name : 'UnknownError',
    })
    return { status: 'error' }
  }
}

export const fetchExplorerSummary = (
  base: string | null, tenantId: string, versionId: string, signal?: AbortSignal,
  request?: typeof fetch,
) => requestExplorer(base, tenantId, versionId, '/summary', 'GET', summary, undefined, signal, request)

export const fetchExplorerProfile = (
  base: string | null, tenantId: string, versionId: string, tableName: string,
  signal?: AbortSignal, request?: typeof fetch,
) => requestExplorer(base, tenantId, versionId,
  `/tables/${encodeURIComponent(tableName)}/profile`, 'GET', profile, undefined, signal, request)

export const fetchExplorerRows = (
  base: string | null, tenantId: string, versionId: string, tableName: string,
  query: ExplorerRowsQuery, signal?: AbortSignal, request?: typeof fetch,
) => requestExplorer(base, tenantId, versionId,
  `/tables/${encodeURIComponent(tableName)}/rows`, 'POST', rows, query, signal, request)
