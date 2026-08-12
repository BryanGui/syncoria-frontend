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

test('opens Integrations and clears a previously selected tenant', () => {
  assert.deepEqual(
    dashboardNavigationReducer(
      {
        activePage: 'tenant_workspace',
        selectedTenantId: '11111111-1111-4111-8111-111111111111',
      },
      { type: 'open_page', page: 'integrations' },
    ),
    { activePage: 'integrations', selectedTenantId: null },
  )
})

test('places the real Integrations destination immediately after Processus', () => {
  const processIndex = ADMIN_DASHBOARD_NAVIGATION.findIndex(
    (item) => item.label === 'Processus',
  )
  const integrationsItem = ADMIN_DASHBOARD_NAVIGATION[processIndex + 1]

  assert.deepEqual(integrationsItem, {
    icon: 'integrations',
    label: 'Intégrations',
    page: 'integrations',
  })
})

test('keeps Integrations active only on its page and Clients active in a tenant workspace', () => {
  assert.equal(
    isDashboardNavigationItemActive('integrations', 'integrations'),
    true,
  )
  assert.equal(isDashboardNavigationItemActive('clients', 'integrations'), false)
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
