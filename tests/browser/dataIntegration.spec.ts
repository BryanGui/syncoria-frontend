import { test, expect } from '@playwright/test'

const tenantId = '11111111-1111-4111-8111-111111111111'
const workspaceId = '22222222-2222-4222-8222-222222222222'
const prefix = `/admin/tenants/${tenantId}`
const workspacePrefix = `${prefix}/integration-workspaces`
const sourceDdl = '-- source\nCREATE TABLE source_table (id integer);\n'

test('opens a workspace, imports a target DDL, and preserves explicit replacement semantics', async ({ page }) => {
  const tenant = { id: tenantId, name: 'Client synthétique', slug: 'synthetic', status: 'active' }
  let workingDdl = sourceDdl
  let version = 1
  const requests: { path: string; method: string; body?: unknown }[] = []
  const workspace = () => ({
    id: workspaceId,
    tenant_id: tenantId,
    source_type: 'upload',
    source_report_id: null,
    source_filename: 'source.sql',
    source_ddl: sourceDdl,
    working_ddl: workingDdl,
    version,
    status: 'draft',
    created_at: '2026-09-16T10:00:00Z',
    updated_at: '2026-09-16T10:00:00Z',
  })
  await page.context().route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin === 'http://127.0.0.1:4173') return route.continue()
    if (url.origin !== 'https://api.bryanlab.ovh') return route.abort()
    const method = route.request().method()
    const body = route.request().postDataJSON() as unknown
    requests.push({ path: url.pathname, method, body })
    if (url.pathname === '/me') return route.fulfill({ status: 401, json: {} })
    if (url.pathname === '/admin/session') return route.fulfill({ json: { authenticated: true } })
    if (url.pathname === '/admin/tenants') return route.fulfill({ json: [tenant] })
    if (url.pathname === prefix) return route.fulfill({ json: tenant })
    if (url.pathname === workspacePrefix && method === 'GET') return route.fulfill({ json: [workspace()] })
    if (url.pathname === `${workspacePrefix}/audit-sources`) return route.fulfill({ json: [] })
    if (url.pathname === `${workspacePrefix}/${workspaceId}` && method === 'GET') return route.fulfill({ json: workspace() })
    if (url.pathname === `${workspacePrefix}/${workspaceId}/working-ddl` && method === 'PUT') {
      workingDdl = (body as { content: string }).content
      version += 1
      return route.fulfill({ json: workspace() })
    }
    return route.fulfill({ status: 404, json: {} })
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'Clients', exact: true }).click()
  await page.getByRole('button', { name: 'Client synthétique', exact: true }).click()
  await page.getByRole('button', { name: 'Audit & intégration', exact: true }).click()
  await page.getByRole('button', { name: 'Intégration des données', exact: true }).click()

  await expect(page.getByRole('heading', { name: 'Intégration des données', exact: true })).toBeVisible()
  await page.getByRole('button', { name: /source\.sql/ }).click()
  await expect(page.getByRole('heading', { name: 'DDL source', exact: true })).toBeVisible()
  await expect(page.getByText('Aucun DDL cible n’a encore été importé')).toBeVisible()
  await expect(page.getByText(sourceDdl)).toHaveCount(2)
  const sourceDownload = page.locator('.tenant-data-integration__ddl-block--source').getByRole('button', { name: 'Télécharger le DDL', exact: true })
  const downloadPromise = page.waitForEvent('download')
  await sourceDownload.click()
  expect((await downloadPromise).suggestedFilename()).toBe('source.sql')

  const targetInput = page.locator('input[type="file"]').last()
  await targetInput.setInputFiles({ name: 'target.sql', mimeType: 'text/plain', buffer: Buffer.from('-- target\nCREATE TABLE target_table (id integer);\n') })
  await page.getByRole('button', { name: 'Importer le DDL cible', exact: true }).click()
  await expect(page.getByText('Brouillon · version 2')).toBeVisible()
  await expect(page.getByText('DDL cible remplacé. Le DDL source est resté inchangé.')).toBeVisible()

  await targetInput.setInputFiles({ name: 'target-v2.sql', mimeType: 'text/plain', buffer: Buffer.from('-- target v2\nCREATE TABLE target_table_v2 (id integer);\n') })
  await page.getByRole('button', { name: 'Préparer le remplacement', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await expect(page.getByText('Le DDL source restera strictement inchangé')).toBeVisible()
  await page.getByRole('button', { name: 'Confirmer le remplacement', exact: true }).click()
  await expect(page.getByText('Brouillon · version 3')).toBeVisible()

  const replacements = requests.filter((request) => request.path.endsWith('/working-ddl'))
  expect(replacements).toHaveLength(2)
  expect(replacements[0].method).toBe('PUT')
  expect(replacements[0].body).toEqual({ content: '-- target\nCREATE TABLE target_table (id integer);\n' })
  expect(requests.some((request) => request.method === 'POST')).toBe(false)
})
