import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  ADMIN_TENANT_WORKSPACE_SECTIONS,
  TENANT_WORKSPACE_SECTIONS,
  getTenantStatusLabel,
} from '../src/tenantWorkspace/model.ts'
import { beginTenantWorkspaceLoad } from '../src/tenantWorkspace/state.ts'


const tenantWorkspaceSource = await readFile(
  new URL('../src/components/TenantWorkspace.tsx', import.meta.url),
  'utf8',
)

test('defines the five requested workspace sections without invented data', () => {
  assert.deepEqual(TENANT_WORKSPACE_SECTIONS, [
    'Vue générale',
    'Données',
    'Intégrations',
    'Automatisations',
    'Logs',
  ])
})

test('defines the exact admin workspace navigation without changing tenant navigation', () => {
  assert.deepEqual(ADMIN_TENANT_WORKSPACE_SECTIONS, [
    'Vue générale',
    'Provider credentials',
    'Sources',
    'Ingestion',
    'Rapports',
    'Automatisations',
    'Logs',
  ])
  for (const legacySection of ['Données', 'Intégration', 'Audit & cartographie']) {
    assert.equal(ADMIN_TENANT_WORKSPACE_SECTIONS.includes(legacySection), false)
  }
})

test('renders admin content only for provider credentials and reports', () => {
  assert.match(
    tenantWorkspaceSource,
    /activeSection === 'Provider credentials'[\s\S]*?adminIntegration/,
  )
  assert.match(
    tenantWorkspaceSource,
    /activeSection === 'Rapports'[\s\S]*?adminReports/,
  )
})

test('keeps Sources on the existing empty placeholder while rendering admin Ingestion content', () => {
  assert.doesNotMatch(tenantWorkspaceSource, /activeSection === 'Sources'/)
  assert.match(
    tenantWorkspaceSource,
    /activeSection === 'Ingestion'[\s\S]*?adminIngestion/,
  )
  assert.match(tenantWorkspaceSource, /className="tenant-workspace__empty"/)
  assert.match(
    tenantWorkspaceSource,
    /Aucune donnée n’est affichée dans cette section pour le moment\./,
  )
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

test('displays the supported tenant lifecycle statuses in French', () => {
  assert.equal(getTenantStatusLabel('active'), 'Actif')
  assert.equal(getTenantStatusLabel('archived'), 'Archivé')
})
