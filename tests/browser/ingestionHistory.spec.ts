import { test, expect, type Locator, type Page } from '@playwright/test'

const tenantId = '11111111-1111-4111-8111-111111111111'
const notionId = '22222222-2222-4222-8222-222222222222'
const automationId = '55555555-5555-4555-8555-555555555555'
const firstCorrelationId = '33333333-3333-4333-8333-333333333333'
const secondCorrelationId = '66666666-6666-4666-8666-666666666666'
const prefix = `/admin/tenants/${tenantId}`

const provider = (
  id: string,
  type: 'notion' | 'n8n',
  name: string,
  auditSupported: boolean,
  initialIngestionSupported: boolean,
) => ({
  id,
  tenant_id: tenantId,
  provider: type,
  audit_supported: auditSupported,
  initial_ingestion_supported: initialIngestionSupported,
  credential_type: type === 'notion' ? 'integration_token' : 'api_key',
  name,
  status: 'active',
  configuration: type === 'n8n' ? { base_url: 'https://automation.example.test' } : {},
  credential_configured: true,
  created_at: '2026-08-13T08:00:00Z',
  updated_at: '2026-08-13T08:00:00Z',
  last_verified_at: null,
  last_verification_status: null,
  last_verification_http_status: null,
  last_verification_code: null,
  last_verification_message: null,
})

const source = (name: string, id: string, status: 'completed' | 'failed' = 'completed') => ({
  external_source_id: id,
  source_name: name,
  observed_record_count: 10,
  run_id: status === 'completed' ? `run-${id}` : null,
  status,
  started_at: '2026-09-15T08:00:00Z',
  completed_at: status === 'completed' ? '2026-09-15T08:00:33Z' : null,
  items_received: 10,
  items_processed: 10,
  items_inserted: 0,
  items_duplicate: 10,
  items_rejected: 0,
  items_not_attempted: 0,
  error_code: status === 'failed' ? 'acquisition' : null,
  capture_contract_versions: ['notion-page-properties-v3'],
})

const operation = (
  correlationId: string,
  status: 'pending' | 'completed' | 'failed',
  providerRecordId = notionId,
  providerType = 'notion',
  archived = false,
) => ({
  tenant_id: tenantId,
  tenant_provider_record_id: providerRecordId,
  provider: providerType,
  correlation_id: correlationId,
  status,
  started_at: '2026-09-15T08:00:00Z',
  completed_at: status === 'completed' ? '2026-09-15T08:00:33Z' : null,
  archived,
  items_expected: 10,
  items_received: 10,
  items_processed: 10,
  items_inserted: 0,
  items_duplicate: 10,
  items_rejected: 0,
  items_not_attempted: 0,
  sources_total: 1,
  sources_completed: status === 'completed' ? 1 : 0,
  sources_in_progress: status === 'pending' ? 1 : 0,
  sources_error: status === 'failed' ? 1 : 0,
  duration_seconds: status === 'completed' ? 33 : null,
  error_codes: status === 'failed' ? ['acquisition'] : [],
  capture_contract_versions: ['notion-page-properties-v3'],
  sources: [source(status === 'failed' ? 'Failed source' : 'Companies', status === 'failed' ? 'failed-source' : 'companies')],
})

async function openIngestion(page: Page): Promise<{ requests: string[] }> {
  const tenant = { id: tenantId, name: 'Client synthétique', slug: 'synthetic', status: 'active' }
  const requests: string[] = []
  await page.context().route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin === 'http://127.0.0.1:4173') return route.continue()
    if (url.origin !== 'https://api.bryanlab.ovh') return route.abort()
    requests.push(`${route.request().method()} ${url.pathname}`)
    if (url.pathname === '/me') return route.fulfill({ status: 401, json: {} })
    if (url.pathname === '/admin/session') return route.fulfill({ json: { authenticated: true } })
    if (url.pathname === '/admin/tenants') return route.fulfill({ json: [tenant] })
    if (url.pathname === prefix) return route.fulfill({ json: tenant })
    if (url.pathname === `${prefix}/providers`) {
      return route.fulfill({ json: [
        provider(notionId, 'notion', 'Notion Novalia', true, true),
        provider(automationId, 'n8n', 'Automatisation', false, false),
      ] })
    }
    if (url.pathname === `${prefix}/ingestions` && route.request().method() === 'GET') {
      if (url.searchParams.get('archived') === 'true') {
        return route.fulfill({ json: [operation(secondCorrelationId, 'completed', notionId, 'notion', true)] })
      }
      return route.fulfill({ json: [
        operation(firstCorrelationId, 'completed'),
        operation(secondCorrelationId, 'failed'),
      ] })
    }
    if (url.pathname === `${prefix}/providers/${notionId}/ingestions/${firstCorrelationId}/archive` && route.request().method() === 'POST') {
      return route.fulfill({ status: 200, json: operation(firstCorrelationId, 'completed', notionId, 'notion', true) })
    }
    if (url.pathname === `${prefix}/providers/${notionId}/ingestions/latest`) {
      return route.fulfill({ status: 404, json: {} })
    }
    if (url.pathname === `${prefix}/providers/${notionId}/ingestions` && route.request().method() === 'POST') {
      return route.fulfill({ status: 202, json: operation('77777777-7777-4777-8777-777777777777', 'pending') })
    }
    if (url.pathname === `${prefix}/providers/${automationId}/ingestions/latest`) {
      return route.fulfill({ status: 404, json: {} })
    }
    return route.fulfill({ status: 404, json: {} })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Clients', exact: true }).click()
  await page.getByRole('button', { name: 'Client synthétique', exact: true }).click()
  await page.getByRole('button', { name: 'Ingestion', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Historique des ingestions' })).toBeVisible()
  return { requests }
}

async function expectArchiveMenuFullyVisible(page: Page, row: Locator, nextRow?: Locator) {
  const menu = row.locator('.ui-action-menu__content')
  const archive = row.getByRole('button', { name: 'Archiver', exact: true })
  await expect(menu).toBeVisible()
  await expect(archive).toBeVisible()

  const viewport = page.viewportSize()
  const menuBox = await menu.boundingBox()
  const archiveBox = await archive.boundingBox()
  expect(viewport).not.toBeNull()
  expect(menuBox).not.toBeNull()
  expect(archiveBox).not.toBeNull()
  expect(menuBox!.x).toBeGreaterThanOrEqual(0)
  expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(viewport!.width)
  expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(viewport!.height)
  expect(archiveBox!.y).toBeGreaterThanOrEqual(menuBox!.y)
  expect(archiveBox!.y + archiveBox!.height).toBeLessThanOrEqual(menuBox!.y + menuBox!.height)

  const menuIsUnobscured = await menu.evaluate((element) => {
    const box = element.getBoundingClientRect()
    const inset = 2
    return [
      [box.left + box.width / 2, box.top + inset],
      [box.left + box.width / 2, box.bottom - inset],
      [box.left + inset, box.top + box.height / 2],
      [box.right - inset, box.top + box.height / 2],
    ].every(([x, y]) => {
      const hit = document.elementFromPoint(x, y)
      return hit !== null && (hit === element || element.contains(hit))
    })
  })
  expect(menuIsUnobscured).toBe(true)

  if (nextRow) {
    const nextRowBox = await nextRow.boundingBox()
    expect(nextRowBox).not.toBeNull()
    const overlapTop = Math.max(menuBox!.y, nextRowBox!.y)
    const overlapBottom = Math.min(menuBox!.y + menuBox!.height, nextRowBox!.y + nextRowBox!.height)
    if (overlapBottom > overlapTop) {
      const menuIsAboveNextRow = await menu.evaluate((element, point) => {
        const hit = document.elementFromPoint(point.x, point.y)
        return hit !== null && (hit === element || element.contains(hit))
      }, { x: menuBox!.x + menuBox!.width / 2, y: overlapTop + (overlapBottom - overlapTop) / 2 })
      expect(menuIsAboveNextRow).toBe(true)
    }
  }

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth)
}

test('displays multi-provider ingestion history and opens each run detail under its row', async ({ page }) => {
  const { requests } = await openIngestion(page)

  await expect(page.locator('.ingestion-history__item')).toHaveCount(2)
  await expect(page.locator('.ingestion-history__item').first()).toContainText('Notion Novalia')
  await expect(page.getByText('Terminé')).toBeVisible()
  await expect(page.getByText('Erreur')).toBeVisible()
  await expect(page.getByRole('option', { name: 'N8n — Automatisation' })).toHaveAttribute('disabled', '')
  await expect(page.locator('.ui-action-menu > summary')).toHaveCount(2)

  const rows = page.locator('.ingestion-history__item')
  await rows.first().locator('.ingestion-history__row-trigger').click()
  await expect(page.getByRole('heading', { name: 'Companies', exact: true })).toBeVisible()
  await expect(page.getByText('33 s').first()).toBeVisible()
  await expect(page.getByText(firstCorrelationId)).toBeVisible()
  await rows.nth(1).locator('.ingestion-history__row-trigger').click()
  await expect(page.getByRole('heading', { name: 'Failed source', exact: true })).toBeVisible()
  await expect(page.getByText(secondCorrelationId)).toBeVisible()
  await expect(page.getByText('acquisition')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Companies', exact: true })).toHaveCount(0)

  expect(requests).toContain(`GET ${prefix}/ingestions`)
})

test('archives a completed run logically and keeps its detail in the separate archive view', async ({ page }) => {
  await openIngestion(page)
  await expect(page.locator('.ingestion-history__item')).toHaveCount(2)
  const firstRow = page.locator('.ingestion-history__item').first()
  await firstRow.locator('.ui-action-menu > summary').click()
  await firstRow.getByRole('button', { name: 'Archiver', exact: true }).click()
  await expect(page.locator('.ui-action-menu > summary')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Voir les archives' })).toBeVisible()
  await page.getByRole('button', { name: 'Voir les archives' }).click()
  await expect(page.locator('.ui-action-menu > summary')).toHaveCount(0)
  await page.locator('.ingestion-history__item').first().locator('.ingestion-history__row-trigger').click()
  await expect(page.getByText(firstCorrelationId)).toBeVisible()
  await expect(page.getByText('33 s').first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Companies', exact: true })).toBeVisible()
})

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`keeps the ingestion action menu visible when collapsed and expanded at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport)
    await openIngestion(page)
    const rows = page.locator('.ingestion-history__item')
    const completedRow = rows.first()
    const menu = completedRow.locator('.ui-action-menu')

    await expect(completedRow).toHaveCSS('overflow', 'visible')
    await expect(completedRow).toHaveCSS('border-radius', '8px')
    await expect(completedRow.locator('.ingestion-history__detail')).toHaveCount(0)
    const collapsedHeight = (await completedRow.boundingBox())?.height
    await menu.locator('summary').click()
    await expectArchiveMenuFullyVisible(page, completedRow, rows.nth(1))
    expect((await completedRow.boundingBox())?.height).toBe(collapsedHeight)
    await page.screenshot({ path: testInfo.outputPath(`ingestion-menu-collapsed-${viewport.width}.png`) })

    await page.keyboard.press('Escape')
    await expect(menu).not.toHaveAttribute('open', '')
    await completedRow.locator('.ingestion-history__row-trigger').click()
    const detail = completedRow.locator('.ingestion-history__detail')
    await expect(detail).toBeVisible()
    await expect(detail).toHaveCSS('border-top-width', '1px')
    await expect(detail).toHaveCSS('border-bottom-left-radius', '7px')
    await expect(detail).toHaveCSS('border-bottom-right-radius', '7px')
    const expandedHeight = (await completedRow.boundingBox())?.height
    await menu.locator('summary').click()
    await expectArchiveMenuFullyVisible(page, completedRow)
    expect((await completedRow.boundingBox())?.height).toBe(expandedHeight)
    await page.screenshot({ path: testInfo.outputPath(`ingestion-menu-expanded-${viewport.width}.png`) })
  })
}

test('keeps the launcher functional and avoids horizontal overflow on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const { requests } = await openIngestion(page)

  await page.getByRole('button', { name: 'Lancer l’ingestion' }).click()
  await expect(page.getByText('En attente')).toBeVisible()
  await expect.poll(() => requests.filter((request) => request.endsWith('/ingestions') && request.startsWith('POST')).length).toBe(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
