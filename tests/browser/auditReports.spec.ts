import { test, expect, type Page } from '@playwright/test'

const tenantId = '11111111-1111-4111-8111-111111111111'
const prefix = `/admin/tenants/${tenantId}`
const report = {
  id: 'audit-notion-2026-09-07', title: 'Audit Notion', provider: 'notion',
  report_date: '2026-09-07', status: 'completed',
  sources_analyzed: 3, sources_retained: 2, sources_excluded: 1,
  records_retained: 7, decisions_required: 1,
}

async function openAudit(page: Page, options: { archivedTenant?: boolean; archiveStatus?: number; client?: boolean } = {}) {
  const tenant = { id: tenantId, name: 'Client synthétique', slug: 'synthetic', status: options.archivedTenant ? 'archived' : 'active' }
  const reports = [
    { ...report },
    { ...report, id: 'audit-notion-2026-10-15', report_date: '2026-10-15' },
    { ...report, id: 'audit-drive-2026-10-16', provider: 'drive', title: 'Audit Drive', report_date: '2026-10-16' },
    { ...report, id: 'audit-notion-2026-08-01', report_date: '2026-08-01', status: 'archived' },
  ]
  const requests: { path: string; method: string }[] = []
  await page.context().route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin === 'http://127.0.0.1:4173') return route.continue()
    // No external request is allowed through, including requests to the API.
    if (url.origin !== 'https://api.bryanlab.ovh') return route.abort()
    const method = route.request().method()
    requests.push({ path: url.pathname, method })
    if (url.pathname === '/me') return route.fulfill(options.client
      ? { json: { tenant, user: { id: 'synthetic-user', login: 'synthetic', display_name: null, role: 'user' } } }
      : { status: 401, json: {} })
    if (url.pathname === '/admin/session') return route.fulfill({ json: { authenticated: true } })
    if (url.pathname === '/admin/tenants') return route.fulfill({ json: [tenant] })
    if (url.pathname === prefix) return route.fulfill({ json: tenant })
    if (url.pathname === prefix + '/providers') return route.fulfill({ json: [{
      id: '22222222-2222-4222-8222-222222222222',
      tenant_id: tenantId,
      provider: 'notion',
      credential_type: 'integration_token',
      name: 'Notion synthétique',
      status: 'active',
      configuration: {},
      credential_configured: true,
      created_at: '2026-08-13T08:00:00Z',
      updated_at: '2026-08-13T08:00:00Z',
      last_verified_at: null,
      last_verification_status: null,
      last_verification_http_status: null,
      last_verification_code: null,
      last_verification_message: null,
    }] })
    if (url.pathname.endsWith('/audits/latest')) return route.fulfill({ status: 404, json: {} })
    if (url.pathname === `${prefix}/reports`) return route.fulfill({ json: reports })
    if (url.pathname.endsWith('/archive') && method === 'POST') {
      if (options.archiveStatus) return route.fulfill({ status: options.archiveStatus, json: { detail: 'Unavailable' } })
      const selected = reports.find((entry) => url.pathname === `${prefix}/reports/${entry.id}/archive`)
      if (!selected) return route.fulfill({ status: 404, json: {} })
      selected.status = 'archived'
      return route.fulfill({ json: selected })
    }
    if (url.pathname.endsWith('/pdf')) return route.fulfill({
      contentType: 'application/pdf',
      headers: { 'Content-Disposition': `${url.searchParams.has('download') ? 'attachment' : 'inline'}; filename="synthetic.pdf"` },
      body: '%PDF-1.4\nsynthetic report\n%%EOF',
    })
    if (url.pathname.startsWith('/health')) return route.fulfill({ json: { status: 'ok' } })
    return route.fulfill({ status: 404, json: {} })
  })
  await page.goto('/')
  if (!options.client) {
    await page.getByRole('button', { name: 'Clients', exact: true }).click()
    await page.getByRole('button', { name: 'Client synthétique', exact: true }).click()
    await page.getByRole('button', { name: 'Audit & cartographie', exact: true }).click()
  }
  return requests
}

test('dates, same-provider reports, descending order and archive history', async ({ page }) => {
  await openAudit(page)
  const active = page.getByRole('region', { name: 'Rapports actifs', exact: true })
  await expect(active.getByRole('article')).toHaveCount(3)
  await expect(active.locator('time')).toHaveText(['16/10/2026', '15/10/2026', '07/09/2026'])
  const archived = page.getByRole('region', { name: 'Rapports archivés', exact: true })
  await expect(archived.locator('time')).toHaveText(['01/08/2026'])
  await expect(archived.getByRole('button', { name: 'Archiver', exact: true })).toHaveCount(0)
})

test('archive requires confirmation, cancellation does not write, refresh moves the card', async ({ page }) => {
  const requests = await openAudit(page)
  const active = page.getByRole('region', { name: 'Rapports actifs', exact: true })
  const card = active.getByRole('article', { name: 'Audit Notion — 07/09/2026', exact: true })
  await card.getByRole('button', { name: 'Archiver', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  expect(requests.filter((r) => r.method === 'POST')).toHaveLength(0)
  await page.getByRole('button', { name: 'Annuler', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  expect(requests.filter((r) => r.method === 'POST')).toHaveLength(0)
  await card.getByRole('button', { name: 'Archiver', exact: true }).click()
  await page.getByRole('button', { name: 'Confirmer l’archivage', exact: true }).click()
  await expect(active.getByRole('article')).toHaveCount(2)
  const archived = page.getByRole('region', { name: 'Rapports archivés', exact: true })
  await expect(archived.getByRole('article')).toHaveCount(2)
  await expect(archived.locator('time')).toHaveText(['07/09/2026', '01/08/2026'])
  expect(requests.filter((r) => r.method === 'POST')).toEqual([{ path: `${prefix}/reports/${report.id}/archive`, method: 'POST' }])
  expect(requests.filter((r) => r.path === `${prefix}/reports`)).toHaveLength(2)
  const archivedCard = archived.getByRole('article', { name: 'Audit Notion — 07/09/2026', exact: true })
  await expect(archivedCard.getByRole('link', { name: /Voir le rapport/ })).toHaveAttribute('href', `https://api.bryanlab.ovh${prefix}/reports/${report.id}/pdf`)
  const download = page.waitForEvent('download')
  await archivedCard.getByRole('link', { name: 'Télécharger PDF' }).click()
  expect((await download).suggestedFilename()).toBe('synthetic.pdf')
})

for (const width of [1280, 390]) {
  test(`buttons are centered and aligned at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    await openAudit(page)
    const card = page.getByRole('region', { name: 'Rapports actifs', exact: true }).getByRole('article').first()
    await expect(card).toBeVisible()
    const layout = await card.locator('.tenant-audit__actions > *').evaluateAll((buttons) => buttons.map((button) => {
      const style = getComputedStyle(button)
      const box = button.getBoundingClientRect()
      const range = document.createRange()
      range.selectNodeContents(button)
      const text = range.getBoundingClientRect()
      return { height: box.height, top: box.top, left: box.left, right: box.right, width: box.width, align: style.alignItems, justify: style.justifyContent, background: style.backgroundColor, xOffset: Math.abs((box.left + box.right - text.left - text.right) / 2), yOffset: Math.abs((box.top + box.bottom - text.top - text.bottom) / 2) }
    }))
    for (const button of layout) {
      expect(button.height).toBeGreaterThanOrEqual(44)
      expect(button.height).toBe(layout[0].height)
      expect(button.align).toBe('center')
      expect(button.justify).toBe('center')
      expect(button.xOffset).toBeLessThan(2)
      expect(button.yOffset).toBeLessThan(3)
      expect(button.left).toBeGreaterThanOrEqual(0)
      expect(button.right).toBeLessThanOrEqual(width)
    }
    expect(layout[0].background).not.toBe(layout[1].background)
    if (width > 540) expect(layout.map((button) => button.top)).toEqual([layout[0].top, layout[0].top, layout[0].top])
    else expect(layout.map((button) => button.width)).toEqual([layout[0].width, layout[0].width, layout[0].width])
    await page.screenshot({ path: testInfo.outputPath(`audit-${width}.png`), fullPage: true })
  })
}

test('an archived tenant has no report links or archive calls', async ({ page }) => {
  const requests = await openAudit(page, { archivedTenant: true })
  await expect(page.getByText('Client archivé : les rapports ne sont pas disponibles.')).toBeVisible()
  expect(requests.some((r) => r.path.includes('/reports'))).toBe(false)
  await expect(page.getByRole('link', { name: /Voir le rapport/ })).toHaveCount(0)
})

test('expired session during archive returns to login', async ({ page }) => {
  await openAudit(page, { archiveStatus: 401 })
  await page.getByRole('button', { name: 'Archiver', exact: true }).first().click()
  await page.getByRole('button', { name: 'Confirmer l’archivage', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Connexion', exact: true })).toBeVisible()
})

test('failed archive keeps the card active and shows a sanitized retry message', async ({ page }) => {
  await openAudit(page, { archiveStatus: 503 })
  await page.getByRole('button', { name: 'Archiver', exact: true }).first().click()
  await page.getByRole('button', { name: 'Confirmer l’archivage', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('Le rapport n’a pas pu être archivé. Réessayez.')
  await expect(page.getByRole('region', { name: 'Rapports actifs', exact: true }).getByRole('article')).toHaveCount(3)
})

test('client workspace does not expose report actions', async ({ page }) => {
  await openAudit(page, { client: true })
  await expect(page.getByRole('heading', { name: 'synthetic', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Audit & cartographie', exact: true })).toHaveCount(0)
})
