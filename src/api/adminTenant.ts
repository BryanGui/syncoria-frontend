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

function isTenantWorkspaceTenant(value: unknown): value is TenantWorkspaceTenant {
  return (
    typeof value === 'object'
    && value !== null
    && 'id' in value
    && typeof value.id === 'string'
    && 'slug' in value
    && typeof value.slug === 'string'
    && 'status' in value
    && typeof value.status === 'string'
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
