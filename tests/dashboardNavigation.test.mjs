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
    { activePage: 'clients' },
  )
})

test('returns from Clients to the overview', () => {
  assert.deepEqual(
    dashboardNavigationReducer(
      { activePage: 'clients' },
      { type: 'open_page', page: 'overview' },
    ),
    { activePage: 'overview' },
  )
})
