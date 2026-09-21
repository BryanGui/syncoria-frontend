import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  ADMIN_TENANT_WORKSPACE_SECTIONS,
  TENANT_WORKSPACE_SECTIONS,
  getTenantStatusLabel,
} from '../src/tenantWorkspace/model.ts'
import { beginTenantWorkspaceLoad } from '../src/tenantWorkspace/state.ts'

const tenantWorkspaceSource = await readFile(new URL('../src/components/TenantWorkspace.tsx', import.meta.url), 'utf8')
const workspaceStyles = await readFile(new URL('../src/App.css', import.meta.url), 'utf8')

test('keeps the standard tenant sections unchanged', () => {
  assert.deepEqual(TENANT_WORKSPACE_SECTIONS, [
    'Vue générale',
    'Données',
    'Intégrations',
    'Automatisations',
    'Logs',
  ])
})

test('defines the exact admin workflow navigation', () => {
  assert.deepEqual(ADMIN_TENANT_WORKSPACE_SECTIONS, [
    'Vue générale',
    'Données',
    'Connexions',
    'Audit',
    'Ingestion',
    'Intégration',
    'Synchronisation',
    'Automatisations',
    'Logs',
  ])
  for (const legacySection of ['Provider credentials', 'Audit & intégration', 'Audit & cartographie', 'Intégration des données']) {
    assert.equal(ADMIN_TENANT_WORKSPACE_SECTIONS.includes(legacySection), false)
  }
})

test('routes each admin section to its dedicated content without legacy subtabs', () => {
  assert.match(tenantWorkspaceSource, /activeSection === 'Données'[\s\S]*?adminData/)
  assert.match(tenantWorkspaceSource, /activeSection === 'Connexions'[\s\S]*?adminIntegration/)
  assert.match(tenantWorkspaceSource, /activeSection === 'Audit'[\s\S]*?adminReports/)
  assert.match(tenantWorkspaceSource, /activeSection === 'Ingestion'[\s\S]*?adminIngestion/)
  assert.match(tenantWorkspaceSource, /activeSection === 'Intégration'[\s\S]*?adminVersionedIntegration/)
  assert.doesNotMatch(tenantWorkspaceSource, /INTEGRATION_WORKSPACE_SECTIONS|activeIntegrationSection|tenant-workspace__subtabs|Audit & intégration/)
  assert.doesNotMatch(tenantWorkspaceSource, /Espace tenant/)
})

test('keeps keyboard focus treatment and mobile navigation scrolling', () => {
  assert.match(tenantWorkspaceSource, /tenant-workspace__tab--active/)
  assert.match(workspaceStyles, /\.tenant-workspace__tab:focus-visible/)
  assert.match(workspaceStyles, /\.tenant-workspace__tab:hover/)
  assert.match(workspaceStyles, /\.tenant-workspace__tabs[\s\S]*?overflow-x: auto/)
  assert.match(tenantWorkspaceSource, /className="visually-hidden">Synchronisation/)
})

test('starting another tenant load clears the previous tenant immediately', () => {
  const previousState = { status: 'loaded', tenant: { id: '11111111-1111-4111-8111-111111111111', slug: 'alpha', status: 'active' } }
  assert.notDeepEqual(previousState, beginTenantWorkspaceLoad())
  assert.deepEqual(beginTenantWorkspaceLoad(), { status: 'loading' })
  assert.doesNotMatch(JSON.stringify(beginTenantWorkspaceLoad()), /alpha/)
})

test('displays supported tenant lifecycle statuses in French', () => {
  assert.equal(getTenantStatusLabel('active'), 'Actif')
  assert.equal(getTenantStatusLabel('archived'), 'Archivé')
})
