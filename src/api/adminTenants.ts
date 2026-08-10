import {
  technicalLogger,
  type TechnicalLogger,
} from '../observability/logger.ts'

export interface AdminTenant {
  id: string
  slug: string
  status: string
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
    && 'slug' in value
    && typeof value.slug === 'string'
    && 'status' in value
    && typeof value.status === 'string'
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
      tenants: responsePayload.map(({ id, slug, status }) => ({
        id,
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
