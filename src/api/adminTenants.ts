import {
  technicalLogger,
  type TechnicalLogger,
} from '../observability/logger.ts'
import type { TenantWorkspaceTenant } from '../tenantWorkspace/model.ts'

export interface AdminTenant extends TenantWorkspaceTenant {
  name: string
}

export type AdminTenantsResult =
  | { status: 'loaded'; tenants: AdminTenant[] }
  | { status: 'unauthenticated' }
  | { status: 'error' }

function isAdminTenant(value: unknown): value is AdminTenant {
  return (
    typeof value === 'object'
    && value !== null
    && 'id' in value
    && typeof value.id === 'string'
    && 'name' in value
    && typeof value.name === 'string'
    && 'slug' in value
    && typeof value.slug === 'string'
    && 'status' in value
    && (value.status === 'active' || value.status === 'archived')
  )
}

export async function fetchAdminTenants(
  apiBaseUrl: string | null,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminTenantsResult> {
  if (apiBaseUrl === null) {
    return { status: 'error' }
  }

  try {
    const response = await request(`${apiBaseUrl}/admin/tenants`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
      method: 'GET',
      signal,
    })
    if (response.status === 401) {
      return { status: 'unauthenticated' }
    }
    if (!response.ok) {
      logger.warning('Admin tenants endpoint returned an error.', {
        page: 'clients',
        action: 'load_admin_tenants',
        endpoint: '/admin/tenants',
        httpStatus: response.status,
      })
      return { status: 'error' }
    }

    const responsePayload: unknown = await response.json()
    if (!Array.isArray(responsePayload) || !responsePayload.every(isAdminTenant)) {
      logger.warning('Admin tenants endpoint returned an invalid response.', {
        page: 'clients',
        action: 'load_admin_tenants',
        endpoint: '/admin/tenants',
        errorType: 'invalid_response',
      })
      return { status: 'error' }
    }
    return {
      status: 'loaded',
      tenants: responsePayload.map(({ id, name, slug, status }) => ({
        id,
        name,
        slug,
        status,
      })),
    }
  } catch (error: unknown) {
    if (!signal?.aborted) {
      logger.error('Admin tenants request failed.', {
        page: 'clients',
        action: 'load_admin_tenants',
        endpoint: '/admin/tenants',
        errorType: error instanceof Error ? error.name : 'UnknownError',
      })
    }
    return { status: 'error' }
  }
}

export type CreateAdminTenantResult =
  | { status: 'created'; tenant: AdminTenant }
  | { status: 'conflict' }
  | { status: 'invalid' }
  | { status: 'unauthenticated' }
  | { status: 'error' }

export async function createAdminTenant(
  apiBaseUrl: string | null,
  input: { name: string; slug: string },
  request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<CreateAdminTenantResult> {
  if (apiBaseUrl === null) {
    return { status: 'error' }
  }

  try {
    const response = await request(`${apiBaseUrl}/admin/tenants`, {
      body: JSON.stringify(input),
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })
    if (response.status === 401) {
      return { status: 'unauthenticated' }
    }
    if (response.status === 409) {
      return { status: 'conflict' }
    }
    if (response.status === 422) {
      return { status: 'invalid' }
    }
    if (!response.ok) {
      logger.warning('Admin tenant creation endpoint returned an error.', {
        page: 'clients',
        action: 'create_admin_tenant',
        endpoint: '/admin/tenants',
        httpStatus: response.status,
      })
      return { status: 'error' }
    }

    const responsePayload: unknown = await response.json()
    if (!isAdminTenant(responsePayload)) {
      logger.warning('Admin tenant creation returned an invalid response.', {
        page: 'clients',
        action: 'create_admin_tenant',
        endpoint: '/admin/tenants',
        errorType: 'invalid_response',
      })
      return { status: 'error' }
    }
    const { id, name, slug, status } = responsePayload
    return { status: 'created', tenant: { id, name, slug, status } }
  } catch (error: unknown) {
    logger.error('Admin tenant creation request failed.', {
      page: 'clients',
      action: 'create_admin_tenant',
      endpoint: '/admin/tenants',
      errorType: error instanceof Error ? error.name : 'UnknownError',
    })
    return { status: 'error' }
  }
}
