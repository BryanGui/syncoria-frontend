import {
  technicalLogger,
  type TechnicalLogger,
} from '../observability/logger.ts'

export type AdminSessionStatus = 'authenticated' | 'unauthenticated' | 'error'
export type AdminLoginResult = 'authenticated' | 'rejected' | 'error'

interface AdminSessionResponse {
  authenticated: boolean
}

function isAdminSessionResponse(value: unknown): value is AdminSessionResponse {
  return (
    typeof value === 'object'
    && value !== null
    && 'authenticated' in value
    && typeof value.authenticated === 'boolean'
  )
}

export async function fetchAdminSession(
  apiBaseUrl: string | null,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminSessionStatus> {
  if (apiBaseUrl === null) {
    logger.warning('API base URL is not configured.', {
      page: 'login',
      action: 'load_admin_session',
      endpoint: '/admin/session',
      errorType: 'configuration_error',
    })
    return 'error'
  }

  try {
    const response = await request(`${apiBaseUrl}/admin/session`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
      method: 'GET',
      signal,
    })
    if (!response.ok) {
      logger.warning('Admin session endpoint returned an error.', {
        page: 'login',
        action: 'load_admin_session',
        endpoint: '/admin/session',
        httpStatus: response.status,
      })
      return 'error'
    }

    const responsePayload: unknown = await response.json()
    if (!isAdminSessionResponse(responsePayload)) {
      return 'error'
    }
    return responsePayload.authenticated ? 'authenticated' : 'unauthenticated'
  } catch (error: unknown) {
    if (!signal?.aborted) {
      logger.error('Admin session request failed.', {
        page: 'login',
        action: 'load_admin_session',
        endpoint: '/admin/session',
        errorType: error instanceof Error ? error.name : 'UnknownError',
      })
    }
    return 'error'
  }
}

export async function createAdminSession(
  apiBaseUrl: string | null,
  username: string,
  password: string,
  request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AdminLoginResult> {
  if (apiBaseUrl === null) {
    return 'error'
  }

  try {
    const response = await request(`${apiBaseUrl}/admin/session`, {
      body: JSON.stringify({ username, password }),
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })
    if (response.status === 401) {
      return 'rejected'
    }
    if (!response.ok) {
      logger.warning('Admin login endpoint returned an error.', {
        page: 'login',
        action: 'create_admin_session',
        endpoint: '/admin/session',
        httpStatus: response.status,
      })
      return 'error'
    }

    const responsePayload: unknown = await response.json()
    return isAdminSessionResponse(responsePayload)
      && responsePayload.authenticated
      ? 'authenticated'
      : 'error'
  } catch (error: unknown) {
    logger.error('Admin login request failed.', {
      page: 'login',
      action: 'create_admin_session',
      endpoint: '/admin/session',
      errorType: error instanceof Error ? error.name : 'UnknownError',
    })
    return 'error'
  }
}

export async function deleteAdminSession(
  apiBaseUrl: string | null,
  request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<boolean> {
  if (apiBaseUrl === null) {
    return false
  }

  try {
    const response = await request(`${apiBaseUrl}/admin/session`, {
      credentials: 'include',
      method: 'DELETE',
    })
    if (response.ok) {
      return true
    }
    logger.warning('Admin logout endpoint returned an error.', {
      page: 'dashboard',
      action: 'delete_admin_session',
      endpoint: '/admin/session',
      httpStatus: response.status,
    })
    return false
  } catch (error: unknown) {
    logger.error('Admin logout request failed.', {
      page: 'dashboard',
      action: 'delete_admin_session',
      endpoint: '/admin/session',
      errorType: error instanceof Error ? error.name : 'UnknownError',
    })
    return false
  }
}
