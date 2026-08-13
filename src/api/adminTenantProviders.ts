import {
  technicalLogger,
  type TechnicalLogger,
} from '../observability/logger.ts'

export type AdminProvider = 'notion' | 'n8n'

export interface AdminProviderConfiguration {
  base_url?: string
  workspace_reference?: string
}

export interface AdminProviderRecord {
  id: string
  tenant_id: string
  provider: AdminProvider
  name: string
  status: string
  configuration: AdminProviderConfiguration
  credential_configured: boolean
  created_at: string
  updated_at: string
  last_verified_at: string | null
  last_verification_status: string | null
  last_verification_http_status: number | null
  last_verification_code: string | null
  last_verification_message: string | null
}

export interface ProviderVerificationResult {
  status: 'ok' | 'error'
  checked_at: string
  provider: AdminProvider
  http_status: number | null
  code: string | null
  message: string | null
}

export interface CreateAdminProviderInput {
  provider: AdminProvider
  name: string
  configuration: AdminProviderConfiguration
  secret: string
}

export interface UpdateAdminProviderInput {
  name?: string
  configuration?: AdminProviderConfiguration
  status?: string
}

export type AdminProvidersResult =
  | { status: 'loaded'; providers: AdminProviderRecord[] }
  | { status: 'unauthenticated' }
  | { status: 'error' }

export type AdminProviderMutationResult =
  | { status: 'saved'; provider: AdminProviderRecord }
  | { status: 'unauthenticated' }
  | { status: 'not_found' }
  | { status: 'conflict' }
  | { status: 'invalid' }
  | { status: 'error' }

export type AdminProviderVerificationResponse =
  | { status: 'verified'; verification: ProviderVerificationResult }
  | { status: 'unauthenticated' }
  | { status: 'not_found' }
  | { status: 'conflict' }
  | { status: 'error' }

export type DeleteAdminProviderResult =
  | { status: 'deleted' }
  | { status: 'unauthenticated' }
  | { status: 'not_found' }
  | { status: 'error' }

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || typeof value === 'number'
}

function parseConfiguration(value: unknown): AdminProviderConfiguration | null {
  if (!isObject(value)) return null
  if ('base_url' in value && typeof value.base_url !== 'string') return null
  if (
    'workspace_reference' in value
    && typeof value.workspace_reference !== 'string'
  ) return null

  const configuration: AdminProviderConfiguration = {}
  if (typeof value.base_url === 'string') configuration.base_url = value.base_url
  if (typeof value.workspace_reference === 'string') {
    configuration.workspace_reference = value.workspace_reference
  }
  return configuration
}

function parseProviderRecord(value: unknown): AdminProviderRecord | null {
  if (!isObject(value)) return null
  const configuration = parseConfiguration(value.configuration)
  if (
    typeof value.id !== 'string'
    || typeof value.tenant_id !== 'string'
    || (value.provider !== 'notion' && value.provider !== 'n8n')
    || typeof value.name !== 'string'
    || typeof value.status !== 'string'
    || configuration === null
    || typeof value.credential_configured !== 'boolean'
    || typeof value.created_at !== 'string'
    || typeof value.updated_at !== 'string'
    || !isNullableString(value.last_verified_at)
    || !isNullableString(value.last_verification_status)
    || !isNullableNumber(value.last_verification_http_status)
    || !isNullableString(value.last_verification_code)
    || !isNullableString(value.last_verification_message)
  ) return null

  return {
    id: value.id,
    tenant_id: value.tenant_id,
    provider: value.provider,
    name: value.name,
    status: value.status,
    configuration,
    credential_configured: value.credential_configured,
    created_at: value.created_at,
    updated_at: value.updated_at,
    last_verified_at: value.last_verified_at,
    last_verification_status: value.last_verification_status,
    last_verification_http_status: value.last_verification_http_status,
    last_verification_code: value.last_verification_code,
    last_verification_message: value.last_verification_message,
  }
}

function parseVerification(value: unknown): ProviderVerificationResult | null {
  if (!isObject(value)) return null
  const httpStatus = value.http_status ?? null
  const code = value.code ?? null
  const message = value.message ?? null
  if (
    (value.status !== 'ok' && value.status !== 'error')
    || typeof value.checked_at !== 'string'
    || (value.provider !== 'notion' && value.provider !== 'n8n')
    || !isNullableNumber(httpStatus)
    || !isNullableString(code)
    || !isNullableString(message)
  ) return null
  return {
    status: value.status,
    checked_at: value.checked_at,
    provider: value.provider,
    http_status: httpStatus,
    code,
    message,
  }
}

function providerEndpoint(tenantId: string, providerRecordId?: string): string {
  const tenant = encodeURIComponent(tenantId)
  const base = `/admin/tenants/${tenant}/providers`
  return providerRecordId === undefined
    ? base
    : `${base}/${encodeURIComponent(providerRecordId)}`
}

function logResponseError(
  logger: TechnicalLogger,
  action: string,
  httpStatus: number,
): void {
  logger.warning('Admin provider endpoint returned an error.', {
    page: 'tenant_integration',
    action,
    endpoint: '/admin/tenants/{tenant_id}/providers',
    httpStatus,
  })
}

function logRequestError(
  logger: TechnicalLogger,
  action: string,
  error: unknown,
): void {
  logger.error('Admin provider request failed.', {
    page: 'tenant_integration',
    action,
    endpoint: '/admin/tenants/{tenant_id}/providers',
    errorType: error instanceof Error ? error.name : 'UnknownError',
  })
}

export async function fetchAdminTenantProviders(
  apiBaseUrl: string | null,
  tenantId: string,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminProvidersResult> {
  if (apiBaseUrl === null) return { status: 'error' }
  const endpoint = providerEndpoint(tenantId)
  try {
    const response = await request(`${apiBaseUrl}${endpoint}`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
      method: 'GET',
      signal,
    })
    if (response.status === 401) return { status: 'unauthenticated' }
    if (!response.ok) {
      logResponseError(logger, 'load_admin_providers', response.status)
      return { status: 'error' }
    }
    const payload: unknown = await response.json()
    if (!Array.isArray(payload)) return { status: 'error' }
    const providers = payload.map(parseProviderRecord)
    if (providers.some((provider) => provider === null)) return { status: 'error' }
    return { status: 'loaded', providers: providers as AdminProviderRecord[] }
  } catch (error: unknown) {
    if (!signal?.aborted) logRequestError(logger, 'load_admin_providers', error)
    return { status: 'error' }
  }
}

async function saveProvider(
  apiBaseUrl: string | null,
  tenantId: string,
  method: 'POST' | 'PATCH' | 'PUT',
  body: unknown,
  providerRecordId: string | undefined,
  suffix: string,
  action: string,
  request: typeof fetch,
  logger: TechnicalLogger,
): Promise<AdminProviderMutationResult> {
  if (apiBaseUrl === null) return { status: 'error' }
  const endpoint = `${providerEndpoint(tenantId, providerRecordId)}${suffix}`
  try {
    const response = await request(`${apiBaseUrl}${endpoint}`, {
      body: JSON.stringify(body),
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      method,
    })
    if (response.status === 401) return { status: 'unauthenticated' }
    if (response.status === 404) return { status: 'not_found' }
    if (response.status === 409) return { status: 'conflict' }
    if (response.status === 422) return { status: 'invalid' }
    if (!response.ok) {
      logResponseError(logger, action, response.status)
      return { status: 'error' }
    }
    const provider = parseProviderRecord(await response.json())
    return provider === null ? { status: 'error' } : { status: 'saved', provider }
  } catch (error: unknown) {
    logRequestError(logger, action, error)
    return { status: 'error' }
  }
}

export function createAdminTenantProvider(
  apiBaseUrl: string | null,
  tenantId: string,
  input: CreateAdminProviderInput,
  request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminProviderMutationResult> {
  return saveProvider(
    apiBaseUrl, tenantId, 'POST', input, undefined, '',
    'create_admin_provider', request, logger,
  )
}

export function updateAdminTenantProvider(
  apiBaseUrl: string | null,
  tenantId: string,
  providerRecordId: string,
  input: UpdateAdminProviderInput,
  request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminProviderMutationResult> {
  return saveProvider(
    apiBaseUrl, tenantId, 'PATCH', input, providerRecordId, '',
    'update_admin_provider', request, logger,
  )
}

export function replaceAdminTenantProviderCredential(
  apiBaseUrl: string | null,
  tenantId: string,
  providerRecordId: string,
  secret: string,
  request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminProviderMutationResult> {
  return saveProvider(
    apiBaseUrl, tenantId, 'PUT', { secret }, providerRecordId, '/credential',
    'replace_admin_provider_credential', request, logger,
  )
}

export async function verifyAdminTenantProvider(
  apiBaseUrl: string | null,
  tenantId: string,
  providerRecordId: string,
  request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminProviderVerificationResponse> {
  if (apiBaseUrl === null) return { status: 'error' }
  const endpoint = `${providerEndpoint(tenantId, providerRecordId)}/verify`
  try {
    const response = await request(`${apiBaseUrl}${endpoint}`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
      method: 'POST',
    })
    if (response.status === 401) return { status: 'unauthenticated' }
    if (response.status === 404) return { status: 'not_found' }
    if (response.status === 409) return { status: 'conflict' }
    if (!response.ok) {
      logResponseError(logger, 'verify_admin_provider', response.status)
      return { status: 'error' }
    }
    const verification = parseVerification(await response.json())
    return verification === null
      ? { status: 'error' }
      : { status: 'verified', verification }
  } catch (error: unknown) {
    logRequestError(logger, 'verify_admin_provider', error)
    return { status: 'error' }
  }
}

export async function deleteAdminTenantProvider(
  apiBaseUrl: string | null,
  tenantId: string,
  providerRecordId: string,
  request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<DeleteAdminProviderResult> {
  if (apiBaseUrl === null) return { status: 'error' }
  const endpoint = providerEndpoint(tenantId, providerRecordId)
  try {
    const response = await request(`${apiBaseUrl}${endpoint}`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
      method: 'DELETE',
    })
    if (response.status === 401) return { status: 'unauthenticated' }
    if (response.status === 404) return { status: 'not_found' }
    if (!response.ok) {
      logResponseError(logger, 'delete_admin_provider', response.status)
      return { status: 'error' }
    }
    return { status: 'deleted' }
  } catch (error: unknown) {
    logRequestError(logger, 'delete_admin_provider', error)
    return { status: 'error' }
  }
}
