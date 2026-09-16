import {
  technicalLogger,
  type TechnicalLogger,
} from '../observability/logger.ts'

export const MAX_DDL_BYTES = 1024 * 1024

export type DdlValidationError = 'empty' | 'too_large' | 'invalid'

export type IntegrationWorkspaceSourceType = 'audit' | 'upload'

export interface AdminIntegrationWorkspaceSummary {
  id: string
  tenant_id: string
  source_type: IntegrationWorkspaceSourceType
  source_report_id: string | null
  source_filename: string | null
  version: number
  status: 'draft'
  created_at: string
  updated_at: string
}

export interface AdminIntegrationWorkspace extends AdminIntegrationWorkspaceSummary {
  source_ddl: string
  working_ddl: string
}

export interface AdminIntegrationWorkspaceAuditSource {
  report_id: string
  provider: string
  title: string
  report_date: string
}

export type AdminIntegrationWorkspaceResult =
  | { status: 'loaded'; workspace: AdminIntegrationWorkspace }
  | { status: 'unauthenticated' | 'not_found' | 'conflict' | 'invalid' | 'error' }

export type AdminIntegrationWorkspaceListResult =
  | { status: 'loaded'; workspaces: AdminIntegrationWorkspaceSummary[] }
  | { status: 'unauthenticated' | 'not_found' | 'error' }

export type AdminIntegrationWorkspaceAuditSourcesResult =
  | { status: 'loaded'; sources: AdminIntegrationWorkspaceAuditSource[] }
  | { status: 'unauthenticated' | 'not_found' | 'error' }

const uuidPattern = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i
const reportIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isDateTime(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

function isBoundedString(value: unknown, maximum: number): value is string {
  return typeof value === 'string'
    && value.length > 0
    && new TextEncoder().encode(value).byteLength <= maximum
}

function isNullableBoundedString(value: unknown, maximum: number): value is string | null {
  return value === null || isBoundedString(value, maximum)
}

export function getDdlValidationError(value: unknown): DdlValidationError | null {
  if (typeof value !== 'string' || value.includes('\u0000')) return 'invalid'
  if (value.trim().length === 0) return 'empty'
  if (new TextEncoder().encode(value).byteLength > MAX_DDL_BYTES) return 'too_large'
  return null
}

function parseWorkspaceSummary(value: unknown): AdminIntegrationWorkspaceSummary | null {
  if (!isObject(value)
    || !uuidPattern.test(String(value.id))
    || !uuidPattern.test(String(value.tenant_id))
    || (value.source_type !== 'audit' && value.source_type !== 'upload')
    || (value.source_report_id !== null
      && (!isBoundedString(value.source_report_id, 80)
        || !reportIdPattern.test(value.source_report_id)))
    || !isNullableBoundedString(value.source_filename, 255)
    || !Number.isSafeInteger(value.version) || (value.version as number) < 1
    || value.status !== 'draft'
    || !isDateTime(value.created_at)
    || !isDateTime(value.updated_at)) return null

  if (value.source_type === 'audit'
    ? value.source_report_id === null || value.source_filename !== null
    : value.source_report_id !== null) return null

  return {
    id: value.id as string,
    tenant_id: value.tenant_id as string,
    source_type: value.source_type,
    source_report_id: value.source_report_id as string | null,
    source_filename: value.source_filename as string | null,
    version: value.version as number,
    status: 'draft',
    created_at: value.created_at as string,
    updated_at: value.updated_at as string,
  }
}

function parseWorkspace(value: unknown): AdminIntegrationWorkspace | null {
  if (!isObject(value)) return null
  const summary = parseWorkspaceSummary(value)
  if (summary === null
    || getDdlValidationError(value.source_ddl) !== null
    || getDdlValidationError(value.working_ddl) !== null) return null
  return {
    ...summary,
    source_ddl: value.source_ddl as string,
    working_ddl: value.working_ddl as string,
  }
}

function parseAuditSource(value: unknown): AdminIntegrationWorkspaceAuditSource | null {
  if (!isObject(value)
    || !isBoundedString(value.report_id, 80)
    || !reportIdPattern.test(value.report_id)
    || !isBoundedString(value.provider, 64)
    || !reportIdPattern.test(value.provider)
    || !isBoundedString(value.title, 120)
    || typeof value.report_date !== 'string'
    || !/^\d{4}-\d{2}-\d{2}$/.test(value.report_date)) return null
  return {
    report_id: value.report_id as string,
    provider: value.provider as string,
    title: value.title as string,
    report_date: value.report_date,
  }
}

function workspaceEndpoint(tenantId: string, workspaceId?: string): string {
  const endpoint = `/admin/tenants/${encodeURIComponent(tenantId)}/integration-workspaces`
  return workspaceId === undefined ? endpoint : `${endpoint}/${encodeURIComponent(workspaceId)}`
}

function logFailure(
  logger: TechnicalLogger,
  action: string,
  httpStatus?: number,
  error?: unknown,
): void {
  logger.error('Admin integration workspace request failed.', {
    page: 'tenant_data_integration',
    action,
    endpoint: '/admin/tenants/{tenant_id}/integration-workspaces',
    ...(httpStatus === undefined ? {} : { httpStatus }),
    ...(error === undefined ? {} : { errorType: error instanceof Error ? error.name : 'UnknownError' }),
  })
}

function mapHttpStatus(
  status: number,
): Exclude<AdminIntegrationWorkspaceResult['status'], 'loaded'> | null {
  if (status === 401) return 'unauthenticated'
  if (status === 404) return 'not_found'
  if (status === 409) return 'conflict'
  if (status === 422) return 'invalid'
  return null
}

async function requestWorkspace(
  apiBaseUrl: string | null,
  tenantId: string,
  workspaceId: string | undefined,
  options: RequestInit,
  action: string,
  signal: AbortSignal | undefined,
  request: typeof fetch,
  logger: TechnicalLogger,
  suffix = '',
): Promise<AdminIntegrationWorkspaceResult> {
  if (apiBaseUrl === null || !uuidPattern.test(tenantId)
    || (workspaceId !== undefined && !uuidPattern.test(workspaceId))) return { status: 'error' }
  try {
    const response = await request(
      `${apiBaseUrl}${workspaceEndpoint(tenantId, workspaceId)}${suffix}`,
      {
        ...options,
        credentials: 'include',
        headers: { Accept: 'application/json', ...options.headers },
        signal,
      },
    )
    const mapped = mapHttpStatus(response.status)
    if (mapped !== null) return { status: mapped }
    if (!response.ok) {
      logFailure(logger, action, response.status)
      return { status: 'error' }
    }
    const workspace = parseWorkspace(await response.json())
    if (workspace === null || workspace.tenant_id !== tenantId) return { status: 'error' }
    return { status: 'loaded', workspace }
  } catch (error: unknown) {
    if (!signal?.aborted) logFailure(logger, action, undefined, error)
    return { status: 'error' }
  }
}

export async function fetchAdminIntegrationWorkspaces(
  apiBaseUrl: string | null,
  tenantId: string,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminIntegrationWorkspaceListResult> {
  if (apiBaseUrl === null || !uuidPattern.test(tenantId)) return { status: 'error' }
  try {
    const response = await request(
      `${apiBaseUrl}${workspaceEndpoint(tenantId)}`,
      { method: 'GET', credentials: 'include', headers: { Accept: 'application/json' }, signal },
    )
    if (response.status === 401) return { status: 'unauthenticated' }
    if (response.status === 404) return { status: 'not_found' }
    if (!response.ok) {
      logFailure(logger, 'load_integration_workspaces', response.status)
      return { status: 'error' }
    }
    const payload: unknown = await response.json()
    if (!Array.isArray(payload)) return { status: 'error' }
    const workspaces = payload.map(parseWorkspaceSummary)
    if (workspaces.some((workspace) => workspace === null)) return { status: 'error' }
    const validWorkspaces = workspaces as AdminIntegrationWorkspaceSummary[]
    if (validWorkspaces.some((workspace) => workspace.tenant_id !== tenantId)
      || new Set(validWorkspaces.map((workspace) => workspace.id)).size !== validWorkspaces.length) {
      return { status: 'error' }
    }
    return { status: 'loaded', workspaces: validWorkspaces }
  } catch (error: unknown) {
    if (!signal?.aborted) logFailure(logger, 'load_integration_workspaces', undefined, error)
    return { status: 'error' }
  }
}

export async function fetchAdminIntegrationWorkspace(
  apiBaseUrl: string | null,
  tenantId: string,
  workspaceId: string,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminIntegrationWorkspaceResult> {
  return requestWorkspace(
    apiBaseUrl, tenantId, workspaceId,
    { method: 'GET' }, 'load_integration_workspace', signal, request, logger,
  )
}

export async function fetchAdminIntegrationWorkspaceAuditSources(
  apiBaseUrl: string | null,
  tenantId: string,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminIntegrationWorkspaceAuditSourcesResult> {
  if (apiBaseUrl === null || !uuidPattern.test(tenantId)) return { status: 'error' }
  try {
    const response = await request(
      `${apiBaseUrl}${workspaceEndpoint(tenantId)}/audit-sources`,
      { method: 'GET', credentials: 'include', headers: { Accept: 'application/json' }, signal },
    )
    if (response.status === 401) return { status: 'unauthenticated' }
    if (response.status === 404) return { status: 'not_found' }
    if (!response.ok) {
      logFailure(logger, 'load_integration_workspace_audit_sources', response.status)
      return { status: 'error' }
    }
    const payload: unknown = await response.json()
    if (!Array.isArray(payload)) return { status: 'error' }
    const sources = payload.map(parseAuditSource)
    if (sources.some((source) => source === null)) return { status: 'error' }
    return { status: 'loaded', sources: sources as AdminIntegrationWorkspaceAuditSource[] }
  } catch (error: unknown) {
    if (!signal?.aborted) logFailure(logger, 'load_integration_workspace_audit_sources', undefined, error)
    return { status: 'error' }
  }
}

export function createAdminIntegrationWorkspaceFromAudit(
  apiBaseUrl: string | null,
  tenantId: string,
  reportId: string,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminIntegrationWorkspaceResult> {
  if (!reportIdPattern.test(reportId) || !isBoundedString(reportId, 80)) {
    return Promise.resolve({ status: 'invalid' })
  }
  return requestWorkspace(
    apiBaseUrl, tenantId, undefined,
    {
      method: 'POST',
      body: JSON.stringify({ source_report_id: reportId }),
      headers: { 'Content-Type': 'application/json' },
    },
    'create_integration_workspace_from_audit', signal, request, logger,
  )
}

export function createAdminIntegrationWorkspaceFromUpload(
  apiBaseUrl: string | null,
  tenantId: string,
  content: string,
  sourceFilename: string | null,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminIntegrationWorkspaceResult> {
  if (getDdlValidationError(content) !== null
    || (sourceFilename !== null
      && (!isBoundedString(sourceFilename, 255) || sourceFilename.includes('\u0000')))) {
    return Promise.resolve({ status: 'invalid' })
  }
  return requestWorkspace(
    apiBaseUrl, tenantId, undefined,
    {
      method: 'POST',
      body: JSON.stringify({ content, ...(sourceFilename === null ? {} : { source_filename: sourceFilename }) }),
      headers: { 'Content-Type': 'application/json' },
    },
    'create_integration_workspace_from_upload', signal, request, logger,
  )
}

export function replaceAdminIntegrationWorkspaceWorkingDdl(
  apiBaseUrl: string | null,
  tenantId: string,
  workspaceId: string,
  content: string,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminIntegrationWorkspaceResult> {
  if (getDdlValidationError(content) !== null) return Promise.resolve({ status: 'invalid' })
  return requestWorkspace(
    apiBaseUrl, tenantId, workspaceId,
    {
      method: 'PUT',
      body: JSON.stringify({ content }),
      headers: { 'Content-Type': 'application/json' },
    },
    'replace_integration_workspace_working_ddl', signal, request, logger,
    '/working-ddl',
  )
}
