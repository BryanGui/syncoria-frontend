import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'


const applicationSource = await readFile(
  new URL('../src/App.tsx', import.meta.url),
  'utf8',
)
const integrationsPageSource = await readFile(
  new URL('../src/pages/IntegrationsPage.tsx', import.meta.url),
  'utf8',
)
const integrationCreationSource = await readFile(
  new URL('../src/pages/integrations/IntegrationCaseCreationForm.tsx', import.meta.url),
  'utf8',
)
const integrationDetailSource = await readFile(
  new URL('../src/pages/integrations/IntegrationCaseDetail.tsx', import.meta.url),
  'utf8',
)
const integrationsUiSource = [
  integrationsPageSource,
  integrationCreationSource,
  integrationDetailSource,
].join('\n')
const clientWorkspaceSource = await readFile(
  new URL('../src/pages/ClientWorkspacePage.tsx', import.meta.url),
  'utf8',
)

test('does not expose the historical Integrations page from the admin dashboard', () => {
  assert.doesNotMatch(applicationSource, /isIntegrations|<IntegrationsPage/)
  assert.doesNotMatch(applicationSource, /from '.\/pages\/IntegrationsPage'/)
})

test('does not invent integration data or expose the admin page to clients', () => {
  const renderedIntegrationContent = `${applicationSource}\n${integrationsUiSource}`

  assert.doesNotMatch(renderedIntegrationContent, /Notion connecté|Calendly actif|Novalia — en cours/)
  assert.doesNotMatch(clientWorkspaceSource, /IntegrationsPage|Administration[\s\S]*Intégrations/)
  assert.doesNotMatch(integrationsUiSource, /Novalia|Notion connecté|Calendly actif/)
})

test('uses button navigation with active and aria-current state', () => {
  assert.match(applicationSource, /aria-current=\{isActive \? 'page' : undefined\}/)
  assert.match(applicationSource, /type: 'open_page',[\s\S]*?page,/)
  assert.doesNotMatch(applicationSource, /href=[^\n]*integrations/i)
})

test('uses real tenants and keeps credential and JSON handling admin-only', () => {
  assert.match(integrationsPageSource, /fetchAdminTenants/)
  assert.match(integrationsPageSource, /\+ Nouvelle intégration/)
  assert.match(integrationDetailSource, /type="password"/)
  assert.match(integrationDetailSource, /accept="\.json,application\/json"/)
  assert.doesNotMatch(integrationsUiSource, /localStorage|sessionStorage/)
})
