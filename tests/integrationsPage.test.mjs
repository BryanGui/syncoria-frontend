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
const clientWorkspaceSource = await readFile(
  new URL('../src/pages/ClientWorkspacePage.tsx', import.meta.url),
  'utf8',
)

test('renders the Integrations header and empty state through the admin dashboard', () => {
  assert.match(applicationSource, /isIntegrations[\s\S]*?'Intégrations'/)
  assert.match(
    applicationSource,
    /Préparez et suivez les intégrations des clients Syncoria\./,
  )
  assert.match(applicationSource, /<IntegrationsPage \/>/)
  assert.match(integrationsPageSource, /Aucune intégration configurée/)
  assert.match(
    integrationsPageSource,
    /Les futures fiches d’intégration des clients seront préparées et suivies/,
  )
})

test('does not invent integration data or expose the admin page to clients', () => {
  const renderedIntegrationContent = `${applicationSource}\n${integrationsPageSource}`

  assert.doesNotMatch(renderedIntegrationContent, /Notion connecté|Calendly actif|Novalia — en cours/)
  assert.doesNotMatch(clientWorkspaceSource, /IntegrationsPage|Administration[\s\S]*Intégrations/)
})

test('uses button navigation with active and aria-current state', () => {
  assert.match(applicationSource, /aria-current=\{isActive \? 'page' : undefined\}/)
  assert.match(applicationSource, /type: 'open_page',[\s\S]*?page,/)
  assert.doesNotMatch(applicationSource, /href=[^\n]*integrations/i)
})
