import {
  technicalLogger,
  type TechnicalLogger,
} from '../observability/logger.ts'
import type { TenantWorkspaceTenant } from '../tenantWorkspace/model.ts'


export interface ClientUserIdentity {
  id: string
  login: string
  displayName: string | null
  role: string
}

export interface CurrentClientUser {
  user: ClientUserIdentity
  tenant: TenantWorkspaceTenant
}

export type ClientLoginResult = 'authenticated' | 'rejected' | 'error'
export type CurrentClientUserResult =
  | { status: 'loaded'; currentUser: CurrentClientUser }
  | { status: 'unauthenticated' }
  | { status: 'error' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseCurrentClientUser(value: unknown): CurrentClientUser | null {
  if (!isRecord(value) || !isRecord(value.user) || !isRecord(value.tenant)) {
    return null
  }
  const user = value.user
  const tenant = value.tenant
  if (
    typeof user.id !== 'string'
    || typeof user.login !== 'string'
    || (user.display_name !== null && typeof user.display_name !== 'string')
    || typeof user.role !== 'string'
    || typeof tenant.id !== 'string'
    || typeof tenant.slug !== 'string'
    || typeof tenant.status !== 'string'
  ) {
    return null
  }

  return {
    user: {
      id: user.id,
      login: user.login,
      displayName: user.display_name,
      role: user.role,
    },
    tenant: {
      id: tenant.id,
      slug: tenant.slug,
      status: tenant.status,
    },
  }
}

export async function fetchCurrentClientUser(
  apiBaseUrl: string | null,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<CurrentClientUserResult> {
  if (apiBaseUrl === null) return { status: 'error' }

  try {
    const response = await request(`${apiBaseUrl}/me`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
      method: 'GET',
      signal,
    })
    if (response.status === 401) return { status: 'unauthenticated' }
    if (!response.ok) {
      logger.warning('Client session endpoint returned an error.', {
        page: 'client_login',
        action: 'load_current_client_user',
        endpoint: '/me',
        httpStatus: response.status,
      })
      return { status: 'error' }
    }

    const currentUser = parseCurrentClientUser(await response.json())
    if (currentUser === null) {
      logger.warning('Client session endpoint returned an invalid response.', {
        page: 'client_login',
        action: 'load_current_client_user',
        endpoint: '/me',
        errorType: 'invalid_response',
      })
      return { status: 'error' }
    }
    return { status: 'loaded', currentUser }
  } catch (error: unknown) {
    if (!signal?.aborted) {
      logger.error('Client session request failed.', {
        page: 'client_login',
        action: 'load_current_client_user',
        endpoint: '/me',
        errorType: error instanceof Error ? error.name : 'UnknownError',
      })
    }
    return { status: 'error' }
  }
}

export async function createClientSession(
  apiBaseUrl: string | null,
  login: string,
  password: string,
  request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<ClientLoginResult> {
  if (apiBaseUrl === null) return 'error'

  try {
    const response = await request(`${apiBaseUrl}/auth/session`, {
      body: JSON.stringify({ login, password }),
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    })
    if (response.status === 401) return 'rejected'
    if (!response.ok) {
      logger.warning('Client login endpoint returned an error.', {
        page: 'client_login',
        action: 'create_client_session',
        endpoint: '/auth/session',
        httpStatus: response.status,
      })
      return 'error'
    }
    const responsePayload: unknown = await response.json()
    return isRecord(responsePayload) && responsePayload.authenticated === true
      ? 'authenticated'
      : 'error'
  } catch (error: unknown) {
    logger.error('Client login request failed.', {
      page: 'client_login',
      action: 'create_client_session',
      endpoint: '/auth/session',
      errorType: error instanceof Error ? error.name : 'UnknownError',
    })
    return 'error'
  }
}

export async function deleteClientSession(
  apiBaseUrl: string | null,
  request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<boolean> {
  if (apiBaseUrl === null) return false

  try {
    const response = await request(`${apiBaseUrl}/auth/session`, {
      credentials: 'include',
      method: 'DELETE',
    })
    if (!response.ok) {
      logger.warning('Client logout endpoint returned an error.', {
        page: 'client_workspace',
        action: 'delete_client_session',
        endpoint: '/auth/session',
        httpStatus: response.status,
      })
      return false
    }
    return true
  } catch (error: unknown) {
    logger.error('Client logout request failed.', {
      page: 'client_workspace',
      action: 'delete_client_session',
      endpoint: '/auth/session',
      errorType: error instanceof Error ? error.name : 'UnknownError',
    })
    return false
  }
}
