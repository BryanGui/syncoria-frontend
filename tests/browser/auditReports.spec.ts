import { test, expect, type Page } from '@playwright/test'

const tenantId = '11111111-1111-4111-8111-111111111111'
const prefix = `/admin/tenants/${tenantId}`
const report = {
  id: 'audit-notion-2026-09-07', title: 'Audit Notion', provider: 'notion',
  report_date: '2026-09-07', status: 'completed',
  sources_analyzed: 3, sources_retained: 2, sources_excluded: 1,
  records_retained: 7, decisions_required: 1,
}

const auditCorrelationId = '33333333-3333-4333-8333-333333333333'
const notionAId = '22222222-2222-4222-8222-222222222222'
const notionBId = '44444444-4444-4444-8444-444444444444'
const unsupportedProviderId = '55555555-5555-4555-8555-555555555555'
const auditPrefix = `${prefix}/providers/${notionAId}/audits`
const auditOperation = (status: 'pending' | 'running' | 'completed' | 'failed') => ({
  phase: status === 'pending' ? 'preparing' : status === 'completed' ? 'completed' : status === 'failed' ? 'failed' : 'collecting',
  tenant_id: tenantId,
  tenant_provider_record_id: '22222222-2222-4222-8222-222222222222',
  provider: 'notion',
  correlation_id: auditCorrelationId,
  status,
  codex_thread_id: status === 'pending' ? null : 'thread-synthetic',
  created_at: '2026-09-11T10:00:00Z',
  started_at: status === 'pending' ? null : '2026-09-11T10:00:01Z',
  completed_at: status === 'completed' || status === 'failed' ? '2026-09-11T10:00:05Z' : null,
  error_code: status === 'failed' ? 'audit_failed' : null,
  report_id: status === 'completed' ? 'audit-notion-2026-09-11' : null,
  sources_total: 5,
  sources_retained: 3,
  sources_excluded: 2,
  sources_pending: 0,
  records_retained: 9,
  decisions_required: 1,
  progress_current: status === 'running' ? 5 : null,
  progress_total: status === 'running' ? 11 : null,
  progress_unit: status === 'running' ? 'source' : null,
})

type AuditScenario = 'launch' | 'resume' | 'failed' | 'conflict' | 'v2' | 'network' | 'timer' | 'abort'

async function openAudit(page: Page, options: {
  archivedTenant?: boolean
  archiveStatus?: number
  client?: boolean
  auditScenario?: AuditScenario
  reportsRefreshFails?: boolean
} = {}) {
  await page.addInitScript(() => {
    const originalAbort = AbortController.prototype.abort
    let abortCount = 0
    Object.defineProperty(window, '__auditAbortCount', { get: () => abortCount })
    AbortController.prototype.abort = function trackedAbort(reason?: unknown) {
      abortCount += 1
      return originalAbort.call(this, reason)
    }
  })
  const tenant = { id: tenantId, name: 'Client synthétique', slug: 'synthetic', status: options.archivedTenant ? 'archived' : 'active' }
  const reports = [
    { ...report },
    { ...report, id: 'audit-notion-2026-10-15', report_date: '2026-10-15' },
    { ...report, id: 'audit-drive-2026-10-16', provider: 'drive', title: 'Audit Drive', report_date: '2026-10-16' },
    { ...report, id: 'audit-notion-2026-08-01', report_date: '2026-08-01', status: 'archived' },
  ]
  let auditPollCount = 0
  let latestCallCount = 0
  let reportCallCount = 0
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
      id: notionAId,
      tenant_id: tenantId,
      provider: 'notion',
      credential_type: 'integration_token',
      name: 'Notion A',
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
    }, {
      id: notionBId, tenant_id: tenantId, provider: 'notion',
      credential_type: 'integration_token', name: 'Notion B', status: 'active', configuration: {},
      credential_configured: true, created_at: '2026-08-14T08:00:00Z', updated_at: '2026-08-14T08:00:00Z',
      last_verified_at: null, last_verification_status: null, last_verification_http_status: null,
      last_verification_code: null, last_verification_message: null,
    }, {
      id: unsupportedProviderId, tenant_id: tenantId, provider: 'n8n',
      credential_type: 'api_key', name: 'n8n synthétique', status: 'active',
      configuration: { base_url: 'https://automation.example.test' }, credential_configured: true,
      created_at: '2026-08-15T08:00:00Z', updated_at: '2026-08-15T08:00:00Z',
      last_verified_at: null, last_verification_status: null, last_verification_http_status: null,
      last_verification_code: null, last_verification_message: null,
    }] })
    if (url.pathname.endsWith('/audits/latest')) {
      latestCallCount += 1
      if (options.auditScenario === 'abort' && url.pathname.includes(notionAId)) {
        await new Promise((resolve) => setTimeout(resolve, 1200))
      }
      if (options.auditScenario === 'conflict' && latestCallCount === 2) await new Promise((resolve) => setTimeout(resolve, 1000))
      const hasActiveLatest = options.auditScenario === 'resume'
        || options.auditScenario === 'timer'
        || options.auditScenario === 'conflict' && latestCallCount === 2
      return route.fulfill({
        json: hasActiveLatest ? {
          ...auditOperation('running'),
          phase: options.auditScenario === 'timer' ? 'analyzing' : 'collecting',
          progress_current: options.auditScenario === 'timer' ? null : 5,
          progress_total: options.auditScenario === 'timer' ? null : 11,
          progress_unit: options.auditScenario === 'timer' ? null : 'source',
        } : {},
        status: hasActiveLatest ? 200 : 404,
      })
    }
    if (url.pathname.endsWith('/audits') && method === 'POST') {
      if (options.auditScenario === 'conflict') return route.fulfill({ status: 409, json: {} })
      return route.fulfill({ status: 202, json: auditOperation('pending') })
    }
    if (url.pathname.endsWith(`/audits/${auditCorrelationId}`)) {
      auditPollCount += 1
      const v2Phases = ['collecting', 'collecting', 'analyzing', 'generating_report', 'publishing', 'completed'] as const
      if (options.auditScenario === 'v2' && auditPollCount === 1) {
        await new Promise((resolve) => setTimeout(resolve, 350))
      }
      if (options.auditScenario === 'network' && auditPollCount === 2) {
        return route.abort('connectionfailed')
      }
      const status = options.auditScenario === 'failed'
        ? auditPollCount > 1 ? 'failed' : 'running'
        : options.auditScenario === 'timer' ? 'running'
          : options.auditScenario === 'network' ? auditPollCount > 2 ? 'completed' : 'running'
        : options.auditScenario === 'v2' ? auditPollCount >= v2Phases.length ? 'completed' : 'running'
          : options.auditScenario === 'resume' || options.auditScenario === 'conflict' || auditPollCount > 1 ? 'completed' : 'running'
      if (status === 'completed' && !reports.some((entry) => entry.id === 'audit-notion-2026-09-11')) {
        reports.unshift({
          ...report,
          id: 'audit-notion-2026-09-11',
          title: 'Audit Notion récent',
          report_date: '2026-09-11',
          sources_analyzed: 5,
          sources_retained: 3,
          sources_excluded: 2,
          records_retained: 9,
          decisions_required: 1,
        })
      }
      const operation = auditOperation(status)
      if (options.auditScenario === 'failed' && status === 'running') {
        operation.phase = 'collecting'
        operation.progress_current = 5
        operation.progress_total = 11
        operation.progress_unit = 'source'
      }
      if (options.auditScenario === 'network' || options.auditScenario === 'timer') {
        operation.phase = 'analyzing'
        operation.progress_current = null
        operation.progress_total = null
        operation.progress_unit = null
      }
      if (options.auditScenario === 'v2') {
        operation.phase = v2Phases[Math.min(auditPollCount - 1, v2Phases.length - 1)]
        operation.progress_current = operation.phase === 'collecting' ? auditPollCount === 1 ? 5 : 11 : null
        operation.progress_total = operation.phase === 'collecting' ? 11 : null
        operation.progress_unit = operation.phase === 'collecting' ? 'source' : null
      }
      return route.fulfill({ json: operation })
    }
    if (url.pathname === `${prefix}/reports`) {
      reportCallCount += 1
      if (options.reportsRefreshFails && reportCallCount > 1) {
        return route.fulfill({ status: 503, json: { detail: 'Temporary failure' } })
      }
      return route.fulfill({ json: reports })
    }
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
    await page.getByRole('button', { name: 'Intégration', exact: true }).click()
    await page.getByRole('button', { name: 'Audit & cartographie', exact: true }).click()
    if (!options.archivedTenant) {
      await page.getByLabel('Connexion à auditer').selectOption(notionAId)
    }
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
  await expect(page.getByRole('button', { name: 'Se connecter', exact: true }).first()).toBeVisible()
})

test('failed archive keeps the card active and shows a sanitized retry message', async ({ page }) => {
  await openAudit(page, { archiveStatus: 503 })
  await page.getByRole('button', { name: 'Archiver', exact: true }).first().click()
  await page.getByRole('button', { name: 'Confirmer l’archivage', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('Le rapport n’a pas pu être archivé. Réessayez.')
  await expect(page.getByRole('region', { name: 'Rapports actifs', exact: true }).getByRole('article')).toHaveCount(3)
})

test('launches an audit, polls it to completion and refreshes active reports', async ({ page }) => {
  const requests = await openAudit(page, { auditScenario: 'launch' })
  const launcher = page.getByRole('region', { name: 'Lancement de l’audit Notion', exact: true })
  await expect(launcher.getByRole('button', { name: 'Lancer l’audit', exact: true })).toBeEnabled()
  await launcher.getByRole('button', { name: 'Lancer l’audit', exact: true }).click()
  await expect(launcher.getByLabel('Connexion à auditer')).toBeDisabled()
  await expect(launcher.getByText('État : Terminé', { exact: true })).toBeVisible()
  await expect(launcher).toContainText('Sources analysées5')
  await expect(launcher).toContainText('Sources retenues3')
  await expect(launcher).toContainText('Sources écartées2')
  await expect(launcher).toContainText('Décisions nécessaires1')
  await expect(launcher).toContainText('Enregistrements retenus9')
  await expect(page.getByRole('region', { name: 'Rapports actifs', exact: true }).getByRole('article', { name: /Audit Notion récent/ })).toBeVisible()
  expect(requests.filter((request) => request.path === auditPrefix && request.method === 'POST')).toHaveLength(1)
  expect(requests.filter((request) => request.path === `${auditPrefix}/${auditCorrelationId}` && request.method === 'GET')).toHaveLength(2)
  expect(requests.filter((request) => request.path === `${prefix}/reports`)).toHaveLength(2)
})

test('lets an administrator choose a provider and renders the real V2 progression', async ({ page }) => {
  test.setTimeout(60000)
  const requests = await openAudit(page, { auditScenario: 'v2' })
  const launcher = page.getByRole('region', { name: 'Lancement de l’audit Notion', exact: true })
  const selector = launcher.getByLabel('Connexion à auditer')
  await expect(selector).toHaveValue('22222222-2222-4222-8222-222222222222')
  await expect(selector.locator('option')).toHaveText([
    'Sélectionner une connexion', 'Notion — Notion A', 'Notion — Notion B',
    'n8n — n8n synthétique · Audit indisponible',
  ])
  await launcher.getByRole('button', { name: 'Lancer l’audit', exact: true }).click()
  await expect(launcher.locator('.tenant-audit__step--current')).toContainText('Préparation')
  await expect(launcher.locator('.tenant-audit__step--current')).toContainText('Collecte des sources')
  await expect(launcher).toContainText('5 / 11')
  await expect(launcher.locator('.tenant-audit__step--current')).toContainText('Collecte des sources')
  await expect(launcher).toContainText('11 / 11')
  await expect(launcher.locator('.tenant-audit__step--current')).toContainText('Analyse des données')
  await expect(launcher).not.toContainText('5 / 11')
  await expect(launcher).not.toContainText('11 / 11')
  await expect(launcher.locator('.tenant-audit__step--current')).toContainText('Génération du rapport')
  await expect(launcher.locator('.tenant-audit__step--current')).toContainText('Publication')
  await expect(launcher).toContainText('État : Terminé')
  await expect(launcher).toContainText('Temps écoulé')
  await expect(launcher).not.toContainText('%')
  await expect(page.getByRole('region', { name: 'Rapports actifs', exact: true }).getByRole('article', { name: /Audit Notion récent/ })).toBeVisible()
  expect(requests.filter((request) => request.path === `${auditPrefix}/${auditCorrelationId}` && request.method === 'GET')).toHaveLength(6)
})

test('shows unsupported active providers without allowing an audit launch', async ({ page }) => {
  await openAudit(page)
  const launcher = page.getByRole('region', { name: 'Lancement de l’audit Notion', exact: true })
  await launcher.getByLabel('Connexion à auditer').selectOption(unsupportedProviderId)
  await expect(launcher).toContainText('Audit indisponible pour cette connexion.')
  await expect(launcher.getByRole('button', { name: 'Lancer l’audit', exact: true })).toBeDisabled()
  await expect(page.locator('body')).not.toContainText('https://automation.example.test')
  await expect(page.locator('body')).not.toContainText('api_key')
})

test('loads latest for each explicit Notion selection and aborts the previous request', async ({ page }) => {
  const requests = await openAudit(page, { auditScenario: 'abort' })
  const selector = page.getByLabel('Connexion à auditer')
  const abortCount = await page.evaluate(
    () => (window as Window & { __auditAbortCount: number }).__auditAbortCount,
  )
  await selector.selectOption(notionBId)
  await expect.poll(() => page.evaluate(
    () => (window as Window & { __auditAbortCount: number }).__auditAbortCount,
  )).toBeGreaterThan(abortCount)
  await expect.poll(() => requests.filter((request) => request.path === `${prefix}/providers/${notionBId}/audits/latest`).length).toBe(1)
  expect(requests.filter((request) => request.path === `${prefix}/providers/${notionAId}/audits/latest`)).toHaveLength(1)
  await expect(page.locator('.tenant-audit__launcher-status')).toHaveCount(0)
})

test('keeps the last valid phase through a temporary polling error', async ({ page }) => {
  test.setTimeout(30000)
  await openAudit(page, { auditScenario: 'network' })
  const launcher = page.getByRole('region', { name: 'Lancement de l’audit Notion', exact: true })
  await launcher.getByRole('button', { name: 'Lancer l’audit', exact: true }).click()
  await expect(launcher.locator('.tenant-audit__step--current')).toContainText('Analyse des données')
  await expect(launcher.getByRole('alert')).toContainText('Réessai automatique')
  await expect(launcher.locator('.tenant-audit__step--current')).toContainText('Analyse des données')
  await expect(launcher.getByText('État : Terminé', { exact: true })).toBeVisible()
})

test('updates elapsed time without placing the timer in a live region', async ({ page }) => {
  await openAudit(page, { auditScenario: 'timer' })
  const elapsed = page.locator('.tenant-audit__elapsed')
  await expect(elapsed).toBeVisible()
  await expect(elapsed).not.toHaveAttribute('aria-live')
  const initial = await elapsed.textContent()
  await page.waitForTimeout(1100)
  await expect.poll(() => elapsed.textContent()).not.toBe(initial)
})

test('stops active polling when leaving the audit view', async ({ page }) => {
  const requests = await openAudit(page, { auditScenario: 'timer' })
  await expect(page.locator('.tenant-audit__step--current')).toContainText('Analyse des données')
  const pollCount = requests.filter((request) => request.path === `${auditPrefix}/${auditCorrelationId}`).length
  const abortCount = await page.evaluate(
    () => (window as Window & { __auditAbortCount: number }).__auditAbortCount,
  )
  await page.getByRole('button', { name: 'Ingestion', exact: true }).click()
  await expect.poll(() => page.evaluate(
    () => (window as Window & { __auditAbortCount: number }).__auditAbortCount,
  )).toBeGreaterThan(abortCount)
  await page.waitForTimeout(2700)
  expect(requests.filter((request) => request.path === `${auditPrefix}/${auditCorrelationId}`)).toHaveLength(pollCount)
})

test('resumes a running audit on mount and stops after completion', async ({ page }) => {
  const requests = await openAudit(page, { auditScenario: 'resume' })
  const launcher = page.getByRole('region', { name: 'Lancement de l’audit Notion', exact: true })
  await expect(launcher.getByText('État : Terminé', { exact: true })).toBeVisible()
  await expect(launcher.getByRole('button', { name: 'Lancer l’audit', exact: true })).toBeEnabled()
  expect(requests.some((request) => request.path === auditPrefix && request.method === 'POST')).toBe(false)
  expect(requests.filter((request) => request.path === `${auditPrefix}/${auditCorrelationId}` && request.method === 'GET')).toHaveLength(1)
})

test('failed audit stops polling and allows a new launch', async ({ page }) => {
  const requests = await openAudit(page, { auditScenario: 'failed' })
  const launcher = page.getByRole('region', { name: 'Lancement de l’audit Notion', exact: true })
  await launcher.getByRole('button', { name: 'Lancer l’audit', exact: true }).click()
  await expect(launcher.getByText('Échec de l’audit', { exact: true })).toBeVisible()
  await expect(launcher).toContainText('5 / 11')
  await expect(launcher.locator('.tenant-audit__step--complete', {
    hasText: 'Collecte des sources',
  })).toBeVisible()
  await expect(launcher.getByRole('button', { name: 'Lancer l’audit', exact: true })).toBeEnabled()
  const pollCount = requests.filter((request) => request.path === `${auditPrefix}/${auditCorrelationId}` && request.method === 'GET').length
  await page.waitForTimeout(2700)
  expect(requests.filter((request) => request.path === `${auditPrefix}/${auditCorrelationId}` && request.method === 'GET')).toHaveLength(pollCount)
})

test('keeps report history visible when the post-completion refresh fails', async ({ page }) => {
  const requests = await openAudit(page, {
    auditScenario: 'launch',
    reportsRefreshFails: true,
  })
  const activeReports = page.getByRole('region', { name: 'Rapports actifs', exact: true })
  const archivedReports = page.getByRole('region', { name: 'Rapports archivés', exact: true })
  await expect(activeReports.getByRole('article')).toHaveCount(3)
  await page.getByRole('button', { name: 'Lancer l’audit', exact: true }).click()
  await expect(page.getByText('La mise à jour des rapports est temporairement indisponible.')).toBeVisible()
  await expect(activeReports.getByRole('article')).toHaveCount(3)
  await expect(archivedReports.getByRole('article')).toHaveCount(1)
  expect(requests.filter((request) => request.path === `${prefix}/reports`)).toHaveLength(2)
})

test('409 keeps launch locked while latest is recovered and then resumes polling', async ({ page }) => {
  const requests = await openAudit(page, { auditScenario: 'conflict' })
  const launcher = page.getByRole('region', { name: 'Lancement de l’audit Notion', exact: true })
  const button = launcher.getByRole('button')
  await button.click()
  await expect(button).toBeDisabled()
  await expect(launcher.getByText('État : Terminé', { exact: true })).toBeVisible()
  expect(requests.filter((request) => request.path === auditPrefix && request.method === 'POST')).toHaveLength(1)
  expect(requests.filter((request) => request.path === `${prefix}/providers/${notionAId}/audits/latest`)).toHaveLength(2)
  expect(requests.filter((request) => request.path === `${auditPrefix}/${auditCorrelationId}` && request.method === 'GET')).toHaveLength(1)
})

test('client workspace does not expose report actions', async ({ page }) => {
  await openAudit(page, { client: true })
  await expect(page.getByRole('heading', { name: 'synthetic', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Audit & cartographie', exact: true })).toHaveCount(0)
})
