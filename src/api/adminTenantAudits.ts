import {
  technicalLogger,
  type TechnicalLogger,
} from '../observability/logger.ts'

export type AdminProviderAuditStatus = 'pending' | 'running' | 'completed' | 'failed'
export type AdminProviderAuditPhase =
  | 'preparing'
  | 'collecting'
  | 'analyzing'
  | 'generating_report'
  | 'publishing'
  | 'completed'
  | 'failed'
export type AdminProviderAuditProgressUnit = 'source' | 'item' | null

export interface AdminProviderAuditOperation {
  tenant_id: string
  tenant_provider_record_id: string
  provider: 'notion'
  correlation_id: string
  status: AdminProviderAuditStatus
  display_title: string
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
  phase: AdminProviderAuditPhase
  progress_current: number | null
  progress_total: number | null
  progress_unit: AdminProviderAuditProgressUnit
}

export type AdminProviderAuditResult =
  | { status: 'loaded'; operation: AdminProviderAuditOperation }
  | { status: 'unauthenticated' | 'not_found' | 'conflict' | 'invalid' | 'error' }

const uuidPattern = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i
const reportIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const operationKeys = new Set([
  'tenant_id', 'tenant_provider_record_id', 'provider', 'correlation_id', 'status',
  'display_title',
  'codex_thread_id', 'created_at', 'started_at', 'completed_at', 'error_code',
  'report_id', 'sources_total', 'sources_retained', 'sources_excluded',
  'sources_pending', 'records_retained', 'decisions_required', 'phase',
  'progress_current', 'progress_total', 'progress_unit',
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

function isProgress(value: unknown): value is number | null {
  return value === null || isCount(value)
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
    || typeof value.display_title !== 'string'
    || value.display_title.length < 1 || value.display_title.length > 120
    || !isNullableString(value.codex_thread_id)
    || !isDateTime(value.created_at)
    || (value.started_at !== null && !isDateTime(value.started_at))
    || (value.completed_at !== null && !isDateTime(value.completed_at))
    || (value.error_code !== null && !isNullableString(value.error_code, 128))
    || (value.report_id !== null && (
      !isNullableString(value.report_id, 80) || !reportIdPattern.test(value.report_id)
    ))
    || counts.some((count) => !isCount(count))
    || !['preparing', 'collecting', 'analyzing', 'generating_report', 'publishing', 'completed', 'failed'].includes(String(value.phase))
    || !isProgress(value.progress_current)
    || !isProgress(value.progress_total)
    || (value.progress_current !== null && value.progress_total !== null
      && value.progress_current > value.progress_total)
    || (value.progress_unit !== null && value.progress_unit !== 'source' && value.progress_unit !== 'item')
    || value.sources_total !== (value.sources_retained as number)
      + (value.sources_excluded as number) + (value.sources_pending as number)
  ) return null

  return {
    tenant_id: value.tenant_id as string,
    tenant_provider_record_id: value.tenant_provider_record_id as string,
    provider: 'notion',
    correlation_id: value.correlation_id as string,
    status: value.status as AdminProviderAuditStatus,
    display_title: value.display_title as string,
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
    phase: value.phase as AdminProviderAuditPhase,
    progress_current: value.progress_current as number | null,
    progress_total: value.progress_total as number | null,
    progress_unit: value.progress_unit as AdminProviderAuditProgressUnit,
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
  options?: AbortSignal | { signal?: AbortSignal; displayTitle?: string },
  request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminProviderAuditResult> {
  const normalizedOptions = options instanceof AbortSignal
    ? { signal: options }
    : options ?? {}
  const requestOptions: RequestInit = {
    method: 'POST',
    signal: normalizedOptions.signal,
  }
  if (normalizedOptions.displayTitle !== undefined) {
    requestOptions.body = JSON.stringify({ display_title: normalizedOptions.displayTitle })
    requestOptions.headers = { 'Content-Type': 'application/json' }
  }
  return requestAudit(
    apiBaseUrl, tenantId, providerRecordId,
    requestOptions, request, logger, 'launch_admin_provider_audit',
  )
}

export function updateAdminTenantProviderAuditTitle(
  apiBaseUrl: string | null,
  tenantId: string,
  providerRecordId: string,
  correlationId: string,
  displayTitle: string,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminProviderAuditResult> {
  if (!uuidPattern.test(correlationId)) return Promise.resolve({ status: 'error' })
  return requestAudit(
    apiBaseUrl, tenantId, providerRecordId,
    {
      method: 'PATCH',
      body: JSON.stringify({ display_title: displayTitle }),
      headers: { 'Content-Type': 'application/json' },
      signal,
    }, request, logger, 'rename_provider_audit', '/' + encodeURIComponent(correlationId) + '/title',
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

export interface AdminProviderAuditMetrics {
  sources_analyzed: number
  sources_retained: number
  sources_excluded: number
  sources_pending: number
  records_retained: number
  decisions_required: number
}

export type AdminProviderAuditDecision = 'retained' | 'excluded' | 'pending'

export interface AdminProviderAuditSource {
  source_name: string
  source_type: string
  volume: number | null
  decision: AdminProviderAuditDecision
  reason: string
}

export interface AdminProviderAuditStructuredReport {
  metrics: AdminProviderAuditMetrics
  summary: string[]
  scope: string[]
  source_map: string[]
  sources: AdminProviderAuditSource[]
  retained: AdminProviderAuditSource[]
  excluded: AdminProviderAuditSource[]
  pending: AdminProviderAuditSource[]
  volumes: string[]
  relationships: string[]
  inconsistencies: string[]
  risks: string[]
  decisions: string[]
  blockers: string[]
  recommendations: string[]
  integration_plan: string[]
  technical_appendix: string[]
}

export interface AdminProviderAuditReport {
  tenant_id: string
  tenant_provider_record_id: string
  correlation_id: string
  report_id: string
  display_title: string
  provider: string
  report_date: string
  status: 'completed'
  structured_report: AdminProviderAuditStructuredReport
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function parseStructuredSource(value: unknown): AdminProviderAuditSource | null {
  if (!isObject(value)) return null
  if (
    typeof value.source_name !== 'string'
    || typeof value.source_type !== 'string'
    || (value.volume !== null && !isCount(value.volume))
    || !['retained', 'excluded', 'pending'].includes(String(value.decision))
    || typeof value.reason !== 'string'
  ) return null
  return {
    source_name: value.source_name,
    source_type: value.source_type,
    volume: value.volume as number | null,
    decision: value.decision as AdminProviderAuditDecision,
    reason: value.reason,
  }
}

function parseStructuredReport(value: unknown): AdminProviderAuditStructuredReport | null {
  if (!isObject(value) || !isObject(value.metrics)) return null
  const metrics = value.metrics
  const metricKeys = [
    'sources_analyzed', 'sources_retained', 'sources_excluded',
    'sources_pending', 'records_retained', 'decisions_required',
  ] as const
  if (metricKeys.some((key) => !isCount(metrics[key]))) return null
  const listKeys = [
    'summary', 'scope', 'source_map', 'volumes', 'relationships',
    'inconsistencies', 'risks', 'decisions', 'blockers', 'recommendations',
    'integration_plan', 'technical_appendix',
  ] as const
  if (listKeys.some((key) => !isStringList(value[key]))) return null
  const sourceKeys = ['sources', 'retained', 'excluded', 'pending'] as const
  const parsedSources = Object.fromEntries(sourceKeys.map((key) => [
    key,
    Array.isArray(value[key]) ? value[key].map(parseStructuredSource) : [],
  ])) as Record<typeof sourceKeys[number], Array<AdminProviderAuditSource | null>>
  if (sourceKeys.some((key) => parsedSources[key].some((source) => source === null))) return null
  return {
    metrics: {
      sources_analyzed: metrics.sources_analyzed as number,
      sources_retained: metrics.sources_retained as number,
      sources_excluded: metrics.sources_excluded as number,
      sources_pending: metrics.sources_pending as number,
      records_retained: metrics.records_retained as number,
      decisions_required: metrics.decisions_required as number,
    },
    ...Object.fromEntries(listKeys.map((key) => [key, value[key]])),
    ...Object.fromEntries(sourceKeys.map((key) => [key, parsedSources[key] as AdminProviderAuditSource[]])),
  } as AdminProviderAuditStructuredReport
}

function parseAdminProviderAuditReport(value: unknown): AdminProviderAuditReport | null {
  if (!isObject(value)) return null
  const structuredReport = parseStructuredReport(value.structured_report)
  if (
    structuredReport === null
    || !uuidPattern.test(String(value.tenant_id))
    || !uuidPattern.test(String(value.tenant_provider_record_id))
    || !uuidPattern.test(String(value.correlation_id))
    || typeof value.report_id !== 'string'
    || !reportIdPattern.test(value.report_id)
    || typeof value.display_title !== 'string' || value.display_title.length < 1 || value.display_title.length > 120
    || typeof value.provider !== 'string' || value.provider.length < 1 || value.provider.length > 64
    || typeof value.report_date !== 'string' || !isDateTime(`${value.report_date}T00:00:00Z`)
    || value.status !== 'completed'
  ) return null
  return {
    tenant_id: value.tenant_id as string,
    tenant_provider_record_id: value.tenant_provider_record_id as string,
    correlation_id: value.correlation_id as string,
    report_id: value.report_id as string,
    display_title: value.display_title as string,
    provider: value.provider as string,
    report_date: value.report_date as string,
    status: 'completed',
    structured_report: structuredReport,
  }
}

export type AdminProviderAuditReportResult =
  | { status: 'loaded'; report: AdminProviderAuditReport }
  | { status: 'unauthenticated' | 'not_found' | 'error' }

export function fetchAdminTenantProviderAuditReport(
  apiBaseUrl: string | null,
  tenantId: string,
  providerRecordId: string,
  correlationId: string,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminProviderAuditReportResult> {
  if (!uuidPattern.test(correlationId)) return Promise.resolve({ status: 'error' })
  return requestAuditReport(
    apiBaseUrl, tenantId, providerRecordId, correlationId, signal, request, logger,
  )
}

async function requestAuditReport(
  apiBaseUrl: string | null,
  tenantId: string,
  providerRecordId: string,
  correlationId: string,
  signal: AbortSignal | undefined,
  request: typeof fetch,
  logger: TechnicalLogger,
): Promise<AdminProviderAuditReportResult> {
  if (apiBaseUrl === null || !uuidPattern.test(tenantId) || !uuidPattern.test(providerRecordId)) {
    return { status: 'error' }
  }
  try {
    const response = await request(
      apiBaseUrl + endpoint(tenantId, providerRecordId, '/' + encodeURIComponent(correlationId) + '/report'),
      { method: 'GET', signal, credentials: 'include', headers: { Accept: 'application/json' } },
    )
    if (response.status === 401) return { status: 'unauthenticated' }
    if (response.status === 404) return { status: 'not_found' }
    if (!response.ok) return { status: 'error' }
    const report = parseAdminProviderAuditReport(await response.json())
    if (report === null) {
      logger.warning('Admin provider audit report returned an invalid response.', {
        page: 'tenant_audit', action: 'load_provider_audit_report',
      })
      return { status: 'error' }
    }
    return { status: 'loaded', report }
  } catch (error: unknown) {
    if (!signal?.aborted) logError(logger, 'load_provider_audit_report', error)
    return { status: 'error' }
  }
}
