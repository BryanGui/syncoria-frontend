export type DashboardPage = 'overview' | 'clients'

export interface DashboardNavigationState {
  activePage: DashboardPage
}

export type DashboardNavigationAction = {
  type: 'open_page'
  page: DashboardPage
}

export const INITIAL_DASHBOARD_NAVIGATION_STATE: DashboardNavigationState = {
  activePage: 'overview',
}

export function dashboardNavigationReducer(
  _state: DashboardNavigationState,
  action: DashboardNavigationAction,
): DashboardNavigationState {
  return { activePage: action.page }
}
