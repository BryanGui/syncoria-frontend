export type DashboardPage =
  | 'overview'
  | 'clients'
  | 'tenant_workspace'

export type DashboardNavigationIcon =
  | 'overview'
  | 'clients'
  | 'data'
  | 'sync'
  | 'process'
  | 'integrations'

export const ADMIN_DASHBOARD_NAVIGATION: ReadonlyArray<{
  icon: DashboardNavigationIcon
  label: string
  page?: Exclude<DashboardPage, 'tenant_workspace'>
}> = [
  { icon: 'overview', label: 'Vue d’ensemble', page: 'overview' },
  { icon: 'clients', label: 'Clients', page: 'clients' },
  { icon: 'data', label: 'Données' },
  { icon: 'sync', label: 'Synchronisations' },
  { icon: 'process', label: 'Processus' },
]

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

export function isDashboardNavigationItemActive(
  page: Exclude<DashboardPage, 'tenant_workspace'>,
  activePage: DashboardPage,
): boolean {
  return activePage === page
    || (page === 'clients' && activePage === 'tenant_workspace')
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
