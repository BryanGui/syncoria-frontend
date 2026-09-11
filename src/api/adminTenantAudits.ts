import {
  technicalLogger,
  type TechnicalLogger,
} from '../observability/logger.ts'

export type AdminProviderAuditStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface AdminProviderAuditOperation {
  tenant_id: string
  tenant_provider_record_id: string
  provider: 'notion'
  correlation_id: string
  status: AdminProviderAuditStatus
  codex_thread_id: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
  error_code: string | null
  report_id: string | null
  sources_total: number
  sources_retained: number
  sources_excluded: number
  sources_pending: number
  records_retained: number
  decisions_required: number
}

export type AdminProviderAuditResult =
  | { status: 'loaded'; operation: AdminProviderAuditOperation }
  | { status: 'unauthenticated' | 'not_found' | 'conflict' | 'invalid' | 'error' }

const uuidPattern = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i
const reportIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const operationKeys = new Set([
  'tenant_id', 'tenant_provider_record_id', 'provider', 'correlation_id', 'status',
  'codex_thread_id', 'created_at', 'started_at', 'completed_at', 'error_code',
  'report_id', 'sources_total', 'sources_retained', 'sources_excluded',
  'sources_pending', 'records_retained', 'decisions_required',
])

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNullableString(value: unknown, maximum = 256): value is string | null {
  return value === null || (
    typeof value === 'string' && value.length > 0 && value.length <= maximum
  )
}

function isDateTime(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value))
}

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

export function parseAdminProviderAuditResponse(
  value: unknown,
): AdminProviderAuditOperation | null {
  if (!isObject(value) || Object.keys(value).some((key) => !operationKeys.has(key))) {
    return null
  }
  if ([...operationKeys].some((key) => !(key in value))) return null
  const counts = [
    value.sources_total, value.sources_retained, value.sources_excluded,
    value.sources_pending, value.records_retained, value.decisions_required,
  ]
  if (
    !uuidPattern.test(String(value.tenant_id))
    || !uuidPattern.test(String(value.tenant_provider_record_id))
    || value.provider !== 'notion'
    || !uuidPattern.test(String(value.correlation_id))
    || !['pending', 'running', 'completed', 'failed'].includes(String(value.status))
    || !isNullableString(value.codex_thread_id)
    || !isDateTime(value.created_at)
    || (value.started_at !== null && !isDateTime(value.started_at))
    || (value.completed_at !== null && !isDateTime(value.completed_at))
    || (value.error_code !== null && !isNullableString(value.error_code, 128))
    || (value.report_id !== null && (
      !isNullableString(value.report_id, 80) || !reportIdPattern.test(value.report_id)
    ))
    || counts.some((count) => !isCount(count))
    || value.sources_total !== (value.sources_retained as number)
      + (value.sources_excluded as number) + (value.sources_pending as number)
  ) return null

  return {
    tenant_id: value.tenant_id as string,
    tenant_provider_record_id: value.tenant_provider_record_id as string,
    provider: 'notion',
    correlation_id: value.correlation_id as string,
    status: value.status as AdminProviderAuditStatus,
    codex_thread_id: value.codex_thread_id as string | null,
    created_at: value.created_at as string,
    started_at: value.started_at as string | null,
    completed_at: value.completed_at as string | null,
    error_code: value.error_code as string | null,
    report_id: value.report_id as string | null,
    sources_total: value.sources_total as number,
    sources_retained: value.sources_retained as number,
    sources_excluded: value.sources_excluded as number,
    sources_pending: value.sources_pending as number,
    records_retained: value.records_retained as number,
    decisions_required: value.decisions_required as number,
  }
}

function endpoint(tenantId: string, providerRecordId: string, suffix = ''): string {
  return '/admin/tenants/' + encodeURIComponent(tenantId)
    + '/providers/' + encodeURIComponent(providerRecordId) + '/audits' + suffix
}

function logError(logger: TechnicalLogger, action: string, error: unknown): void {
  logger.error('Admin provider audit request failed.', {
    page: 'tenant_audit',
    action,
    endpoint: '/admin/tenants/{tenant_id}/providers/{provider_record_id}/audits',
    errorType: error instanceof Error ? error.name : 'UnknownError',
  })
}

type AuditErrorStatus = Exclude<AdminProviderAuditResult['status'], 'loaded'>

function parseHttpStatus(status: number): AuditErrorStatus | null {
  if (status === 401) return 'unauthenticated'
  if (status === 404) return 'not_found'
  if (status === 409) return 'conflict'
  if (status === 422) return 'invalid'
  return null
}

async function requestAudit(
  apiBaseUrl: string | null,
  tenantId: string,
  providerRecordId: string,
  options: RequestInit,
  request: typeof fetch,
  logger: TechnicalLogger,
  action: string,
  suffix = '',
): Promise<AdminProviderAuditResult> {
  if (apiBaseUrl === null || !uuidPattern.test(tenantId) || !uuidPattern.test(providerRecordId)) {
    return { status: 'error' }
  }
  try {
    const response = await request(apiBaseUrl + endpoint(tenantId, providerRecordId, suffix), {
      ...options,
      credentials: 'include',
      headers: { Accept: 'application/json', ...options.headers },
    })
    const mapped = parseHttpStatus(response.status)
    if (mapped !== null) return { status: mapped }
    if (!response.ok) {
      logger.warning('Admin provider audit endpoint returned an error.', {
        page: 'tenant_audit', action, httpStatus: response.status,
      })
      return { status: 'error' }
    }
    const operation = parseAdminProviderAuditResponse(await response.json())
    return operation === null ? { status: 'error' } : { status: 'loaded', operation }
  } catch (error: unknown) {
    if (!options.signal?.aborted) logError(logger, action, error)
    return { status: 'error' }
  }
}

export function launchAdminTenantProviderAudit(
  apiBaseUrl: string | null,
  tenantId: string,
  providerRecordId: string,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminProviderAuditResult> {
  return requestAudit(
    apiBaseUrl, tenantId, providerRecordId,
    { method: 'POST', signal }, request, logger, 'launch_admin_provider_audit',
  )
}

export function fetchLatestAdminTenantProviderAudit(
  apiBaseUrl: string | null,
  tenantId: string,
  providerRecordId: string,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminProviderAuditResult> {
  return requestAudit(
    apiBaseUrl, tenantId, providerRecordId,
    { method: 'GET', signal }, request, logger, 'load_latest_provider_audit', '/latest',
  )
}

export function fetchAdminTenantProviderAudit(
  apiBaseUrl: string | null,
  tenantId: string,
  providerRecordId: string,
  correlationId: string,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminProviderAuditResult> {
  if (!uuidPattern.test(correlationId)) return Promise.resolve({ status: 'error' })
  return requestAudit(
    apiBaseUrl, tenantId, providerRecordId,
    { method: 'GET', signal }, request, logger, 'poll_provider_audit',
    '/' + encodeURIComponent(correlationId),
  )
}
