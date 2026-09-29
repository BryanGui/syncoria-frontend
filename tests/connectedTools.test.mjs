import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { providerCatalog, resolveProvider } from '../src/providers/catalog.ts'
import { toConnectedTools } from '../src/tenantWorkspace/connectedTools.ts'

const expected = [
  'notion', 'n8n', 'google-sheets', 'google-drive', 'gmail', 'google-calendar',
  'microsoft-excel', 'microsoft-onedrive', 'microsoft-outlook', 'microsoft-teams',
  'slack', 'hubspot', 'salesforce', 'airtable', 'calendly', 'typeform', 'monday',
  'asana', 'stripe', 'shopify',
]

test('the visual catalog has exactly the requested tools and explicit aliases', () => {
  assert.deepEqual(providerCatalog.map((entry) => entry.slug), expected)
  assert.equal(resolveProvider('notion')?.label, 'Notion')
  assert.equal(resolveProvider('n8n')?.label, 'n8n')
  assert.equal(resolveProvider('google_sheets')?.slug, 'google-sheets')
  assert.equal(resolveProvider('google-sheets')?.slug, 'google-sheets')
  assert.equal(resolveProvider('google_drive')?.slug, 'google-drive')
  assert.equal(resolveProvider('google_calendar')?.slug, 'google-calendar')
  assert.equal(resolveProvider('monday_com')?.slug, 'monday')
  assert.equal(resolveProvider('onedrive')?.slug, 'microsoft-onedrive')
  assert.equal(resolveProvider('microsoft_teams')?.slug, 'microsoft-teams')
  assert.equal(resolveProvider('microsoft_outlook')?.slug, 'microsoft-outlook')
  assert.equal(resolveProvider('unknown-tool'), null)
  assert.equal(resolveProvider('notionn'), null)
})

test('all configured logos are local, valid SVGs without script or external fetches', async () => {
  for (const entry of providerCatalog) {
    if (entry.logo === null) continue
    assert.equal(new URL(entry.logo).protocol, 'file:')
    const svg = await readFile(new URL(entry.logo), 'utf8')
    assert.match(svg, /^<svg\b/)
    assert.doesNotMatch(svg, /<script\b|<foreignObject\b|href\s*=|@import|url\(/i)
  }
})

test('only API records become connected tools, preserving status and useful names', () => {
  const records = [
    { id: '1', provider: 'notion', name: 'Notion recrutement', status: 'active', credential_configured: true, last_verified_at: '2026-09-01T08:00:00Z', last_verification_status: 'ok' },
    { id: '2', provider: 'n8n', name: 'n8n', status: 'inactive', credential_configured: true, last_verified_at: '2026-09-01T08:00:00Z', last_verification_status: 'ok' },
    { id: '3', provider: 'unknown_tool', name: 'Unknown tool', status: 'active', credential_configured: false, last_verified_at: null, last_verification_status: null },
  ]
  const tools = toConnectedTools(records)
  assert.deepEqual(tools.map((tool) => tool.label), ['Notion', 'n8n', 'unknown tool'])
  assert.equal(tools.some((tool) => tool.provider === 'stripe'), false)
  assert.equal(tools[0].connectionName, 'Notion recrutement')
  assert.equal(tools[0].statusLabel, 'Connecté')
  assert.equal(tools[1].connectionName, null)
  assert.equal(tools[1].statusLabel, 'Inactif')
  assert.equal(tools[2].statusLabel, 'Non configuré')
})

test('client workspace does not fetch admin provider routes', async () => {
  const source = await readFile(new URL('../src/pages/ClientWorkspacePage.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /admin\/tenants|fetchAdminTenantProviders/)
})
