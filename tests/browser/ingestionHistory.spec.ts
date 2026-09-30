import { test, expect, type Page } from '@playwright/test'

const tenantId = '11111111-1111-4111-8111-111111111111'
const notionId = '22222222-2222-4222-8222-222222222222'
const automationId = '55555555-5555-4555-8555-555555555555'
const firstCorrelationId = '33333333-3333-4333-8333-333333333333'
const secondCorrelationId = '66666666-6666-4666-8666-666666666666'
const prefix = `/admin/tenants/${tenantId}`
const screenshotDir = 'docs/screenshots/ticket-114'

type Status = 'pending' | 'running' | 'completed' | 'failed'
type Scenario = 'running' | 'completed' | 'rejected'

const provider = (id: string, type: 'notion' | 'n8n', name: string, supported: boolean) => ({
  id, tenant_id: tenantId, provider: type, audit_supported: true,
  initial_ingestion_supported: supported, credential_type: type === 'notion' ? 'integration_token' : 'api_key',
  name, status: 'active', configuration: {}, credential_configured: true,
  created_at: '2026-09-30T08:00:00Z', updated_at: '2026-09-30T08:00:00Z',
  last_verified_at: null, last_verification_status: null, last_verification_http_status: null,
  last_verification_code: null, last_verification_message: null,
})

function source(name: string, index: number, status: Status, rejected = 0, notAttempted = 0) {
  const count = [8, 21, 10, 27, 21, 3][index]
  const processed = status === 'running' ? 12 : status === 'pending' ? 0 : count - notAttempted
  return {
    external_source_id: `source-technical-id-${index}`, source_name: name, observed_record_count: count,
    run_id: `run-technical-id-${index}`, status,
    started_at: status === 'pending' ? null : '2026-09-30T08:29:00Z',
    completed_at: status === 'completed' ? '2026-09-30T08:29:33Z' : null,
    items_received: status === 'pending' ? 0 : status === 'running' ? processed : count,
    items_processed: processed,
    items_inserted: Math.max(0, processed - rejected), items_duplicate: 0,
    items_rejected: rejected, items_not_attempted: notAttempted,
    error_code: rejected > 0 ? 'incomplete_capture' : null,
    capture_contract_versions: ['notion-page-properties-v3'],
  }
}

function operation(correlationId: string, status: Status, archived = false, rejected = false) {
  const names = ['Entreprises', 'Interlocuteurs clients', 'Missions', 'Talents', 'Pipeline candidats', 'Placements']
  const sources = names.map((name, index) => source(
    name, index,
    status === 'running' ? (index === 0 ? 'completed' : index === 1 ? 'running' : 'pending') : status,
    rejected && index === 2 ? 2 : 0,
    rejected && index === 2 ? 4 : 0,
  ))
  const processed = sources.reduce((sum, item) => sum + item.items_processed, 0)
  const received = sources.reduce((sum, item) => sum + item.items_received, 0)
  const rejectedCount = sources.reduce((sum, item) => sum + item.items_rejected, 0)
  return {
    tenant_id: tenantId, tenant_provider_record_id: notionId, provider: 'notion', correlation_id: correlationId,
    status, started_at: '2026-09-30T08:29:00Z', completed_at: status === 'completed' ? '2026-09-30T08:29:33Z' : null,
    archived, items_expected: 90, items_received: received, items_processed: processed,
    items_inserted: processed - rejectedCount, items_duplicate: 0, items_rejected: rejectedCount,
    items_not_attempted: rejected ? 4 : 0,
    sources_total: sources.length, sources_completed: sources.filter((item) => item.status === 'completed').length,
    sources_in_progress: sources.filter((item) => item.status === 'running').length,
    sources_error: sources.filter((item) => item.status === 'failed').length,
    duration_seconds: status === 'completed' ? 33 : null,
    error_codes: rejected ? ['incomplete_capture'] : [],
    capture_contract_versions: ['notion-page-properties-v3'], sources,
  }
}

async function openIngestion(page: Page, scenario: Scenario = 'completed', completeOnPoll = false) {
  const tenant = { id: tenantId, name: 'Client synthétique', slug: 'synthetic', status: 'active' }
  const current = operation(firstCorrelationId, scenario === 'running' ? 'running' : 'completed', false, scenario === 'rejected')
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
    if (url.pathname === `${prefix}/providers`) return route.fulfill({ json: [
      provider(notionId, 'notion', 'Notion Novalia', true),
      provider(automationId, 'n8n', 'Automatisation', false),
    ] })
    if (url.pathname === `${prefix}/ingestions` && route.request().method() === 'GET') {
      return route.fulfill({ json: url.searchParams.get('archived') === 'true'
        ? [operation(secondCorrelationId, 'completed', true)]
        : [current, operation(secondCorrelationId, 'failed')] })
    }
    if (url.pathname === `${prefix}/providers/${notionId}/ingestions/${firstCorrelationId}/archive` && route.request().method() === 'POST') {
      return route.fulfill({ json: { ...current, archived: true } })
    }
    if (url.pathname === `${prefix}/providers/${notionId}/ingestions/latest`) return route.fulfill({ json: current })
    if (url.pathname === `${prefix}/providers/${notionId}/ingestions/${firstCorrelationId}`) {
      return route.fulfill({ json: completeOnPoll ? operation(firstCorrelationId, 'completed') : current })
    }
    if (url.pathname === `${prefix}/providers/${notionId}/ingestions` && route.request().method() === 'POST') {
      return route.fulfill({ status: 202, json: operation('77777777-7777-4777-8777-777777777777', 'pending') })
    }
    if (url.pathname === `${prefix}/providers/${automationId}/ingestions/latest`) return route.fulfill({ status: 404, json: {} })
    return route.fulfill({ status: 404, json: {} })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Clients', exact: true }).click()
  await page.getByRole('button', { name: 'Client synthétique', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Client synthétique', exact: true })).toBeVisible()
  const mobileMenu = page.getByRole('button', { name: 'Menu du client' })
  if (await mobileMenu.isVisible()) await mobileMenu.click()
  await page.getByRole('button', { name: 'Ingestion', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Historique des ingestions' })).toBeVisible()
  await expect(page.locator('.ingestion-operation')).toBeVisible()
  return { requests }
}

test('shows the running operation with six source rows and private technical details', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openIngestion(page, 'running')
  const summary = page.locator('.ingestion-operation')
  const table = page.locator('.ingestion-sources > .ingestion-table-scroll > .ingestion-sources-table')
  await expect(summary.getByRole('img', { name: 'Logo de Notion' })).toHaveCount(1)
  await expect(summary).toContainText('20 / 90 éléments traités')
  await expect(summary.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '20')
  await expect(table.locator('tbody tr.ingestion-table__row')).toHaveCount(6)
  await expect(table.getByRole('button', { name: /Pipeline candidats/ })).toBeVisible()
  await expect(summary.getByText(firstCorrelationId, { exact: true })).toBeHidden()
  await expect(page.getByText('source-technical-id-0', { exact: true })).toHaveCount(0)
  await expect(page.locator('.ingestion-source-grid')).toHaveCount(0)
  await page.screenshot({ path: `${screenshotDir}/01-running-desktop.png`, fullPage: true })
  await table.getByRole('button', { name: /Entreprises/ }).click()
  await expect(page.getByText('source-technical-id-0', { exact: true })).toBeHidden()
  await page.locator('.ingestion-source-detail .ingestion-technical summary').first().click()
  await expect(page.getByText('source-technical-id-0', { exact: true })).toBeVisible()
  await expect(page.getByText('run-technical-id-0', { exact: true })).toBeVisible()
  await summary.locator('.ingestion-technical summary').click()
  await expect(summary.getByText(firstCorrelationId, { exact: true })).toBeVisible()
})

test('shows completed and rejected operations with compact counters and source detail', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openIngestion(page, 'completed')
  await expect(page.locator('.ingestion-operation')).toContainText('Terminé')
  await expect(page.locator('.ingestion-operation')).toContainText('33 s')
  await page.screenshot({ path: `${screenshotDir}/02-completed-desktop.png`, fullPage: true })
})

test('updates summary, source rows and history when polling completes', async ({ page }) => {
  await openIngestion(page, 'running', true)
  const summary = page.locator('.ingestion-operation')
  await expect(summary).toContainText('20 / 90 éléments traités')
  await expect(summary).toContainText('90 / 90 éléments traités', { timeout: 12_000 })
  await expect(summary).toContainText('Terminé')
  await expect(page.locator('.ingestion-sources > .ingestion-table-scroll .ingestion-sources-table tr.ingestion-table__row').filter({ hasText: 'Pipeline candidats' })).toContainText('21')
  await expect(page.locator('.ingestion-history-table tr.ingestion-history__item').first()).toContainText('Terminé')
})

test('signals nonzero rejections, errors and unattempted items without changing status', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openIngestion(page, 'rejected')
  const summary = page.locator('.ingestion-operation')
  const sourceTable = page.locator('.ingestion-sources-table').first()
  await expect(summary).toContainText('2 rejetés')
  await expect(summary).toContainText('4 éléments non tentés')
  const missionRow = sourceTable.locator('tr.ingestion-table__row').filter({ hasText: 'Missions' })
  await expect(missionRow).toContainText('Terminé')
  await expect(missionRow.locator('.ingestion-rejected')).toHaveText('2 rejetés')
  await expect(sourceTable.locator('.ingestion-zero')).toHaveCount(5)
  await page.screenshot({ path: `${screenshotDir}/03-rejected-desktop.png`, fullPage: true })
  await missionRow.getByRole('button', { name: /Missions/ }).click()
  const detail = page.locator('.ingestion-source-detail')
  await expect(detail).toContainText('incomplete_capture')
  await expect(detail).toContainText('Non tentés')
  await expect(detail).toContainText('4')
})

test('keeps history, its row detail and archive action in the table', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const { requests } = await openIngestion(page)
  const history = page.locator('.ingestion-history-table')
  await expect(history.locator('tr.ingestion-history__item')).toHaveCount(2)
  await expect(history.getByText('Échec')).toBeVisible()
  await expect(page.getByRole('option', { name: 'N8n — Automatisation' })).toHaveAttribute('disabled', '')
  await history.locator('tr.ingestion-history__item').first().getByRole('button', { name: /septembre|30/ }).click()
  await expect(history.locator('.ingestion-history__detail')).toBeVisible()
  await expect(history.locator('.ingestion-history__detail .ingestion-sources-table')).toBeVisible()
  await page.screenshot({ path: `${screenshotDir}/04-history-desktop.png`, fullPage: true })
  const firstRow = history.locator('tr.ingestion-history__item').first()
  await firstRow.getByRole('button', { name: 'Actions de l’ingestion' }).click()
  const menu = page.locator('.ui-action-menu__content--portal')
  await expect(menu.getByRole('button', { name: 'Archiver' })).toBeVisible()
  const box = await menu.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x + box!.width).toBeLessThanOrEqual(1440)
  await menu.getByRole('button', { name: 'Archiver' }).click()
  await expect(history.locator('tr.ingestion-history__item')).toHaveCount(1)
  await page.getByRole('button', { name: 'Voir les archives' }).click()
  await expect(history.locator('tr.ingestion-history__item')).toHaveCount(2)
  expect(requests).toContain(`GET ${prefix}/ingestions`)
  expect(requests).toContain(`POST ${prefix}/providers/${notionId}/ingestions/${firstCorrelationId}/archive`)
})

test('keeps the page within the mobile viewport and tables horizontally scrollable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openIngestion(page, 'running')
  await expect(page.locator('.ingestion-operation')).toBeVisible()
  const regions = page.locator('.tenant-ingestion > .ingestion-sources > .ingestion-table-scroll, .tenant-ingestion > .ingestion-history > .ingestion-table-scroll')
  await expect(regions).toHaveCount(2)
  for (const region of await regions.all()) {
    const dimensions = await region.evaluate((element) => ({ visible: element.clientWidth, content: element.scrollWidth }))
    expect(dimensions.content).toBeGreaterThan(dimensions.visible)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: `${screenshotDir}/05-mobile.png`, fullPage: true })
})
