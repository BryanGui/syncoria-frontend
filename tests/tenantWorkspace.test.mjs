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
const workspaceStyles = await readFile(
  new URL('../src/App.css', import.meta.url),
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

test('keeps distinct active states, focus treatment, and mobile scrolling for both tab levels', () => {
  assert.match(tenantWorkspaceSource, /tenant-workspace__tab--active/)
  assert.match(tenantWorkspaceSource, /tenant-workspace__subtab--active/)
  assert.match(workspaceStyles, /\.tenant-workspace__tab:focus-visible/)
  assert.match(workspaceStyles, /\.tenant-workspace__tab:hover/)
  assert.match(workspaceStyles, /\.tenant-workspace__subtab:focus-visible/)
  assert.match(workspaceStyles, /\.tenant-workspace__subtab:hover/)
  assert.match(workspaceStyles, /\.tenant-workspace__subtabs[\s\S]*?flex-wrap: nowrap[\s\S]*?overflow-x: auto/)
})

test('uses audit by default and keeps integration placeholders scoped to their workflow steps', () => {
  assert.match(tenantWorkspaceSource, />\('Audit & cartographie'\)/)
  assert.equal(INTEGRATION_WORKSPACE_SECTIONS.includes('Intégration des données'), true)
  assert.match(tenantWorkspaceSource, /activeSection === 'Synchronisation'/)
  assert.match(tenantWorkspaceSource, /mises à jour récurrentes après l’intégration des données/)
  assert.match(tenantWorkspaceSource, /className="tenant-workspace__empty"/)
  assert.doesNotMatch(tenantWorkspaceSource, /activeSection === 'Sources'|activeSection === 'Rapports'|activeSection === 'Ingestion'/)
})

test('renders the active integration section header without tenant-specific fixtures', () => {
  assert.match(tenantWorkspaceSource, /tenant-workspace__integration-section-heading/)
  assert.match(tenantWorkspaceSource, /className="tenant-workspace__integration-section-heading visually-hidden"/)
  assert.match(tenantWorkspaceSource, /Sources auditées, décisions retained\/excluded et rapports disponibles\./)
  assert.match(tenantWorkspaceSource, /Copie brute initiale des sources retenues vers Syncoria\./)
  assert.match(tenantWorkspaceSource, /Transformation future des données brutes en données métier Syncoria\./)
  assert.doesNotMatch(tenantWorkspaceSource, /Novalia|90|raw_payload/)
})

test('adds breathing room between workspace levels and hides repeated section headings visually', () => {
  assert.match(workspaceStyles, /\.tenant-workspace__heading \{[\s\S]*?padding: 28px 28px 20px;/)
  assert.match(workspaceStyles, /\.tenant-workspace__subtabs \{[\s\S]*?margin: 28px 24px 0;/)
  assert.match(workspaceStyles, /\.visually-hidden \{[\s\S]*?clip: rect\(0, 0, 0, 0\)/)
  assert.match(tenantWorkspaceSource, /className="visually-hidden">Synchronisation/)
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
