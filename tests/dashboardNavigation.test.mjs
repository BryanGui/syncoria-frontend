import assert from 'node:assert/strict'
import test from 'node:test'

import {
  dashboardNavigationReducer,
  INITIAL_DASHBOARD_NAVIGATION_STATE,
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
