import {
  technicalLogger,
  type TechnicalLogger,
} from '../observability/logger.ts'

export const MAX_DDL_BYTES = 1024 * 1024

export type DdlValidationError = 'empty' | 'too_large' | 'invalid'
export type IntegrationStatus = 'draft' | 'active' | 'archived'
export type IntegrationDdlKind = 'source' | 'imported'

export interface AdminIntegrationSummary {
  id: string
  tenant_id: string
  version_number: number
  display_name: string
  namespace_key: string
  status: IntegrationStatus
  based_on_integration_id: string | null
  design_note: string | null
  selected_ddl_id: string | null
  created_at: string
  updated_at: string
}

export type AdminIntegration = AdminIntegrationSummary

export interface AdminIntegrationDdlMetadata {
  id: string
  title: string
  kind: IntegrationDdlKind
  source_report_id: string | null
  source_filename: string | null
  created_at: string
  is_selected: boolean
  source_provider: string | null
  source_audit_title: string | null
  source_report_date: string | null
  source_kind?: 'audit' | 'manual'
  content_sha256?: string
  generated_at?: string
  is_default?: boolean
}

export interface AdminIntegrationDdl extends AdminIntegrationDdlMetadata {
  ddl_content: string
}

export interface AdminIntegrationIngestion {
  tenant_provider_record_id: string
  provider: string
  correlation_id: string
  status: string
  archived: boolean
  started_at: string
  completed_at: string | null
  items_received: number
  items_inserted: number
  items_duplicate: number
  created_at?: string
}

export interface AdminIntegrationProvider {
  tenant_provider_record_id: string
  provider: string
  name: string
  created_at: string
}

export type AdminIntegrationModelBuildStatus = 'prepared' | 'building' | 'completed' | 'failed'

/** Sanitized build metadata only. The DDL itself is never returned by this contract. */
export interface AdminIntegrationModelBuild {
  id: string
  integration_version_id: string
  ddl_artifact_id: string
  ddl_content_sha256: string
  physical_schema_name: string
  status: AdminIntegrationModelBuildStatus
  created_at: string
  updated_at: string
  is_current: boolean
  started_at: string | null
  completed_at: string | null
  failure_code: string | null
  table_count: number | null
  index_count: number | null
}

export type AdminIntegrationFailureStatus =
  | 'unauthenticated'
  | 'not_found'
  | 'conflict'
  | 'invalid'
  | 'error'

export interface AdminIntegrationFailure {
  status: AdminIntegrationFailureStatus
  code?: string
}

export type AdminIntegrationResult =
  | { status: 'loaded'; integration: AdminIntegration }
  | AdminIntegrationFailure

export type AdminIntegrationListResult =
  | { status: 'loaded'; integrations: AdminIntegrationSummary[] }
  | AdminIntegrationFailure

export type AdminIntegrationDdlListResult =
  | { status: 'loaded'; ddls: AdminIntegrationDdlMetadata[] }
  | AdminIntegrationFailure

export type AdminIntegrationDdlResult =
  | { status: 'loaded'; ddl: AdminIntegrationDdl }
  | AdminIntegrationFailure

export type AdminIntegrationDdlMutationResult =
  | { status: 'loaded'; ddl: AdminIntegrationDdlMetadata }
  | AdminIntegrationFailure

export type AdminIntegrationDeleteDdlResult =
  | { status: 'deleted' }
  | AdminIntegrationFailure

export type AdminIntegrationDeleteResult =
  | { status: 'deleted' }
  | AdminIntegrationFailure

export type AdminIntegrationIngestionListResult =
  | { status: 'loaded'; ingestions: AdminIntegrationIngestion[] }
  | AdminIntegrationFailure

export type AdminIntegrationIngestionResult =
  | { status: 'loaded'; ingestion: AdminIntegrationIngestion }
  | AdminIntegrationFailure

export type AdminIntegrationProviderListResult =
  | { status: 'loaded'; providers: AdminIntegrationProvider[] }
  | AdminIntegrationFailure

export type AdminIntegrationDeleteIngestionResult =
  | { status: 'deleted' }
  | AdminIntegrationFailure

export type AdminIntegrationModelBuildResult =
  | { status: 'loaded'; model: AdminIntegrationModelBuild }
  | AdminIntegrationFailure

const uuidPattern = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isDateTime(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

function isDateOnly(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function isBoundedString(value: unknown, maximum: number): value is string {
  return typeof value === 'string'
    && value.length > 0
    && new TextEncoder().encode(value).byteLength <= maximum
}

function isNullableBoundedString(value: unknown, maximum: number): value is string | null {
  return value === null || isBoundedString(value, maximum)
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

export function getDdlValidationError(value: unknown): DdlValidationError | null {
  if (typeof value !== 'string' || value.includes('\u0000')) return 'invalid'
  if (value.trim().length === 0) return 'empty'
  if (new TextEncoder().encode(value).byteLength > MAX_DDL_BYTES) return 'too_large'
  return null
}

function parseIntegration(value: unknown, tenantId: string): AdminIntegration | null {
  if (!isObject(value)
    || !uuidPattern.test(String(value.id))
    || value.tenant_id !== tenantId
    || !isNonNegativeInteger(value.version_number) || value.version_number < 1
    || !isBoundedString(value.display_name, 120)
    || !isBoundedString(value.namespace_key, 120)
    || (value.status !== 'draft' && value.status !== 'active' && value.status !== 'archived')
    || (value.based_on_integration_id !== null
      && !uuidPattern.test(String(value.based_on_integration_id)))
    || (value.design_note !== null && !isNullableBoundedString(value.design_note, 8192))
    || (value.selected_ddl_id !== null && !uuidPattern.test(String(value.selected_ddl_id)))
    || !isDateTime(value.created_at)
    || !isDateTime(value.updated_at)) return null
  return {
    id: value.id as string,
    tenant_id: value.tenant_id as string,
    version_number: value.version_number as number,
    display_name: value.display_name as string,
    namespace_key: value.namespace_key as string,
    status: value.status,
    based_on_integration_id: value.based_on_integration_id as string | null,
    design_note: value.design_note as string | null,
    selected_ddl_id: value.selected_ddl_id as string | null,
    created_at: value.created_at as string,
    updated_at: value.updated_at as string,
  }
}

function parseDdlMetadata(value: unknown): AdminIntegrationDdlMetadata | null {
  if (!isObject(value)
    || !uuidPattern.test(String(value.id))
    || !isBoundedString(value.title, 120)
    || (value.kind !== 'source' && value.kind !== 'imported')
    || (value.source_report_id !== null && !isBoundedString(value.source_report_id, 80))
    || !isNullableBoundedString(value.source_filename, 255)
    || !isDateTime(value.created_at)
    || typeof value.is_selected !== 'boolean'
    || !isNullableBoundedString(value.source_provider, 64)
    || !isNullableBoundedString(value.source_audit_title, 120)
    || (value.source_report_date !== null && !isDateOnly(value.source_report_date))) return null
  return {
    id: value.id as string,
    title: value.title as string,
    kind: value.kind,
    source_report_id: value.source_report_id as string | null,
    source_filename: value.source_filename as string | null,
    created_at: value.created_at as string,
    is_selected: value.is_selected,
    source_provider: value.source_provider as string | null,
    source_audit_title: value.source_audit_title as string | null,
    source_report_date: value.source_report_date as string | null,
  }
}

function parseDdlCandidateMetadata(value: unknown): AdminIntegrationDdlMetadata | null {
  if (!isObject(value)) return null
  const candidate = value
  const metadata = parseDdlMetadata(value)
  if (metadata === null
    || (candidate.source_kind !== 'audit' && candidate.source_kind !== 'manual')
    || typeof candidate.content_sha256 !== 'string'
    || !/^[a-f0-9]{64}$/.test(candidate.content_sha256)
    || !isDateTime(candidate.generated_at)
    || typeof candidate.is_default !== 'boolean') return null
  return {
    ...metadata,
    source_kind: candidate.source_kind,
    content_sha256: candidate.content_sha256,
    generated_at: candidate.generated_at,
    is_default: candidate.is_default,
  }
}

function parseDdlCandidate(value: unknown): AdminIntegrationDdl | null {
  if (!isObject(value) || getDdlValidationError(value.ddl_content) !== null) return null
  const metadata = parseDdlCandidateMetadata(value)
  return metadata === null ? null : { ...metadata, ddl_content: value.ddl_content as string }
}

function parseDdl(value: unknown): AdminIntegrationDdl | null {
  if (!isObject(value) || getDdlValidationError(value.ddl_content) !== null) return null
  const metadata = parseDdlMetadata(value)
  if (metadata === null) return null
  return { ...metadata, ddl_content: value.ddl_content as string }
}

function parseIngestion(value: unknown): AdminIntegrationIngestion | null {
  if (!isObject(value)
    || !uuidPattern.test(String(value.tenant_provider_record_id))
    || !isBoundedString(value.provider, 64)
    || !uuidPattern.test(String(value.correlation_id))
    || !isBoundedString(value.status, 64)
    || typeof value.archived !== 'boolean'
    || !isDateTime(value.started_at)
    || (value.completed_at !== null && !isDateTime(value.completed_at))
    || !isNonNegativeInteger(value.items_received)
    || !isNonNegativeInteger(value.items_inserted)
    || !isNonNegativeInteger(value.items_duplicate)
    || (value.created_at !== undefined && !isDateTime(value.created_at))) return null
  return {
    tenant_provider_record_id: value.tenant_provider_record_id as string,
    provider: value.provider as string,
    correlation_id: value.correlation_id as string,
    status: value.status as string,
    archived: value.archived,
    started_at: value.started_at as string,
    completed_at: value.completed_at as string | null,
    items_received: value.items_received as number,
    items_inserted: value.items_inserted as number,
    items_duplicate: value.items_duplicate as number,
    ...(typeof value.created_at === 'string' ? { created_at: value.created_at } : {}),
  }
}

function parseIntegrationProvider(value: unknown): AdminIntegrationProvider | null {
  if (!isObject(value)
    || !uuidPattern.test(String(value.tenant_provider_record_id))
    || !isBoundedString(value.provider, 64)
    || !isBoundedString(value.name, 200)
    || !isDateTime(value.created_at)) return null
  return {
    tenant_provider_record_id: value.tenant_provider_record_id as string,
    provider: value.provider as string,
    name: value.name as string,
    created_at: value.created_at as string,
  }
}

function parseModelBuild(value: unknown, integrationId: string): AdminIntegrationModelBuild | null {
  if (!isObject(value)
    || !uuidPattern.test(String(value.id))
    || value.integration_version_id !== integrationId
    || !uuidPattern.test(String(value.ddl_artifact_id))
    || typeof value.ddl_content_sha256 !== 'string'
    || !/^[a-f0-9]{64}$/i.test(value.ddl_content_sha256)
    || !isBoundedString(value.physical_schema_name, 63)
    || !/^[a-z][a-z0-9_]{0,62}$/.test(value.physical_schema_name)
    || (value.status !== 'prepared' && value.status !== 'building'
      && value.status !== 'completed' && value.status !== 'failed')
    || !isDateTime(value.created_at)
    || !isDateTime(value.updated_at)
    || typeof value.is_current !== 'boolean'
    || (value.started_at !== null && !isDateTime(value.started_at))
    || (value.completed_at !== null && !isDateTime(value.completed_at))
    || !isNullableBoundedString(value.failure_code, 64)
    || (value.table_count !== null && !isNonNegativeInteger(value.table_count))
    || (value.index_count !== null && !isNonNegativeInteger(value.index_count))) return null
  return {
    id: value.id as string,
    integration_version_id: value.integration_version_id as string,
    ddl_artifact_id: value.ddl_artifact_id as string,
    ddl_content_sha256: value.ddl_content_sha256 as string,
    physical_schema_name: value.physical_schema_name as string,
    status: value.status,
    created_at: value.created_at as string,
    updated_at: value.updated_at as string,
    is_current: value.is_current,
    started_at: value.started_at as string | null,
    completed_at: value.completed_at as string | null,
    failure_code: value.failure_code as string | null,
    table_count: value.table_count as number | null,
    index_count: value.index_count as number | null,
  }
}

function integrationEndpoint(tenantId: string, integrationId?: string): string {
  const endpoint = `/admin/tenants/${encodeURIComponent(tenantId)}/integrations`
  return integrationId === undefined ? endpoint : `${endpoint}/${encodeURIComponent(integrationId)}`
}

function logFailure(
  logger: TechnicalLogger,
  action: string,
  httpStatus?: number,
  error?: unknown,
): void {
  logger.error('Admin integration request failed.', {
    page: 'tenant_integration_versions',
    action,
    endpoint: '/admin/tenants/{tenant_id}/integrations',
    ...(httpStatus === undefined ? {} : { httpStatus }),
    ...(error === undefined ? {} : { errorType: error instanceof Error ? error.name : 'UnknownError' }),
  })
}

function mapStatus(status: number): AdminIntegrationFailureStatus | null {
  if (status === 401) return 'unauthenticated'
  if (status === 404) return 'not_found'
  if (status === 409) return 'conflict'
  if (status === 413 || status === 422) return 'invalid'
  if (status === 500) return 'error'
  return null
}

async function errorCode(response: Response): Promise<string | undefined> {
  try {
    const payload = await response.json() as unknown
    if (!isObject(payload) || !isObject(payload.detail)) return undefined
    return typeof payload.detail.code === 'string' ? payload.detail.code : undefined
  } catch {
    return undefined
  }
}

function validIdentifiers(tenantId: string, integrationId?: string): boolean {
  return uuidPattern.test(tenantId)
    && (integrationId === undefined || uuidPattern.test(integrationId))
}

async function requestPayload<T>(
  apiBaseUrl: string | null,
  tenantId: string,
  endpoint: string,
  options: RequestInit,
  action: string,
  parse: (value: unknown) => T | null,
  signal: AbortSignal | undefined,
  request: typeof fetch,
  logger: TechnicalLogger,
): Promise<{ status: 'loaded'; value: T } | AdminIntegrationFailure> {
  if (apiBaseUrl === null || !uuidPattern.test(tenantId)) return { status: 'error' }
  try {
    const response = await request(`${apiBaseUrl}${endpoint}`, {
      ...options,
      credentials: 'include',
      headers: { Accept: 'application/json', ...options.headers },
      signal,
    })
    const mapped = mapStatus(response.status)
    if (mapped !== null) {
      if (mapped === 'unauthenticated') return { status: mapped }
      const code = await errorCode(response)
      return code === undefined ? { status: mapped } : { status: mapped, code }
    }
    if (!response.ok) {
      logFailure(logger, action, response.status)
      return { status: 'error' }
    }
    const value = parse(await response.json())
    return value === null ? { status: 'error' } : { status: 'loaded', value }
  } catch (error: unknown) {
    if (!signal?.aborted) logFailure(logger, action, undefined, error)
    return { status: 'error' }
  }
}

async function requestArray<T>(
  apiBaseUrl: string | null,
  tenantId: string,
  endpoint: string,
  action: string,
  parse: (value: unknown) => T | null,
  signal: AbortSignal | undefined,
  request: typeof fetch,
  logger: TechnicalLogger,
): Promise<{ status: 'loaded'; values: T[] } | AdminIntegrationFailure> {
  const result = await requestPayload(
    apiBaseUrl, tenantId, endpoint, { method: 'GET' }, action,
    (value) => Array.isArray(value) ? value.map(parse) : null,
    signal, request, logger,
  )
  if (result.status !== 'loaded' || !Array.isArray(result.value)
    || result.value.some((value) => value === null)) {
    return result.status === 'loaded' ? { status: 'error' } : result
  }
  return { status: 'loaded', values: result.value as T[] }
}

export async function fetchAdminIntegrations(
  apiBaseUrl: string | null,
  tenantId: string,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminIntegrationListResult> {
  const result = await requestArray(
    apiBaseUrl, tenantId, integrationEndpoint(tenantId), 'load_integrations',
    (value) => parseIntegration(value, tenantId), signal, request, logger,
  )
  return result.status === 'loaded'
    ? { status: 'loaded', integrations: result.values }
    : result
}

export async function fetchAdminIntegration(
  apiBaseUrl: string | null,
  tenantId: string,
  integrationId: string,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminIntegrationResult> {
  if (!validIdentifiers(tenantId, integrationId)) return { status: 'error' }
  const result = await requestPayload(
    apiBaseUrl, tenantId, integrationEndpoint(tenantId, integrationId),
    { method: 'GET' }, 'load_integration', (value) => parseIntegration(value, tenantId),
    signal, request, logger,
  )
  return result.status === 'loaded' ? { status: 'loaded', integration: result.value } : result
}

export async function createAdminIntegration(
  apiBaseUrl: string | null,
  tenantId: string,
  displayName?: string,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminIntegrationResult> {
  const normalizedName = displayName?.trim()
  if (normalizedName !== undefined && !isBoundedString(normalizedName, 120)) return { status: 'invalid' }
  const result = await requestPayload(
    apiBaseUrl, tenantId, integrationEndpoint(tenantId), {
      method: 'POST',
      body: JSON.stringify(normalizedName ? { display_name: normalizedName } : {}),
      headers: { 'Content-Type': 'application/json' },
    }, 'create_integration', (value) => parseIntegration(value, tenantId), signal, request, logger,
  )
  return result.status === 'loaded' ? { status: 'loaded', integration: result.value } : result
}

export async function deleteAdminIntegration(
  apiBaseUrl: string | null,
  tenantId: string,
  integrationId: string,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminIntegrationDeleteResult> {
  if (!validIdentifiers(tenantId, integrationId) || apiBaseUrl === null) return { status: 'error' }
  try {
    const response = await request(`${apiBaseUrl}${integrationEndpoint(tenantId, integrationId)}`, {
      method: 'DELETE', credentials: 'include', headers: { Accept: 'application/json' }, signal,
    })
    const mapped = mapStatus(response.status)
    if (mapped !== null) {
      if (mapped === 'unauthenticated') return { status: mapped }
      const code = await errorCode(response)
      return code === undefined ? { status: mapped } : { status: mapped, code }
    }
    if (!response.ok) {
      logFailure(logger, 'delete_integration', response.status)
      return { status: 'error' }
    }
    return { status: 'deleted' }
  } catch (error: unknown) {
    if (!signal?.aborted) logFailure(logger, 'delete_integration', undefined, error)
    return { status: 'error' }
  }
}

export async function fetchAdminIntegrationProviders(
  apiBaseUrl: string | null,
  tenantId: string,
  integrationId: string,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminIntegrationProviderListResult> {
  if (!validIdentifiers(tenantId, integrationId)) return { status: 'error' }
  const result = await requestArray(
    apiBaseUrl, tenantId, `${integrationEndpoint(tenantId, integrationId)}/providers`,
    'load_integration_providers', parseIntegrationProvider, signal, request, logger,
  )
  return result.status === 'loaded'
    ? { status: 'loaded', providers: result.values }
    : result
}

export async function replaceAdminIntegrationProviders(
  apiBaseUrl: string | null,
  tenantId: string,
  integrationId: string,
  providerRecordIds: string[],
  signal?: AbortSignal,
  request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminIntegrationProviderListResult> {
  if (!validIdentifiers(tenantId, integrationId)
    || providerRecordIds.length > 100
    || providerRecordIds.some((providerId) => !uuidPattern.test(providerId))
    || new Set(providerRecordIds).size !== providerRecordIds.length) return { status: 'invalid' }
  const result = await requestPayload(
    apiBaseUrl, tenantId, `${integrationEndpoint(tenantId, integrationId)}/providers`, {
      method: 'PUT',
      body: JSON.stringify({ tenant_provider_record_ids: providerRecordIds }),
      headers: { 'Content-Type': 'application/json' },
    }, 'replace_integration_providers',
    (value) => Array.isArray(value) ? value.map(parseIntegrationProvider) : null,
    signal, request, logger,
  )
  if (result.status !== 'loaded' || !Array.isArray(result.value)
    || result.value.some((provider) => provider === null)) {
    return result.status === 'loaded' ? { status: 'error' } : result
  }
  return {
    status: 'loaded',
    providers: result.value as AdminIntegrationProvider[],
  }
}

export async function patchAdminIntegration(
  apiBaseUrl: string | null,
  tenantId: string,
  integrationId: string,
  patch: { display_name?: string; design_note?: string | null },
  signal?: AbortSignal,
  request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminIntegrationResult> {
  if (!validIdentifiers(tenantId, integrationId)) return { status: 'error' }
  const body: Record<string, string | null> = {}
  if (patch.display_name !== undefined) {
    const name = patch.display_name.trim()
    if (!isBoundedString(name, 120)) return { status: 'invalid' }
    body.display_name = name
  }
  if (patch.design_note !== undefined) {
    const note = patch.design_note?.trim() ?? null
    if (note !== null && new TextEncoder().encode(note).byteLength > 8192) return { status: 'invalid' }
    body.design_note = note
  }
  const result = await requestPayload(
    apiBaseUrl, tenantId, integrationEndpoint(tenantId, integrationId), {
      method: 'PATCH', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
    }, 'patch_integration', (value) => parseIntegration(value, tenantId), signal, request, logger,
  )
  return result.status === 'loaded' ? { status: 'loaded', integration: result.value } : result
}

export async function cloneAdminIntegration(
  apiBaseUrl: string | null,
  tenantId: string,
  integrationId: string,
  displayName?: string,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminIntegrationResult> {
  if (!validIdentifiers(tenantId, integrationId)) return { status: 'error' }
  const normalizedName = displayName?.trim()
  if (normalizedName !== undefined && !isBoundedString(normalizedName, 120)) return { status: 'invalid' }
  const result = await requestPayload(
    apiBaseUrl, tenantId, `${integrationEndpoint(tenantId, integrationId)}/clone`, {
      method: 'POST',
      body: JSON.stringify(normalizedName ? { display_name: normalizedName } : {}),
      headers: { 'Content-Type': 'application/json' },
    }, 'clone_integration', (value) => parseIntegration(value, tenantId), signal, request, logger,
  )
  return result.status === 'loaded' ? { status: 'loaded', integration: result.value } : result
}

export async function activateAdminIntegration(
  apiBaseUrl: string | null,
  tenantId: string,
  integrationId: string,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminIntegrationResult> {
  if (!validIdentifiers(tenantId, integrationId)) return { status: 'error' }
  const result = await requestPayload(
    apiBaseUrl, tenantId, `${integrationEndpoint(tenantId, integrationId)}/activate`,
    { method: 'PUT' }, 'activate_integration', (value) => parseIntegration(value, tenantId),
    signal, request, logger,
  )
  return result.status === 'loaded' ? { status: 'loaded', integration: result.value } : result
}

function ddlEndpoint(tenantId: string, integrationId: string, ddlId?: string): string {
  const endpoint = `${integrationEndpoint(tenantId, integrationId)}/ddls`
  return ddlId === undefined ? endpoint : `${endpoint}/${encodeURIComponent(ddlId)}`
}

function ddlCandidateEndpoint(tenantId: string, integrationId: string, ddlId?: string): string {
  const endpoint = `${integrationEndpoint(tenantId, integrationId)}/ddl-candidates`
  return ddlId === undefined ? endpoint : `${endpoint}/${encodeURIComponent(ddlId)}`
}

export async function fetchAdminIntegrationDdlCandidates(
  apiBaseUrl: string | null, tenantId: string, integrationId: string,
  signal?: AbortSignal, request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminIntegrationDdlListResult> {
  if (!validIdentifiers(tenantId, integrationId)) return { status: 'error' }
  const result = await requestArray(
    apiBaseUrl, tenantId, ddlCandidateEndpoint(tenantId, integrationId),
    'load_integration_ddl_candidates', (value) => parseDdlCandidateMetadata(value),
    signal, request, logger,
  )
  return result.status === 'loaded' ? { status: 'loaded', ddls: result.values } : result
}

export async function fetchAdminIntegrationDdlCandidate(
  apiBaseUrl: string | null, tenantId: string, integrationId: string, ddlId: string,
  signal?: AbortSignal, request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminIntegrationDdlResult> {
  if (!validIdentifiers(tenantId, integrationId) || !uuidPattern.test(ddlId)) return { status: 'error' }
  const result = await requestPayload(
    apiBaseUrl, tenantId, ddlCandidateEndpoint(tenantId, integrationId, ddlId),
    { method: 'GET' }, 'load_integration_ddl_candidate', (value) => parseDdlCandidate(value),
    signal, request, logger,
  )
  return result.status === 'loaded' ? { status: 'loaded', ddl: result.value } : result
}

export async function importAdminIntegrationDdlCandidate(
  apiBaseUrl: string | null, tenantId: string, integrationId: string,
  title: string, content: string, signal?: AbortSignal, request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminIntegrationDdlMutationResult> {
  if (!validIdentifiers(tenantId, integrationId)
    || title.length === 0 || title.includes('\u0000') || !isBoundedString(title, 120)) return { status: 'invalid' }
  if (getDdlValidationError(content) !== null) return { status: 'invalid' }
  const result = await requestPayload(
    apiBaseUrl, tenantId, ddlCandidateEndpoint(tenantId, integrationId), {
      method: 'POST', body: JSON.stringify({ title, content }),
      headers: { 'Content-Type': 'application/json' },
    }, 'import_integration_ddl_candidate', (value) => parseDdlCandidateMetadata(value),
    signal, request, logger,
  )
  return result.status === 'loaded' ? { status: 'loaded', ddl: result.value } : result
}

export async function selectAdminIntegrationDdlCandidate(
  apiBaseUrl: string | null, tenantId: string, integrationId: string, ddlId: string,
  signal?: AbortSignal, request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminIntegrationDdlResult> {
  if (!validIdentifiers(tenantId, integrationId) || !uuidPattern.test(ddlId)) return { status: 'error' }
  const result = await requestPayload(
    apiBaseUrl, tenantId, `${ddlCandidateEndpoint(tenantId, integrationId, ddlId)}/selection`, {
      method: 'PUT',
    }, 'select_integration_ddl_candidate', (value) => parseDdlCandidate(value), signal, request, logger,
  )
  return result.status === 'loaded' ? { status: 'loaded', ddl: result.value } : result
}

export async function renameAdminIntegrationDdlCandidate(
  apiBaseUrl: string | null, tenantId: string, integrationId: string,
  ddlId: string, title: string, signal?: AbortSignal, request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminIntegrationDdlMutationResult> {
  const normalizedTitle = title.trim()
  if (!validIdentifiers(tenantId, integrationId) || !uuidPattern.test(ddlId)
    || normalizedTitle.includes('\u0000') || !isBoundedString(normalizedTitle, 120)) return { status: 'invalid' }
  const result = await requestPayload(
    apiBaseUrl, tenantId, ddlCandidateEndpoint(tenantId, integrationId, ddlId), {
      method: 'PATCH', body: JSON.stringify({ title: normalizedTitle }),
      headers: { 'Content-Type': 'application/json' },
    }, 'rename_integration_ddl_candidate', (value) => parseDdlCandidateMetadata(value), signal, request, logger,
  )
  return result.status === 'loaded' ? { status: 'loaded', ddl: result.value } : result
}

export async function deleteAdminIntegrationDdlCandidate(
  apiBaseUrl: string | null, tenantId: string, integrationId: string,
  ddlId: string, signal?: AbortSignal, request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminIntegrationDeleteDdlResult> {
  if (!validIdentifiers(tenantId, integrationId) || !uuidPattern.test(ddlId)) return { status: 'error' }
  if (apiBaseUrl === null) return { status: 'error' }
  try {
    const response = await request(`${apiBaseUrl}${ddlCandidateEndpoint(tenantId, integrationId, ddlId)}`, {
      method: 'DELETE', credentials: 'include', headers: { Accept: 'application/json' }, signal,
    })
    const mapped = mapStatus(response.status)
    if (mapped !== null) {
      if (mapped === 'unauthenticated') return { status: mapped }
      const code = await errorCode(response)
      return code === undefined ? { status: mapped } : { status: mapped, code }
    }
    if (!response.ok) {
      logFailure(logger, 'delete_integration_ddl_candidate', response.status)
      return { status: 'error' }
    }
    return { status: 'deleted' }
  } catch (error: unknown) {
    if (!signal?.aborted) logFailure(logger, 'delete_integration_ddl_candidate', undefined, error)
    return { status: 'error' }
  }
}

export async function fetchAdminIntegrationDdls(
  apiBaseUrl: string | null, tenantId: string, integrationId: string,
  signal?: AbortSignal, request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminIntegrationDdlListResult> {
  if (!validIdentifiers(tenantId, integrationId)) return { status: 'error' }
  const result = await requestArray(
    apiBaseUrl, tenantId, ddlEndpoint(tenantId, integrationId), 'load_integration_ddls',
    (value) => parseDdlMetadata(value), signal, request, logger,
  )
  return result.status === 'loaded' ? { status: 'loaded', ddls: result.values } : result
}

export async function fetchAdminIntegrationDdl(
  apiBaseUrl: string | null, tenantId: string, integrationId: string, ddlId: string,
  signal?: AbortSignal, request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminIntegrationDdlResult> {
  if (!validIdentifiers(tenantId, integrationId) || !uuidPattern.test(ddlId)) return { status: 'error' }
  const result = await requestPayload(
    apiBaseUrl, tenantId, ddlEndpoint(tenantId, integrationId, ddlId),
    { method: 'GET' }, 'load_integration_ddl', (value) => parseDdl(value), signal, request, logger,
  )
  return result.status === 'loaded' ? { status: 'loaded', ddl: result.value } : result
}

export async function addAdminIntegrationDdlFromAudit(
  apiBaseUrl: string | null, tenantId: string, integrationId: string, reportId: string,
  signal?: AbortSignal, request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminIntegrationDdlMutationResult> {
  if (!validIdentifiers(tenantId, integrationId) || !isBoundedString(reportId, 80)) return { status: 'invalid' }
  const result = await requestPayload(
    apiBaseUrl, tenantId, `${ddlEndpoint(tenantId, integrationId)}/from-audit`, {
      method: 'POST', body: JSON.stringify({ source_report_id: reportId }),
      headers: { 'Content-Type': 'application/json' },
    }, 'add_integration_ddl_from_audit', (value) => parseDdlMetadata(value), signal, request, logger,
  )
  return result.status === 'loaded' ? { status: 'loaded', ddl: result.value } : result
}

export async function importAdminIntegrationDdl(
  apiBaseUrl: string | null, tenantId: string, integrationId: string,
  title: string, content: string, signal?: AbortSignal, request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminIntegrationDdlMutationResult> {
  if (!validIdentifiers(tenantId, integrationId)
    || title.trim().length === 0 || title !== title.trim() || title.includes('\u0000')
    || !isBoundedString(title, 120)) return { status: 'invalid' }
  if (getDdlValidationError(content) !== null) return { status: 'invalid' }
  const result = await requestPayload(
    apiBaseUrl, tenantId, ddlEndpoint(tenantId, integrationId), {
      method: 'POST', body: JSON.stringify({ title, content }),
      headers: { 'Content-Type': 'application/json' },
    }, 'import_integration_ddl', (value) => parseDdlMetadata(value), signal, request, logger,
  )
  return result.status === 'loaded' ? { status: 'loaded', ddl: result.value } : result
}

export async function renameAdminIntegrationDdl(
  apiBaseUrl: string | null, tenantId: string, integrationId: string,
  ddlId: string, title: string, signal?: AbortSignal, request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminIntegrationDdlMutationResult> {
  const normalizedTitle = title.trim()
  if (!validIdentifiers(tenantId, integrationId) || !uuidPattern.test(ddlId)
    || normalizedTitle.includes('\u0000') || !isBoundedString(normalizedTitle, 120)) return { status: 'invalid' }
  const result = await requestPayload(
    apiBaseUrl, tenantId, ddlEndpoint(tenantId, integrationId, ddlId), {
      method: 'PATCH', body: JSON.stringify({ title: normalizedTitle }),
      headers: { 'Content-Type': 'application/json' },
    }, 'rename_integration_ddl', (value) => parseDdlMetadata(value), signal, request, logger,
  )
  return result.status === 'loaded' ? { status: 'loaded', ddl: result.value } : result
}

export async function deleteAdminIntegrationDdl(
  apiBaseUrl: string | null, tenantId: string, integrationId: string,
  ddlId: string, signal?: AbortSignal, request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminIntegrationDeleteDdlResult> {
  if (!validIdentifiers(tenantId, integrationId) || !uuidPattern.test(ddlId)) return { status: 'error' }
  if (apiBaseUrl === null) return { status: 'error' }
  try {
    const response = await request(`${apiBaseUrl}${ddlEndpoint(tenantId, integrationId, ddlId)}`, {
      method: 'DELETE', credentials: 'include', headers: { Accept: 'application/json' }, signal,
    })
    const mapped = mapStatus(response.status)
    if (mapped !== null) {
      if (mapped === 'unauthenticated') return { status: mapped }
      const code = await errorCode(response)
      return code === undefined ? { status: mapped } : { status: mapped, code }
    }
    if (!response.ok) {
      logFailure(logger, 'delete_integration_ddl', response.status)
      return { status: 'error' }
    }
    return { status: 'deleted' }
  } catch (error: unknown) {
    if (!signal?.aborted) logFailure(logger, 'delete_integration_ddl', undefined, error)
    return { status: 'error' }
  }
}

export async function selectAdminIntegrationDdl(
  apiBaseUrl: string | null, tenantId: string, integrationId: string, ddlId: string,
  signal?: AbortSignal, request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminIntegrationDdlResult> {
  if (!validIdentifiers(tenantId, integrationId) || !uuidPattern.test(ddlId)) return { status: 'error' }
  const result = await requestPayload(
    apiBaseUrl, tenantId, `${ddlEndpoint(tenantId, integrationId, ddlId)}/selection`, {
      method: 'PUT',
    }, 'select_integration_ddl', (value) => parseDdl(value), signal, request, logger,
  )
  return result.status === 'loaded' ? { status: 'loaded', ddl: result.value } : result
}

function ingestionEndpoint(tenantId: string, integrationId: string, providerRecordId?: string): string {
  const endpoint = `${integrationEndpoint(tenantId, integrationId)}/ingestions`
  return providerRecordId === undefined ? endpoint : `${endpoint}/${encodeURIComponent(providerRecordId)}`
}

function modelEndpoint(tenantId: string, integrationId: string, action?: 'prepare' | 'build'): string {
  const endpoint = `${integrationEndpoint(tenantId, integrationId)}/model`
  return action === undefined ? endpoint : `${endpoint}/${action}`
}

export async function fetchAdminIntegrationModel(
  apiBaseUrl: string | null, tenantId: string, integrationId: string,
  signal?: AbortSignal, request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminIntegrationModelBuildResult> {
  if (!validIdentifiers(tenantId, integrationId)) return { status: 'error' }
  const result = await requestPayload(
    apiBaseUrl, tenantId, modelEndpoint(tenantId, integrationId),
    { method: 'GET' }, 'load_integration_model', (value) => parseModelBuild(value, integrationId),
    signal, request, logger,
  )
  return result.status === 'loaded' ? { status: 'loaded', model: result.value } : result
}

export async function prepareAdminIntegrationModel(
  apiBaseUrl: string | null, tenantId: string, integrationId: string,
  signal?: AbortSignal, request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminIntegrationModelBuildResult> {
  if (!validIdentifiers(tenantId, integrationId)) return { status: 'error' }
  const result = await requestPayload(
    apiBaseUrl, tenantId, modelEndpoint(tenantId, integrationId, 'prepare'),
    { method: 'POST' }, 'prepare_integration_model', (value) => parseModelBuild(value, integrationId),
    signal, request, logger,
  )
  return result.status === 'loaded' ? { status: 'loaded', model: result.value } : result
}

export async function buildAdminIntegrationModel(
  apiBaseUrl: string | null, tenantId: string, integrationId: string,
  signal?: AbortSignal, request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminIntegrationModelBuildResult> {
  if (!validIdentifiers(tenantId, integrationId)) return { status: 'error' }
  const result = await requestPayload(
    apiBaseUrl, tenantId, modelEndpoint(tenantId, integrationId, 'build'),
    // The backend rejects a body here. In particular, do not add Content-Type.
    { method: 'POST' }, 'build_integration_model', (value) => parseModelBuild(value, integrationId),
    signal, request, logger,
  )
  return result.status === 'loaded' ? { status: 'loaded', model: result.value } : result
}

export async function fetchAdminIntegrationIngestions(
  apiBaseUrl: string | null, tenantId: string, integrationId: string,
  signal?: AbortSignal, request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminIntegrationIngestionListResult> {
  if (!validIdentifiers(tenantId, integrationId)) return { status: 'error' }
  const result = await requestArray(
    apiBaseUrl, tenantId, ingestionEndpoint(tenantId, integrationId), 'load_integration_ingestions',
    (value) => parseIngestion(value), signal, request, logger,
  )
  return result.status === 'loaded' ? { status: 'loaded', ingestions: result.values } : result
}

export async function fetchAdminIntegrationIngestionCandidates(
  apiBaseUrl: string | null, tenantId: string, integrationId: string,
  signal?: AbortSignal, request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminIntegrationIngestionListResult> {
  if (!validIdentifiers(tenantId, integrationId)) return { status: 'error' }
  const result = await requestArray(
    apiBaseUrl, tenantId, `${integrationEndpoint(tenantId, integrationId)}/ingestion-candidates`,
    'load_integration_ingestion_candidates', (value) => parseIngestion(value), signal, request, logger,
  )
  return result.status === 'loaded' ? { status: 'loaded', ingestions: result.values } : result
}

export async function selectAdminIntegrationIngestion(
  apiBaseUrl: string | null, tenantId: string, integrationId: string,
  providerRecordId: string, correlationId: string, signal?: AbortSignal,
  request: typeof fetch = fetch, logger: TechnicalLogger = technicalLogger,
): Promise<AdminIntegrationIngestionResult> {
  if (!validIdentifiers(tenantId, integrationId)
    || !uuidPattern.test(providerRecordId) || !uuidPattern.test(correlationId)) return { status: 'error' }
  const result = await requestPayload(
    apiBaseUrl, tenantId, ingestionEndpoint(tenantId, integrationId, providerRecordId), {
      method: 'PUT', body: JSON.stringify({ correlation_id: correlationId }),
      headers: { 'Content-Type': 'application/json' },
    }, 'select_integration_ingestion', (value) => parseIngestion(value), signal, request, logger,
  )
  return result.status === 'loaded' ? { status: 'loaded', ingestion: result.value } : result
}

export async function deleteAdminIntegrationIngestion(
  apiBaseUrl: string | null, tenantId: string, integrationId: string,
  providerRecordId: string, signal?: AbortSignal, request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminIntegrationDeleteIngestionResult> {
  if (!validIdentifiers(tenantId, integrationId) || !uuidPattern.test(providerRecordId)) return { status: 'error' }
  if (apiBaseUrl === null) return { status: 'error' }
  try {
    const response = await request(`${apiBaseUrl}${ingestionEndpoint(tenantId, integrationId, providerRecordId)}`, {
      method: 'DELETE', credentials: 'include', headers: { Accept: 'application/json' }, signal,
    })
    const mapped = mapStatus(response.status)
    if (mapped !== null) {
      if (mapped === 'unauthenticated') return { status: mapped }
      const code = await errorCode(response)
      return code === undefined ? { status: mapped } : { status: mapped, code }
    }
    if (!response.ok) {
      logFailure(logger, 'delete_integration_ingestion', response.status)
      return { status: 'error' }
    }
    return { status: 'deleted' }
  } catch (error: unknown) {
    if (!signal?.aborted) logFailure(logger, 'delete_integration_ingestion', undefined, error)
    return { status: 'error' }
  }
}
