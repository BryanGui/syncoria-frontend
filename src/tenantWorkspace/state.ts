import type { TenantWorkspaceTenant } from './model'

export type TenantWorkspaceLoadState =
  | { status: 'loading' }
  | { status: 'loaded'; tenant: TenantWorkspaceTenant }
  | { status: 'not_found' }
  | { status: 'error' }

export function beginTenantWorkspaceLoad(): TenantWorkspaceLoadState {
  return { status: 'loading' }
}
