import assert from 'node:assert/strict'
import test from 'node:test'

import { TENANT_WORKSPACE_SECTIONS } from '../src/tenantWorkspace/model.ts'
import { beginTenantWorkspaceLoad } from '../src/tenantWorkspace/state.ts'


test('defines the five requested workspace sections without invented data', () => {
  assert.deepEqual(TENANT_WORKSPACE_SECTIONS, [
    'Vue générale',
    'Données',
    'Intégrations',
    'Automatisations',
    'Logs',
  ])
})

test('starting another tenant load clears the previous tenant immediately', () => {
  const previousState = {
    status: 'loaded',
    tenant: {
      id: '11111111-1111-4111-8111-111111111111',
      slug: 'alpha',
      status: 'active',
    },
  }

  assert.notDeepEqual(previousState, beginTenantWorkspaceLoad())
  assert.deepEqual(beginTenantWorkspaceLoad(), { status: 'loading' })
  assert.doesNotMatch(JSON.stringify(beginTenantWorkspaceLoad()), /alpha/)
})
