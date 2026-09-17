import { test, expect } from '@playwright/test'

const tenantId = '11111111-1111-4111-8111-111111111111'
const activeId = '22222222-2222-4222-8222-222222222222'
const draftId = '33333333-3333-4333-8333-333333333333'
const sourceDdlId = '44444444-4444-4444-8444-444444444444'
const importedDdlId = '55555555-5555-4555-8555-555555555555'
const providerRecordId = '66666666-6666-4666-8666-666666666666'
const activeCorrelationId = '77777777-7777-4777-8777-777777777777'
const candidateCorrelationId = '88888888-8888-4888-8888-888888888888'
const prefix = `/admin/tenants/${tenantId}`

const active = {
  id: activeId, tenant_id: tenantId, version_number: 1, display_name: 'Novalia Talents v1',
  namespace_key: 'v1', status: 'active', based_on_integration_id: null, design_note: 'Version stable',
  selected_ddl_id: sourceDdlId, created_at: '2026-09-16T10:00:00Z', updated_at: '2026-09-16T10:00:00Z',
}
const draft = {
  id: draftId, tenant_id: tenantId, version_number: 2, display_name: 'Novalia Talents v2',
  namespace_key: 'v2', status: 'draft', based_on_integration_id: activeId, design_note: null,
  selected_ddl_id: null, created_at: '2026-09-17T10:00:00Z', updated_at: '2026-09-17T10:00:00Z',
}
const sourceDdl = {
  id: sourceDdlId, title: 'Audit Notion', kind: 'source', source_report_id: 'audit-notion-2026-09-16',
  source_filename: null, created_at: '2026-09-16T10:00:00Z', is_selected: true,
  source_provider: 'notion', source_audit_title: 'Audit Notion', source_report_date: '2026-09-16',
}
const importedDdl = {
  id: importedDdlId, title: 'DDL importé v2', kind: 'imported', source_report_id: null,
  source_filename: 'novalia-v2.sql', created_at: '2026-09-17T10:00:00Z', is_selected: false,
  source_provider: null, source_audit_title: null, source_report_date: null,
}
const operation = (correlationId: string) => ({
  tenant_provider_record_id: providerRecordId, provider: 'notion', correlation_id: correlationId,
  status: 'completed', archived: false, started_at: '2026-09-17T09:00:00Z',
  completed_at: '2026-09-17T09:01:00Z', items_received: 90, items_inserted: 88,
  items_duplicate: 2, created_at: '2026-09-17T09:02:00Z',
})

test('navigates the canonical versioned integration views and selects one DDL explicitly', async ({ page }) => {
  const tenant = { id: tenantId, name: 'Client synthétique', slug: 'synthetic', status: 'active' }
  const requests: { path: string; method: string; body?: unknown }[] = []
  const currentDdls = [sourceDdl, importedDdl]

  await page.context().route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin === 'http://127.0.0.1:4173') return route.continue()
    if (url.origin !== 'https://api.bryanlab.ovh') return route.abort()
    const method = route.request().method()
    const body = method === 'GET' || method === 'DELETE' ? undefined : route.request().postDataJSON() as unknown
    requests.push({ path: url.pathname, method, body })
    if (url.pathname === '/me') return route.fulfill({ status: 401, json: {} })
    if (url.pathname === '/admin/session') return route.fulfill({ json: { authenticated: true } })
    if (url.pathname === '/admin/tenants') return route.fulfill({ json: [tenant] })
    if (url.pathname === prefix) return route.fulfill({ json: tenant })
    if (url.pathname === `${prefix}/integrations` && method === 'GET') return route.fulfill({ json: [draft, active] })
    if (url.pathname === `${prefix}/integrations/${activeId}` && method === 'GET') return route.fulfill({ json: active })
    if (url.pathname === `${prefix}/integrations/${draftId}` && method === 'GET') return route.fulfill({ json: draft })
    if (url.pathname === `${prefix}/integrations/${activeId}/ddls` && method === 'GET') return route.fulfill({ json: [sourceDdl] })
    if (url.pathname === `${prefix}/integrations/${draftId}/ddls` && method === 'GET') return route.fulfill({ json: currentDdls })
    if (url.pathname === `${prefix}/integrations/${activeId}/ddls/${sourceDdlId}` && method === 'GET') return route.fulfill({ json: { ...sourceDdl, ddl_content: '-- source\nCREATE TABLE source_table (id integer);\n' } })
    if (url.pathname === `${prefix}/integrations/${draftId}/ddls/${sourceDdlId}` && method === 'GET') return route.fulfill({ json: { ...sourceDdl, ddl_content: '-- source\nCREATE TABLE source_table (id integer);\n' } })
    if (url.pathname === `${prefix}/integrations/${draftId}/ddls/${importedDdlId}/selection` && method === 'PUT') {
      return route.fulfill({ json: { ...importedDdl, is_selected: true, ddl_content: '-- imported\nCREATE TABLE v2_table (id integer);\n' } })
    }
    if (url.pathname === `${prefix}/integrations/${draftId}/ingestions` && method === 'GET') return route.fulfill({ json: [operation(activeCorrelationId)] })
    if (url.pathname === `${prefix}/integrations/${draftId}/ingestion-candidates` && method === 'GET') return route.fulfill({ json: [operation(candidateCorrelationId)] })
    if (url.pathname === `${prefix}/integrations/${activeId}/ingestions` && method === 'GET') return route.fulfill({ json: [] })
    if (url.pathname === `${prefix}/integrations/${activeId}/ingestion-candidates` && method === 'GET') return route.fulfill({ json: [] })
    if (url.pathname === `${prefix}/reports` && method === 'GET') return route.fulfill({ json: [] })
    return route.fulfill({ status: 404, json: {} })
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'Clients', exact: true }).click()
  await page.getByRole('button', { name: 'Client synthétique', exact: true }).click()
  await page.getByRole('button', { name: 'Intégration', exact: true }).click()

  await expect(page.getByRole('button', { name: 'Active', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('heading', { name: 'Novalia Talents v1', exact: true })).toBeVisible()
  await expect(page.locator('.versioned-integration__ddl-title').first()).toBeVisible()
  await page.locator('.versioned-integration__ddl-title').first().click()
  await expect(page.getByRole('region', { name: 'Aperçu de Audit Notion', exact: true })).toContainText('CREATE TABLE source_table')

  await page.getByRole('button', { name: 'Versions', exact: true }).click()
  await page.getByRole('button', { name: /Novalia Talents v2/ }).click()
  await expect(page.getByRole('button', { name: 'Reprendre dans Créer', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Reprendre dans Créer', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Paramètres de version', exact: true })).toBeVisible()
  await expect(page.getByText('DDL importé v2', { exact: true })).toBeVisible()

  await page.getByRole('radio', { name: 'Sélectionner DDL importé v2' }).click()
  await expect.poll(() => requests.filter((request) => request.path.endsWith(`/ddls/${importedDdlId}/selection`) && request.method === 'PUT').length).toBe(1)
  expect(requests.some((request) => request.path.includes('integration-workspaces'))).toBe(false)
  expect(requests.some((request) => request.path.includes('/source-ddl') || request.path.includes('/working-ddl'))).toBe(false)
})
