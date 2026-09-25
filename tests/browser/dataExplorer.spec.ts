import { expect, test } from '@playwright/test'

const tenantId = '11111111-1111-4111-8111-111111111111'
const versionId = '22222222-2222-4222-8222-222222222222'
const prefix = `/admin/tenants/${tenantId}/integrations/${versionId}/data`
const source = { provider: 'Notion', source_id: 'crm', source_name: 'CRM Clients' }
const tables = ['clients', 'orders'].map((name) => ({ name, row_count: 3, column_count: 3, sources: [source] }))

test('global explorer selects a tenant, loads cursor blocks, resets for sort/search, and ignores an old table request', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:4173' })
  const requests: Array<{ table: string; body: Record<string, unknown> }> = []
  await page.context().route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin === 'http://127.0.0.1:4173') return route.continue()
    if (url.origin !== 'https://api.bryanlab.ovh') return route.abort()
    if (url.pathname === '/me') return route.fulfill({ status: 401, json: {} })
    if (url.pathname === '/admin/session') return route.fulfill({ json: { authenticated: true } })
    if (url.pathname === '/admin/tenants') return route.fulfill({ json: [{ id: tenantId, name: 'Client démo', slug: 'demo', status: 'active' }] })
    if (url.pathname === `/admin/tenants/${tenantId}/integrations`) return route.fulfill({ json: [{
      id: versionId, tenant_id: tenantId, version_number: 1, display_name: 'CRM', namespace_key: 'crm',
      status: 'active', based_on_integration_id: null, design_note: null, selected_ddl_id: null,
      created_at: '2026-09-20T12:00:00Z', updated_at: '2026-09-20T12:00:00Z',
    }] })
    if (url.pathname === `${prefix}/summary`) return route.fulfill({ json: {
      integration_version_id: versionId, table_count: 2, total_row_count: 6,
      materialized_at: '2026-09-20T12:00:00Z', profiled_at: '2026-09-21T12:00:00Z', sources: [source], tables,
    } })
    if (url.pathname.endsWith('/profile')) return route.fulfill({ json: {
      name: url.pathname.split('/').at(-2), columns: [
        { name: 'name', ordinal_position: 1, data_type: 'text', type_family: 'text', is_technical: false },
        { name: 'city', ordinal_position: 2, data_type: 'text', type_family: 'text', is_technical: false },
        { name: '__syncoria_source', ordinal_position: 3, data_type: 'text', type_family: 'text', is_technical: true },
      ],
    } })
    if (url.pathname.endsWith('/rows')) {
      const table = url.pathname.split('/').at(-2) ?? ''
      const body = route.request().postDataJSON() as Record<string, unknown>
      requests.push({ table, body })
      if (table === 'clients' && requests.filter((item) => item.table === 'clients').length === 1) {
        await new Promise((resolve) => setTimeout(resolve, 400))
      }
      const cursor = body.cursor
      const search = body.search
      const rows = table === 'orders'
        ? cursor ? [{ name: 'Second order', city: 'Lyon' }] : [{ name: search ? 'Search order' : 'First order', city: 'Paris' }]
        : [{ name: 'Old client', city: 'Nice' }]
      return route.fulfill({ json: {
        columns: ['name', 'city'], rows, table_row_count: 3,
        has_more: table === 'orders' && !cursor && !search, next_cursor: table === 'orders' && !cursor && !search ? 'next-opaque' : null,
      } })
    }
    if (url.pathname === '/health' || url.pathname === '/health/db') return route.fulfill({ json: { status: 'ok' } })
    return route.fulfill({ status: 404, json: {} })
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'Données', exact: true }).click()
  await expect(page.getByText('Choisissez un client pour explorer ses données.')).toBeVisible()
  await page.getByRole('combobox', { name: 'Client' }).selectOption(tenantId)
  await expect(page.getByText('Tables matérialisées')).toBeVisible()
  await expect(page.getByText('CRM Clients').first()).toBeVisible()
  await expect.poll(() => requests.some((item) => item.table === 'clients')).toBe(true)
  await page.getByRole('button', { name: /orders/ }).click()
  await expect(page.getByText('First order')).toBeVisible()
  await page.getByRole('gridcell', { name: 'First order' }).click()
  await expect(page.locator('.data-explorer-grid__selected')).toHaveCount(1)
  await page.keyboard.press('ControlOrMeta+C')
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('First order')
  const firstCell = await page.getByRole('gridcell', { name: 'First order' }).boundingBox()
  const secondCell = await page.getByRole('gridcell', { name: 'Paris' }).boundingBox()
  expect(firstCell).not.toBeNull()
  expect(secondCell).not.toBeNull()
  await page.mouse.move(firstCell!.x + firstCell!.width / 2, firstCell!.y + firstCell!.height / 2)
  await page.mouse.down()
  await page.mouse.move(secondCell!.x + secondCell!.width / 2, secondCell!.y + secondCell!.height / 2, { steps: 4 })
  await page.mouse.up()
  await page.keyboard.press('ControlOrMeta+C')
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('First order\tParis')
  await page.waitForTimeout(500)
  await expect(page.getByText('Old client')).toHaveCount(0)
  await page.getByRole('button', { name: 'Charger la suite' }).click()
  await expect(page.getByText('Second order')).toBeVisible()
  expect(requests.find((item) => item.body.cursor === 'next-opaque')).toBeTruthy()
  await expect(page.getByRole('button', { name: 'Charger la suite' })).toHaveCount(0)
  await page.getByRole('columnheader', { name: 'name' }).click()
  await expect.poll(() => requests.some((item) => item.table === 'orders' && item.body.cursor === null &&
    Array.isArray(item.body.sorts) && item.body.sorts.length > 0)).toBe(true)
  await page.getByPlaceholder('Rechercher…').fill('Search')
  await expect(page.getByText('Search order')).toBeVisible()
  expect(requests.at(-1)?.body.search).toBe('Search')
  expect(requests.at(-1)?.body.cursor).toBe(null)
  expect(JSON.stringify(requests)).not.toContain('__syncoria_')
  await expect(page.getByRole('grid').getByRole('textbox')).toHaveCount(0)

  const scrolledCursors: unknown[] = []
  await page.route('**/rows', (route) => {
    const body = route.request().postDataJSON() as { cursor: string | null }
    scrolledCursors.push(body.cursor)
    return route.fulfill({ json: {
      columns: ['name', 'city'],
      rows: body.cursor ? [{ name: 'After scroll', city: 'Lyon' }]
        : Array.from({ length: 100 }, (_, index) => ({ name: `Line ${index}`, city: 'Paris' })),
      table_row_count: 1000, has_more: body.cursor === null,
      next_cursor: body.cursor === null ? 'scroll-cursor' : null,
    } })
  })
  await page.getByRole('button', { name: /clients/ }).click()
  await page.getByRole('button', { name: /orders/ }).click()
  await expect(page.getByText('Line 0')).toBeVisible()
  await page.getByRole('grid').evaluate((grid) => { grid.scrollTop = grid.scrollHeight })
  await expect.poll(() => scrolledCursors.includes('scroll-cursor')).toBe(true)

  await page.route('**/summary', (route) => route.fulfill({ json: {
    integration_version_id: versionId, table_count: 0, total_row_count: 0,
    materialized_at: '2026-09-20T12:00:00Z', profiled_at: '2026-09-21T12:00:00Z', sources: [], tables: [],
  } }))
  await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: 'Vue d’ensemble' }).click()
  await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: 'Données' }).click()
  await page.getByRole('combobox', { name: 'Client' }).selectOption(tenantId)
  await expect(page.getByText('Aucune table matérialisée dans ce modèle.')).toBeVisible()
})
