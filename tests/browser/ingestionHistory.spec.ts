import { test, expect, type Page } from '@playwright/test'

const tenantId = '11111111-1111-4111-8111-111111111111'
const notionId = '22222222-2222-4222-8222-222222222222'
const automationId = '55555555-5555-4555-8555-555555555555'
const firstCorrelationId = '33333333-3333-4333-8333-333333333333'
const secondCorrelationId = '66666666-6666-4666-8666-666666666666'
const prefix = `/admin/tenants/${tenantId}`

const provider = (id: string, type: 'notion' | 'n8n', name: string, auditSupported: boolean) => ({
  id,
  tenant_id: tenantId,
  provider: type,
  audit_supported: auditSupported,
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
) => ({
  tenant_id: tenantId,
  tenant_provider_record_id: providerRecordId,
  provider: providerType,
  correlation_id: correlationId,
  status,
  started_at: '2026-09-15T08:00:00Z',
  completed_at: status === 'completed' ? '2026-09-15T08:00:33Z' : null,
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
        provider(notionId, 'notion', 'Notion Novalia', true),
        provider(automationId, 'n8n', 'Automatisation', false),
      ] })
    }
    if (url.pathname === `${prefix}/ingestions` && route.request().method() === 'GET') {
      return route.fulfill({ json: [
        operation(firstCorrelationId, 'completed'),
        operation(secondCorrelationId, 'failed'),
      ] })
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
  await page.getByRole('button', { name: 'Audit & intégration', exact: true }).click()
  await page.getByRole('button', { name: 'Ingestion', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Historique des ingestions' })).toBeVisible()
  return { requests }
}

test('displays multi-provider ingestion history and opens each run detail under its row', async ({ page }) => {
  const { requests } = await openIngestion(page)

  await expect(page.getByText('Ingestion Notion — Notion Novalia')).toHaveCount(2)
  await expect(page.getByText('33 s')).toBeVisible()
  await expect(page.getByText('Terminé')).toBeVisible()
  await expect(page.getByText('Erreur')).toBeVisible()
  await expect(page.getByRole('option', { name: 'N8n — Automatisation' })).toHaveAttribute('disabled', '')
  await expect(page.getByRole('button', { name: /Archiver (une ingestion|l’ingestion)/ })).toHaveCount(0)

  const details = page.getByRole('button', { name: 'Voir détail' })
  await details.first().click()
  await expect(page.getByRole('heading', { name: 'Companies', exact: true })).toBeVisible()
  await expect(page.getByText(firstCorrelationId)).toBeVisible()
  await page.getByRole('button', { name: 'Voir détail' }).first().click()
  await expect(page.getByRole('heading', { name: 'Failed source', exact: true })).toBeVisible()
  await expect(page.getByText(secondCorrelationId)).toBeVisible()
  await expect(page.getByText('acquisition')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Companies', exact: true })).toHaveCount(0)

  expect(requests).toContain(`GET ${prefix}/ingestions`)
})

test('keeps the launcher functional and avoids horizontal overflow on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const { requests } = await openIngestion(page)

  await page.getByRole('button', { name: 'Lancer l’ingestion' }).click()
  await expect(page.getByText('En attente')).toBeVisible()
  await expect.poll(() => requests.filter((request) => request.endsWith('/ingestions') && request.startsWith('POST')).length).toBe(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
