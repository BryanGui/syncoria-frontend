import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  ADMIN_TENANT_WORKSPACE_SECTIONS,
  INTEGRATION_WORKSPACE_SECTIONS,
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

test('defines the exact admin workflow navigation without changing tenant navigation', () => {
  assert.deepEqual(ADMIN_TENANT_WORKSPACE_SECTIONS, [
    'Vue générale',
    'Provider credentials',
    'Intégration',
    'Synchronisation',
    'Automatisations',
    'Logs',
  ])
  for (const legacySection of ['Données', 'Sources', 'Ingestion', 'Rapports']) {
    assert.equal(ADMIN_TENANT_WORKSPACE_SECTIONS.includes(legacySection), false)
  }
  assert.deepEqual(INTEGRATION_WORKSPACE_SECTIONS, [
    'Audit & cartographie',
    'Ingestion',
    'Intégration des données',
  ])
})

test('keeps credentials separate and composes integration through its two sub-tabs', () => {
  assert.match(
    tenantWorkspaceSource,
    /activeSection === 'Provider credentials'[\s\S]*?adminIntegration/,
  )
  assert.match(
    tenantWorkspaceSource,
    /activeSection === 'Intégration'/,
  )
  assert.match(tenantWorkspaceSource, /aria-label="Étapes d’intégration"/)
  assert.match(tenantWorkspaceSource, /activeIntegrationSection === 'Audit & cartographie'/)
  assert.match(tenantWorkspaceSource, /activeIntegrationSection === 'Ingestion'[\s\S]*?adminIngestion/)
  assert.match(tenantWorkspaceSource, /activeIntegrationSection === 'Audit & cartographie'[\s\S]*?adminReports/)
})

test('uses audit by default and keeps integration placeholders scoped to their workflow steps', () => {
  assert.match(tenantWorkspaceSource, />\('Audit & cartographie'\)/)
  assert.match(tenantWorkspaceSource, /Intégration des données/)
  assert.match(tenantWorkspaceSource, /activeSection === 'Synchronisation'/)
  assert.match(tenantWorkspaceSource, /mises à jour récurrentes après l’intégration des données/)
  assert.match(tenantWorkspaceSource, /className="tenant-workspace__empty"/)
  assert.doesNotMatch(tenantWorkspaceSource, /activeSection === 'Sources'|activeSection === 'Rapports'|activeSection === 'Ingestion'/)
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
