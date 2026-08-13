import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ADMIN_DASHBOARD_NAVIGATION,
  dashboardNavigationReducer,
  INITIAL_DASHBOARD_NAVIGATION_STATE,
  isDashboardNavigationItemActive,
} from '../src/navigation/dashboardNavigation.ts'


test('opens Clients without a document navigation', () => {
  assert.deepEqual(
    dashboardNavigationReducer(INITIAL_DASHBOARD_NAVIGATION_STATE, {
      type: 'open_page',
      page: 'clients',
    }),
    { activePage: 'clients', selectedTenantId: null },
  )
})

test('does not expose a global Integrations destination', () => {
  assert.equal(
    ADMIN_DASHBOARD_NAVIGATION.some((item) => item.label === 'Intégrations'),
    false,
  )
  assert.equal(
    ADMIN_DASHBOARD_NAVIGATION.some((item) => item.page === 'integrations'),
    false,
  )
})

test('keeps Clients active in a tenant workspace', () => {
  assert.equal(isDashboardNavigationItemActive('clients', 'tenant_workspace'), true)
})

test('opens a selected client in the shared tenant workspace', () => {
  assert.deepEqual(
    dashboardNavigationReducer(INITIAL_DASHBOARD_NAVIGATION_STATE, {
      type: 'open_tenant',
      tenantId: '11111111-1111-4111-8111-111111111111',
    }),
    {
      activePage: 'tenant_workspace',
      selectedTenantId: '11111111-1111-4111-8111-111111111111',
    },
  )
})

test('returns from Clients to the overview', () => {
  assert.deepEqual(
    dashboardNavigationReducer(
      {
        activePage: 'tenant_workspace',
        selectedTenantId: '11111111-1111-4111-8111-111111111111',
      },
      { type: 'open_page', page: 'overview' },
    ),
    { activePage: 'overview', selectedTenantId: null },
  )
})

test('returns from a tenant workspace to Clients and clears the tenant', () => {
  assert.deepEqual(
    dashboardNavigationReducer(
      {
        activePage: 'tenant_workspace',
        selectedTenantId: '11111111-1111-4111-8111-111111111111',
      },
      { type: 'open_page', page: 'clients' },
    ),
    { activePage: 'clients', selectedTenantId: null },
  )
})
