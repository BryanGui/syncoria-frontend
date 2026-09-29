import { technicalLogger, type TechnicalLogger } from '../observability/logger.ts'

export type TenantRole = 'tenant_admin' | 'member' | 'viewer'
export type TenantUserStatus = 'active' | 'disabled'
export type AccessPermission = 'analytics:view' | 'analytics:write' | 'agent:use' | 'access:manage'
export type Capability = 'analytics' | 'agent'

export interface Entitlements {
  access: boolean
  analytics: boolean
  agent: boolean
}

export interface TenantAccess {
  tenant_id: string
  tenant_status: 'active' | 'archived'
  entitlements: Entitlements
  provisioning: { status: 'ready' | 'pending' | 'error' | 'disabled'; role_name: string | null }
}

export interface TenantUser {
  id: string
  login: string
  display_name: string | null
  role: TenantRole
  status: TenantUserStatus
}

export interface TenantUserAccess {
  tenant_id: string
  user_id: string
  role: TenantRole
  user_status: TenantUserStatus
  entitlements: Entitlements
  overrides: Partial<Record<AccessPermission, boolean>>
  permissions: AccessPermission[]
}

export type AccessResult<T> =
  | { status: 'loaded'; data: T }
  | { status: 'unauthenticated' | 'not_found' | 'conflict' | 'error' }

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const permissions: AccessPermission[] = ['analytics:view', 'analytics:write', 'agent:use', 'access:manage']
const roles: TenantRole[] = ['tenant_admin', 'member', 'viewer']
const userStatuses: TenantUserStatus[] = ['active', 'disabled']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isEntitlements(value: unknown): value is Entitlements {
  return isRecord(value) && typeof value.access === 'boolean'
    && typeof value.analytics === 'boolean' && typeof value.agent === 'boolean'
}

function isTenantAccess(value: unknown): value is TenantAccess {
  if (!isRecord(value) || !isRecord(value.provisioning)) return false
  return typeof value.tenant_id === 'string'
    && (value.tenant_status === 'active' || value.tenant_status === 'archived')
    && isEntitlements(value.entitlements)
    && ['ready', 'pending', 'error', 'disabled'].includes(String(value.provisioning.status))
    && (value.provisioning.role_name === null || typeof value.provisioning.role_name === 'string')
}

function isTenantUser(value: unknown): value is TenantUser {
  return isRecord(value) && typeof value.id === 'string'
    && typeof value.login === 'string'
    && (value.display_name === null || typeof value.display_name === 'string')
    && roles.includes(value.role as TenantRole)
    && userStatuses.includes(value.status as TenantUserStatus)
}

function isTenantUsers(value: unknown): value is TenantUser[] {
  return Array.isArray(value) && value.every(isTenantUser)
}

function isUserAccess(value: unknown): value is TenantUserAccess {
  return isRecord(value) && typeof value.tenant_id === 'string'
    && typeof value.user_id === 'string'
    && roles.includes(value.role as TenantRole)
    && userStatuses.includes(value.user_status as TenantUserStatus)
    && isEntitlements(value.entitlements)
    && isRecord(value.overrides)
    && Object.entries(value.overrides).every(([permission, allowed]) =>
      permissions.includes(permission as AccessPermission) && typeof allowed === 'boolean')
    && Array.isArray(value.permissions)
    && value.permissions.every((permission: unknown) => permissions.includes(permission as AccessPermission))
}

function isEntitlementsResponse(value: unknown): value is { entitlements: Entitlements } {
  return isRecord(value) && isEntitlements(value.entitlements)
}

function isEmptyResponse(value: unknown): value is null {
  return value === null
}

async function accessRequest<T>(
  apiBaseUrl: string | null,
  endpoint: string,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT',
  validate: (value: unknown) => value is T,
  body?: object,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<AccessResult<T>> {
  if (apiBaseUrl === null) return { status: 'error' }
  try {
    const response = await request(`${apiBaseUrl}${endpoint}`, {
      method,
      credentials: 'include',
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal,
    })
    if (response.status === 401) return { status: 'unauthenticated' }
    if (response.status === 404) return { status: 'not_found' }
    if (response.status === 409) return { status: 'conflict' }
    if (!response.ok) {
      logger.warning('Admin access endpoint returned an error.', {
        page: 'tenant_access', action: method.toLowerCase(), httpStatus: response.status,
      })
      return { status: 'error' }
    }
    const payload: unknown = response.status === 204 ? null : await response.json()
    if (!validate(payload)) {
      logger.warning('Admin access endpoint returned an invalid response.', {
        page: 'tenant_access', action: method.toLowerCase(), errorType: 'invalid_response',
      })
      return { status: 'error' }
    }
    return { status: 'loaded', data: payload }
  } catch (error: unknown) {
    if (!signal?.aborted) {
      logger.error('Admin access request failed.', {
        page: 'tenant_access', action: method.toLowerCase(),
        errorType: error instanceof Error ? error.name : 'UnknownError',
      })
    }
    return { status: 'error' }
  }
}

function tenantPath(tenantId: string): string | null {
  return uuidPattern.test(tenantId) ? `/admin/tenants/${encodeURIComponent(tenantId)}` : null
}

function userPath(tenantId: string, userId: string): string | null {
  const base = tenantPath(tenantId)
  return base && uuidPattern.test(userId) ? `${base}/users/${encodeURIComponent(userId)}` : null
}

export function fetchTenantAccess(base: string | null, tenantId: string, signal?: AbortSignal, request?: typeof fetch) {
  const path = tenantPath(tenantId)
  return path ? accessRequest(base, `${path}/access`, 'GET', isTenantAccess, undefined, signal, request)
    : Promise.resolve({ status: 'error' } as AccessResult<TenantAccess>)
}

export function updateTenantEntitlement(base: string | null, tenantId: string, capability: Capability, enabled: boolean, request?: typeof fetch) {
  const path = tenantPath(tenantId)
  return path ? accessRequest(base, `${path}/entitlements`, 'PATCH', isEntitlementsResponse, { entitlements: { [capability]: enabled } }, undefined, request)
    : Promise.resolve({ status: 'error' } as AccessResult<{ entitlements: Entitlements }>)
}

export function fetchTenantUsers(base: string | null, tenantId: string, signal?: AbortSignal, request?: typeof fetch) {
  const path = tenantPath(tenantId)
  return path ? accessRequest(base, `${path}/users`, 'GET', isTenantUsers, undefined, signal, request)
    : Promise.resolve({ status: 'error' } as AccessResult<TenantUser[]>)
}

export function createTenantUser(base: string | null, tenantId: string, user: { login: string; display_name: string | null; password: string; role: TenantRole }, request?: typeof fetch) {
  const path = tenantPath(tenantId)
  return path ? accessRequest(base, `${path}/users`, 'POST', isTenantUser, user, undefined, request)
    : Promise.resolve({ status: 'error' } as AccessResult<TenantUser>)
}

export function updateTenantUser(base: string | null, tenantId: string, userId: string, change: { role?: TenantRole; status?: TenantUserStatus }, request?: typeof fetch) {
  const path = userPath(tenantId, userId)
  return path ? accessRequest(base, path, 'PATCH', isTenantUser, change, undefined, request)
    : Promise.resolve({ status: 'error' } as AccessResult<TenantUser>)
}

export function fetchTenantUserAccess(base: string | null, tenantId: string, userId: string, signal?: AbortSignal, request?: typeof fetch) {
  const path = userPath(tenantId, userId)
  return path ? accessRequest(base, `${path}/access`, 'GET', isUserAccess, undefined, signal, request)
    : Promise.resolve({ status: 'error' } as AccessResult<TenantUserAccess>)
}

export function updateTenantUserOverride(base: string | null, tenantId: string, userId: string, permission: AccessPermission, allowed: boolean | null, request?: typeof fetch) {
  const path = userPath(tenantId, userId)
  return path ? accessRequest(base, `${path}/override`, 'PUT', isUserAccess, { permission, allowed }, undefined, request)
    : Promise.resolve({ status: 'error' } as AccessResult<TenantUserAccess>)
}

export function revokeTenantUserSessions(base: string | null, tenantId: string, userId: string, request?: typeof fetch) {
  const path = userPath(tenantId, userId)
  return path ? accessRequest(base, `${path}/revoke-sessions`, 'POST', isEmptyResponse, undefined, undefined, request)
    : Promise.resolve({ status: 'error' } as AccessResult<null>)
}
