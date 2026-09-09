import type { TechnicalLogger } from '../observability/logger.ts'
import { technicalLogger } from '../observability/logger.ts'

export type InitialIngestionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'interrupted'

export interface AdminInitialIngestionSource {
  external_source_id: string
  source_name: string
  observed_record_count: number | null
  run_id: string | null
  status: InitialIngestionStatus
  started_at: string | null
  completed_at: string | null
  items_received: number
  items_processed: number
  items_inserted: number
  items_duplicate: number
  items_rejected: number
  items_not_attempted: number
  error_code: string | null
}

export interface AdminInitialIngestion {
  tenant_id: string
  tenant_provider_record_id: string
  provider: string
  correlation_id: string
  status: InitialIngestionStatus
  started_at: string
  completed_at: string | null
  items_expected: number | null
  items_received: number
  items_processed: number
  items_inserted: number
  items_duplicate: number
  items_rejected: number
  items_not_attempted: number
  sources_total: number
  sources_completed: number
  sources_in_progress: number
  sources_error: number
  sources: AdminInitialIngestionSource[]
}

export type AdminInitialIngestionResult =
  | { status: 'loaded'; operation: AdminInitialIngestion }
  | { status: 'not_found' | 'unauthenticated' | 'conflict' | 'unsupported' | 'error' }

export function supportsInitialIngestionProvider(provider: string): boolean {
  return provider === 'notion'
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === 'number' && value >= 0
}

function isStatus(value: unknown): value is InitialIngestionStatus {
  return value === 'pending'
    || value === 'running'
    || value === 'completed'
    || value === 'partial'
    || value === 'failed'
    || value === 'interrupted'
}

function parseSource(value: unknown): AdminInitialIngestionSource | null {
  if (!isObject(value)) return null
  const countFields = [
    'items_received',
    'items_processed',
    'items_inserted',
    'items_duplicate',
    'items_rejected',
    'items_not_attempted',
  ] as const
  if (
    typeof value.external_source_id !== 'string'
    || typeof value.source_name !== 'string'
    || !isNullableString(value.run_id)
    || !isStatus(value.status)
    || !isNullableString(value.started_at)
    || !isNullableString(value.completed_at)
    || !isNullableString(value.error_code)
    || (value.observed_record_count !== null && !isNonNegativeInteger(value.observed_record_count))
    || countFields.some((field) => !isNonNegativeInteger(value[field]))
  ) return null

  return {
    external_source_id: value.external_source_id,
    source_name: value.source_name,
    observed_record_count: value.observed_record_count as number | null,
    run_id: value.run_id,
    status: value.status,
    started_at: value.started_at,
    completed_at: value.completed_at,
    items_received: value.items_received as number,
    items_processed: value.items_processed as number,
    items_inserted: value.items_inserted as number,
    items_duplicate: value.items_duplicate as number,
    items_rejected: value.items_rejected as number,
    items_not_attempted: value.items_not_attempted as number,
    error_code: value.error_code,
  }
}

function parseOperation(value: unknown): AdminInitialIngestion | null {
  if (!isObject(value) || !Array.isArray(value.sources)) return null
  const countFields = [
    'items_received',
    'items_processed',
    'items_inserted',
    'items_duplicate',
    'items_rejected',
    'items_not_attempted',
    'sources_total',
    'sources_completed',
    'sources_in_progress',
    'sources_error',
  ] as const
  const sources = value.sources.map(parseSource)
  if (
    typeof value.tenant_id !== 'string'
    || typeof value.tenant_provider_record_id !== 'string'
    || typeof value.provider !== 'string'
    || typeof value.correlation_id !== 'string'
    || !isStatus(value.status)
    || typeof value.started_at !== 'string'
    || !isNullableString(value.completed_at)
    || (value.items_expected !== null && !isNonNegativeInteger(value.items_expected))
    || countFields.some((field) => !isNonNegativeInteger(value[field]))
    || sources.some((source) => source === null)
    || value.sources_total !== sources.length
  ) return null

  return {
    tenant_id: value.tenant_id,
    tenant_provider_record_id: value.tenant_provider_record_id,
    provider: value.provider,
    correlation_id: value.correlation_id,
    status: value.status,
    started_at: value.started_at,
    completed_at: value.completed_at,
    items_expected: value.items_expected as number | null,
    items_received: value.items_received as number,
    items_processed: value.items_processed as number,
    items_inserted: value.items_inserted as number,
    items_duplicate: value.items_duplicate as number,
    items_rejected: value.items_rejected as number,
    items_not_attempted: value.items_not_attempted as number,
    sources_total: value.sources_total as number,
    sources_completed: value.sources_completed as number,
    sources_in_progress: value.sources_in_progress as number,
    sources_error: value.sources_error as number,
    sources: sources as AdminInitialIngestionSource[],
  }
}

function ingestionEndpoint(tenantId: string, providerRecordId: string, suffix = ''): string {
  return `/admin/tenants/${encodeURIComponent(tenantId)}/providers/${encodeURIComponent(providerRecordId)}/ingestions${suffix}`
}

function logFailure(
  logger: TechnicalLogger,
  action: string,
  httpStatus?: number,
  error?: unknown,
): void {
  const context = {
    action,
    endpoint: '/admin/tenants/{tenant_id}/providers/{provider_record_id}/ingestions',
    page: 'tenant_ingestion',
    ...(httpStatus === undefined ? {} : { httpStatus }),
    ...(error === undefined ? {} : { errorType: error instanceof Error ? error.name : 'UnknownError' }),
  }
  if (error === undefined) logger.warning('Admin ingestion endpoint returned an error.', context)
  else logger.error('Admin ingestion request failed.', context)
}

async function requestOperation(
  apiBaseUrl: string | null,
  tenantId: string,
  providerRecordId: string,
  method: 'GET' | 'POST',
  suffix: string,
  signal: AbortSignal | undefined,
  request: typeof fetch,
  logger: TechnicalLogger,
): Promise<AdminInitialIngestionResult> {
  if (apiBaseUrl === null) return { status: 'error' }
  try {
    const response = await request(`${apiBaseUrl}${ingestionEndpoint(tenantId, providerRecordId, suffix)}`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
      method,
      signal,
    })
    if (response.status === 401) return { status: 'unauthenticated' }
    if (response.status === 404) return { status: 'not_found' }
    if (response.status === 409) return { status: 'conflict' }
    if (!response.ok) {
      logFailure(logger, method === 'POST' ? 'launch_initial_ingestion' : 'load_initial_ingestion', response.status)
      return { status: 'error' }
    }
    const operation = parseOperation(await response.json())
    if (operation === null || operation.tenant_id !== tenantId || operation.tenant_provider_record_id !== providerRecordId) {
      return { status: 'error' }
    }
    return { status: 'loaded', operation }
  } catch (error: unknown) {
    if (!signal?.aborted) logFailure(logger, method === 'POST' ? 'launch_initial_ingestion' : 'load_initial_ingestion', undefined, error)
    return { status: 'error' }
  }
}

export function fetchLatestAdminTenantIngestion(
  apiBaseUrl: string | null,
  tenantId: string,
  providerRecordId: string,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminInitialIngestionResult> {
  return requestOperation(apiBaseUrl, tenantId, providerRecordId, 'GET', '/latest', signal, request, logger)
}

export function fetchAdminTenantIngestion(
  apiBaseUrl: string | null,
  tenantId: string,
  providerRecordId: string,
  correlationId: string,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminInitialIngestionResult> {
  return requestOperation(apiBaseUrl, tenantId, providerRecordId, 'GET', `/${encodeURIComponent(correlationId)}`, signal, request, logger)
}

export function launchAdminTenantIngestion(
  apiBaseUrl: string | null,
  tenantId: string,
  providerRecordId: string,
  provider: string,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminInitialIngestionResult> {
  if (!supportsInitialIngestionProvider(provider)) return Promise.resolve({ status: 'unsupported' })
  return requestOperation(apiBaseUrl, tenantId, providerRecordId, 'POST', '', signal, request, logger)
}
