export type DashboardPage = 'overview' | 'clients' | 'tenant_workspace'

export interface DashboardNavigationState {
  activePage: DashboardPage
  selectedTenantId: string | null
}

export type DashboardNavigationAction =
  | { type: 'open_page'; page: Exclude<DashboardPage, 'tenant_workspace'> }
  | { type: 'open_tenant'; tenantId: string }

export const INITIAL_DASHBOARD_NAVIGATION_STATE: DashboardNavigationState = {
  activePage: 'overview',
  selectedTenantId: null,
}

export function dashboardNavigationReducer(
  _state: DashboardNavigationState,
  action: DashboardNavigationAction,
): DashboardNavigationState {
  if (action.type === 'open_tenant') {
    return {
      activePage: 'tenant_workspace',
      selectedTenantId: action.tenantId,
    }
  }
  return { activePage: action.page, selectedTenantId: null }
}
