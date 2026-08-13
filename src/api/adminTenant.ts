import {
  technicalLogger,
  type TechnicalLogger,
} from '../observability/logger.ts'
import type { TenantWorkspaceTenant } from '../tenantWorkspace/model.ts'

export type AdminTenantResult =
  | { status: 'loaded'; tenant: TenantWorkspaceTenant }
  | { status: 'unauthenticated' }
  | { status: 'not_found' }
  | { status: 'error' }

export type AdminTenantLifecycleResult =
  | { status: 'updated'; tenant: TenantWorkspaceTenant }
  | { status: 'unauthenticated' }
  | { status: 'not_found' }
  | { status: 'conflict' }
  | { status: 'error' }

function isTenantWorkspaceTenant(value: unknown): value is TenantWorkspaceTenant {
  return (
    typeof value === 'object'
    && value !== null
    && 'id' in value
    && typeof value.id === 'string'
    && 'slug' in value
    && typeof value.slug === 'string'
    && 'status' in value
    && (value.status === 'active' || value.status === 'archived')
  )
}

export async function fetchAdminTenant(
  apiBaseUrl: string | null,
  tenantId: string,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminTenantResult> {
  if (apiBaseUrl === null) {
    return { status: 'error' }
  }

  const endpoint = `/admin/tenants/${encodeURIComponent(tenantId)}`
  try {
    const response = await request(`${apiBaseUrl}${endpoint}`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
      method: 'GET',
      signal,
    })
    if (response.status === 401) {
      return { status: 'unauthenticated' }
    }
    if (response.status === 404) {
      return { status: 'not_found' }
    }
    if (!response.ok) {
      logger.warning('Admin tenant endpoint returned an error.', {
        page: 'tenant_workspace',
        action: 'load_admin_tenant',
        endpoint: '/admin/tenants/{tenant_id}',
        httpStatus: response.status,
      })
      return { status: 'error' }
    }

    const responsePayload: unknown = await response.json()
    if (!isTenantWorkspaceTenant(responsePayload)) {
      logger.warning('Admin tenant endpoint returned an invalid response.', {
        page: 'tenant_workspace',
        action: 'load_admin_tenant',
        endpoint: '/admin/tenants/{tenant_id}',
        errorType: 'invalid_response',
      })
      return { status: 'error' }
    }

    const { id, slug, status } = responsePayload
    return { status: 'loaded', tenant: { id, slug, status } }
  } catch (error: unknown) {
    if (!signal?.aborted) {
      logger.error('Admin tenant request failed.', {
        page: 'tenant_workspace',
        action: 'load_admin_tenant',
        endpoint: '/admin/tenants/{tenant_id}',
        errorType: error instanceof Error ? error.name : 'UnknownError',
      })
    }
    return { status: 'error' }
  }
}

async function updateAdminTenantLifecycle(
  apiBaseUrl: string | null,
  tenantId: string,
  operation: 'archive' | 'reactivate',
  request: typeof fetch,
  logger: TechnicalLogger,
): Promise<AdminTenantLifecycleResult> {
  if (apiBaseUrl === null) return { status: 'error' }

  const endpoint = `/admin/tenants/${encodeURIComponent(tenantId)}/${operation}`
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
      logger.warning('Admin tenant lifecycle endpoint returned an error.', {
        page: 'tenant_workspace',
        action: `${operation}_admin_tenant`,
        endpoint: `/admin/tenants/{tenant_id}/${operation}`,
        httpStatus: response.status,
      })
      return { status: 'error' }
    }

    const responsePayload: unknown = await response.json()
    if (!isTenantWorkspaceTenant(responsePayload)) {
      logger.warning('Admin tenant lifecycle returned an invalid response.', {
        page: 'tenant_workspace',
        action: `${operation}_admin_tenant`,
        endpoint: `/admin/tenants/{tenant_id}/${operation}`,
        errorType: 'invalid_response',
      })
      return { status: 'error' }
    }
    const { id, slug, status } = responsePayload
    return { status: 'updated', tenant: { id, slug, status } }
  } catch (error: unknown) {
    logger.error('Admin tenant lifecycle request failed.', {
      page: 'tenant_workspace',
      action: `${operation}_admin_tenant`,
      endpoint: `/admin/tenants/{tenant_id}/${operation}`,
      errorType: error instanceof Error ? error.name : 'UnknownError',
    })
    return { status: 'error' }
  }
}

export function archiveAdminTenant(
  apiBaseUrl: string | null,
  tenantId: string,
  request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminTenantLifecycleResult> {
  return updateAdminTenantLifecycle(
    apiBaseUrl,
    tenantId,
    'archive',
    request,
    logger,
  )
}

export function reactivateAdminTenant(
  apiBaseUrl: string | null,
  tenantId: string,
  request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminTenantLifecycleResult> {
  return updateAdminTenantLifecycle(
    apiBaseUrl,
    tenantId,
    'reactivate',
    request,
    logger,
  )
}
