import { expect, test, type Page } from '@playwright/test'

const tenantId = '11111111-1111-4111-8111-111111111111'
const prefix = `/admin/tenants/${tenantId}`
const tenant = { id: tenantId, name: 'Novalia', slug: 'novalia', status: 'active' }

function provider(id: string, slug: string, name: string) {
  return {
    id,
    tenant_id: tenantId,
    provider: slug,
    audit_supported: true,
    initial_ingestion_supported: true,
    credential_type: 'integration_token',
    name,
    status: 'active',
    configuration: {},
    credential_configured: true,
    created_at: '2026-09-01T08:00:00Z',
    updated_at: '2026-09-01T08:00:00Z',
    last_verified_at: '2026-09-01T08:00:00Z',
    last_verification_status: 'ok',
    last_verification_http_status: 200,
    last_verification_code: null,
    last_verification_message: null,
  }
}

async function openOverview(page: Page, providerResponse: { status: number; json: object; delayMs?: number }) {
  let providerRequests = 0
  await page.context().route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin === 'http://127.0.0.1:4173') return route.continue()
    if (url.origin !== 'https://api.bryanlab.ovh') return route.abort()
    if (url.pathname === '/me') return route.fulfill({ status: 401, json: {} })
    if (url.pathname === '/admin/session') return route.fulfill({ json: { authenticated: true } })
    if (url.pathname === '/admin/tenants') return route.fulfill({ json: [tenant] })
    if (url.pathname === prefix) return route.fulfill({ json: tenant })
    if (url.pathname === `${prefix}/providers`) {
      providerRequests += 1
      if (providerResponse.delayMs) await new Promise((resolve) => setTimeout(resolve, providerResponse.delayMs))
      return route.fulfill(providerResponse)
    }
    return route.fulfill({ status: 404, json: {} })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Clients', exact: true }).click()
  await page.getByRole('button', { name: 'Novalia', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Outils connectés' })).toBeVisible()
  return { getProviderRequests: () => providerRequests }
}

test('admin overview shows only actual records, local logos and secondary tenant details', async ({ page }) => {
  const requests = await openOverview(page, { status: 200, json: [
    provider('notion-id', 'notion', 'Notion recrutement'),
    provider('n8n-id', 'n8n', 'n8n'),
  ] })
  const cards = page.locator('.tenant-connected-tools__card')
  await expect(cards).toHaveCount(2)
  await expect(cards.nth(0)).toContainText('Notion recrutement')
  await expect(cards.nth(0)).toContainText('Connecté')
  await expect(cards.nth(1)).toContainText('n8n')
  await expect(cards.getByRole('img', { name: 'Logo de Notion' })).toBeVisible()
  await expect(cards.getByRole('img', { name: 'Logo de n8n' })).toBeVisible()
  await expect(page.getByText('Stripe')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Informations du tenant' })).toBeVisible()
  await expect(page.getByText(tenantId)).toBeVisible()
  expect(requests.getProviderRequests()).toBe(1)
})

test('empty state opens Sources without changing browser route', async ({ page }) => {
  await openOverview(page, { status: 200, json: [] })
  await expect(page.getByText('Aucun outil connecté pour le moment.')).toBeVisible()
  const url = page.url()
  await page.getByRole('button', { name: 'Gérer les sources' }).click()
  await expect(page.getByRole('heading', { name: 'Sources', exact: true })).toBeVisible()
  expect(page.url()).toBe(url)
})

test('API error is not rendered as an empty connection list', async ({ page }) => {
  await openOverview(page, { status: 503, json: {} })
  await expect(page.locator('.tenant-connected-tools__message[role="alert"]')).toHaveText('Impossible de charger les outils connectés.')
  await expect(page.getByText('Aucun outil connecté pour le moment.')).toHaveCount(0)
})

test('loading state remains distinct until provider records arrive', async ({ page }) => {
  await openOverview(page, { status: 200, json: [], delayMs: 500 })
  await expect(page.getByRole('status', { name: 'Chargement des outils connectés' })).toBeVisible()
  await expect(page.getByText('Aucun outil connecté pour le moment.')).toBeVisible()
})

test('unknown providers and catalog entries without assets use an accessible fallback', async ({ page }) => {
  await openOverview(page, { status: 200, json: [
    provider('custom-id', 'custom_tool', 'Custom Tool'),
    provider('monday-id', 'monday_com', 'Monday.com'),
  ] })
  const cards = page.locator('.tenant-connected-tools__card')
  await expect(cards).toHaveCount(2)
  await expect(cards.nth(0).getByRole('img', { name: 'Logo indisponible pour custom tool' })).toHaveText('CT')
  await expect(cards.nth(1).getByRole('img', { name: 'Logo indisponible pour Monday.com' })).toHaveText('M')
  await expect(cards.locator('img')).toHaveCount(0)
})

test('connection cards remain readable without horizontal overflow on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openOverview(page, { status: 200, json: [
    provider('notion-id', 'notion', 'Notion recrutement'),
    provider('n8n-id', 'n8n', 'Automatisation'),
  ] })
  await expect(page.locator('.tenant-connected-tools__card')).toHaveCount(2)
  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(hasHorizontalOverflow).toBe(false)
})
