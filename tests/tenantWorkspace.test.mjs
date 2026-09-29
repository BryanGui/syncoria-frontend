import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  ADMIN_TENANT_GROUPS,
  ADMIN_TENANT_WORKSPACE_SECTIONS,
  TENANT_WORKSPACE_SECTIONS,
  getTenantStatusLabel,
} from '../src/tenantWorkspace/model.ts'
import { beginTenantWorkspaceLoad } from '../src/tenantWorkspace/state.ts'

const workspace = await readFile(new URL('../src/components/TenantWorkspace.tsx', import.meta.url), 'utf8')
const navigation = await readFile(new URL('../src/components/TenantNavigation.tsx', import.meta.url), 'utf8')
const chat = await readFile(new URL('../src/components/TenantChatDrawer.tsx', import.meta.url), 'utf8')
const dashboard = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const styles = await readFile(new URL('../src/App.css', import.meta.url), 'utf8')

test('defines the contextual destinations without exposing admin access to clients', () => {
  assert.deepEqual(TENANT_WORKSPACE_SECTIONS, ['Vue générale', 'Logs', 'Superset'])
  assert.deepEqual(ADMIN_TENANT_WORKSPACE_SECTIONS, [
    'Vue générale', 'Audit', 'Ingestion', 'Intégration', 'Sources', 'Accès',
    'Synchronisations', 'Workflows', 'Logs', 'Superset',
  ])
  for (const absent of ['Données', 'Connexions', 'Analyses']) {
    assert.equal(ADMIN_TENANT_WORKSPACE_SECTIONS.includes(absent), false)
  }
  assert.equal(TENANT_WORKSPACE_SECTIONS.includes('Accès'), false)
})

test('groups pipeline, configuration and automations at one level', () => {
  assert.deepEqual(ADMIN_TENANT_GROUPS, [
    { label: 'Pipeline', sections: ['Ingestion', 'Intégration'] },
    { label: 'Configuration', sections: ['Sources', 'Accès'] },
    { label: 'Automatisations', sections: ['Synchronisations', 'Workflows'] },
  ])
  assert.match(navigation, /aria-expanded=\{openGroups\[group\.label\]\}/)
  assert.match(navigation, /onClick=\{\(\) => setOpenGroups/)
  assert.match(navigation, /aria-label="Navigation du client"/)
  assert.match(navigation, /← Tous les clients/)
  assert.match(navigation, /destination\('Audit'\)/)
  assert.match(navigation, /destination\('Logs'\)/)
})

test('uses the existing sidebar and removes horizontal workspace tabs', () => {
  assert.match(dashboard, /tenantSidebarTarget/)
  assert.match(dashboard, /sidebar--tenant/)
  assert.match(workspace, /createPortal\(navigation, sidebarTarget\)/)
  assert.doesNotMatch(workspace, /tenant-workspace__tabs|tenant-workspace__subtabs/)
  assert.doesNotMatch(styles, /\.tenant-workspace__tabs/)
  assert.match(styles, /\.tenant-navigation__item:focus-visible/)
  assert.match(styles, /\.tenant-navigation__mobile-toggle/)
})

test('routes existing admin modules while preserving the Superset placeholder', () => {
  assert.match(workspace, /activeSection === 'Sources'[\s\S]*?adminIntegration/)
  assert.match(workspace, /activeSection === 'Accès'[\s\S]*?adminAccess/)
  assert.match(workspace, /activeSection === 'Audit'[\s\S]*?adminReports/)
  assert.match(workspace, /activeSection === 'Ingestion'[\s\S]*?adminIngestion/)
  assert.match(workspace, /activeSection === 'Intégration'[\s\S]*?adminVersionedIntegration/)
  assert.match(workspace, /activeSection === 'Superset'[\s\S]*?Visualisation des données/)
  assert.match(workspace, /Les tableaux de bord Superset seront disponibles ici/)
})

test('opens Chat IA beside the current section with keyboard dismissal', () => {
  assert.match(navigation, /onOpenChat\(\)/)
  assert.match(workspace, /chatOpen && createPortal\(<TenantChatDrawer/)
  assert.match(chat, /event\.key === 'Escape'/)
  assert.match(chat, /Fermer le Chat IA/)
  assert.match(chat, /Réduire le Chat IA/)
  assert.match(chat, /Agrandir le Chat IA/)
  assert.match(chat, /Le chat IA sera disponible ici/)
  assert.match(chat, /disabled id="tenant-chat-input"/)
  assert.doesNotMatch(chat, /window\.open|fetch\(|OpenAI|Anthropic|Codex/)
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
