import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const tenantId = '11111111-1111-4111-8111-111111111111'
const prefix = `/admin/tenants/${tenantId}`
const report = {
  id: 'audit-notion-2026-09-07', title: 'Audit Notion', provider: 'notion',
  correlation_id: '33333333-3333-4333-8333-333333333333',
  tenant_provider_record_id: '22222222-2222-4222-8222-222222222222',
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
  provider: 'notion',
  tenant_provider_record_id: notionAId,
  correlation_id: auditCorrelationId,
  status,
  display_title: 'Audit Notion — 2026-09-11',
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

function structuredReport(label: string, targetTable: string | null = 'Contacts') {
  return {
    metrics: { sources_analyzed: 1, sources_retained: 1, sources_excluded: 0, sources_pending: 0, records_retained: 2, decisions_required: 0 },
    summary: [], scope: [], source_map: [], sources: [], retained: [], excluded: [], pending: [],
    volumes: [], relationships: [], inconsistencies: [], risks: [], decisions: [], blockers: [], recommendations: [], integration_plan: [], technical_appendix: [],
    raw_ddl: `-- ${label}\nCREATE TABLE "${label}" ();\n`,
    raw_er: {
      format: 'syncoria-raw-er-v1',
      tables: [{
        name: label, source_name: `${label} source`, external_source_id: `${label}-source`,
        columns: [{ name: 'Observed field', external_field_id: `${label}-field`, provider_type: 'rich_text', postgres_type: 'text', position: 0 }],
        primary_key: [], foreign_keys: [],
      }],
      relationships: [{
        source_table: label, source_column: 'Related', target_table: targetTable,
        target_source_external_id: targetTable === null ? 'unresolved-source' : 'target-source',
        target_column: null, cardinality: 'unknown',
      }],
    },
  }
}

type AuditScenario = 'launch' | 'resume' | 'failed' | 'conflict' | 'v2' | 'network' | 'timer' | 'abort'

async function openAudit(page: Page, options: {
  archivedTenant?: boolean
  archiveStatus?: number
  renameStatus?: number
  client?: boolean
  auditScenario?: AuditScenario
  reportsRefreshFails?: boolean
  nullDecision?: boolean
  latestTitle?: string
  legacyReport?: boolean
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
  const { correlation_id: _correlationId, tenant_provider_record_id: _providerRecordId, ...legacyReport } = report
  const reports = [
    { ...report, decisions_required: options.nullDecision ? null : report.decisions_required },
    { ...report, id: 'audit-notion-2026-10-15', correlation_id: '66666666-6666-4666-8666-666666666666', report_date: '2026-10-15', decisions_required: options.nullDecision ? null : report.decisions_required },
    { ...report, id: 'audit-drive-2026-10-16', provider: 'drive', title: 'Audit Drive', correlation_id: '77777777-7777-4777-8777-777777777777', report_date: '2026-10-16', decisions_required: options.nullDecision ? null : report.decisions_required },
    { ...report, id: 'audit-notion-2026-08-01', correlation_id: '88888888-8888-4888-8888-888888888888', report_date: '2026-08-01', status: 'archived', decisions_required: options.nullDecision ? null : report.decisions_required },
    ...(options.legacyReport ? [{ ...legacyReport, id: 'audit-legacy-2026-07-01', report_date: '2026-07-01' }] : []),
  ]
  let auditPollCount = 0
  let latestCallCount = 0
  let reportCallCount = 0
  let launchedTitle = 'Audit Notion — 2026-09-11'
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
      audit_supported: true,
      initial_ingestion_supported: true,
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
      audit_supported: true,
      initial_ingestion_supported: true,
      credential_type: 'integration_token', name: 'Notion B', status: 'active', configuration: {},
      credential_configured: true, created_at: '2026-08-14T08:00:00Z', updated_at: '2026-08-14T08:00:00Z',
      last_verified_at: null, last_verification_status: null, last_verification_http_status: null,
      last_verification_code: null, last_verification_message: null,
    }, {
      id: unsupportedProviderId, tenant_id: tenantId, provider: 'n8n',
      audit_supported: false,
      initial_ingestion_supported: false,
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
      if (options.latestTitle) return route.fulfill({
        json: { ...auditOperation('completed'), display_title: options.latestTitle },
      })
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
      const payload = route.request().postDataJSON() as { display_title?: string } | null
      launchedTitle = payload?.display_title ?? launchedTitle
      return route.fulfill({ status: 202, json: { ...auditOperation('pending'), display_title: launchedTitle } })
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
          title: launchedTitle,
          report_date: '2026-10-17',
          sources_analyzed: 5,
          sources_retained: 3,
          sources_excluded: 2,
          records_retained: 9,
          decisions_required: 1,
        })
      }
      const operation = { ...auditOperation(status), display_title: launchedTitle }
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
    if (url.pathname.endsWith('/report')) {
      const correlation = url.pathname.split('/audits/')[1]?.split('/')[0]
      const selected = reports.find((entry) => entry.correlation_id === correlation)
      if (!selected) return route.fulfill({ status: 404, json: {} })
      return route.fulfill({ json: {
        tenant_id: tenantId,
        tenant_provider_record_id: selected.tenant_provider_record_id,
        correlation_id: selected.correlation_id,
        report_id: selected.id,
        display_title: selected.title,
        provider: selected.provider,
        report_date: selected.report_date,
        status: 'completed',
        structured_report: structuredReport(selected.title, selected.provider === 'drive' ? null : 'Contacts'),
      } })
    }
    if (url.pathname.endsWith('/title') && method === 'PATCH') {
      if (options.renameStatus) return route.fulfill({ status: options.renameStatus, json: { detail: 'Rename unavailable' } })
      const payload = route.request().postDataJSON() as { display_title: string }
      return route.fulfill({ json: { ...auditOperation('completed'), display_title: payload.display_title, report_id: 'audit-notion-2026-09-07' } })
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
    await page.getByRole('button', { name: 'Audit & intégration', exact: true }).click()
    await page.getByRole('button', { name: 'Audit & cartographie', exact: true }).click()
  }
  return requests
}

test('history is the primary entry point and exposes direct actions per audit', async ({ page }) => {
  await openAudit(page)
  await expect(page.getByRole('heading', { name: 'Client synthétique', exact: true })).toBeVisible()
  await expect(page.locator('body')).not.toContainText('Espace tenant')
  await expect(page.locator('body')).not.toContainText('Intégration\nPréparez les données du provider')
  const history = page.getByRole('region', { name: 'Historique des audits', exact: true })
  await expect(history.locator('.tenant-audit__history-item')).toHaveCount(3)
  await expect(history.locator('time')).toHaveText(['16/10/2026', '15/10/2026', '07/09/2026'])
  const drive = history.locator('.tenant-audit__history-item', { hasText: 'Audit Drive' })
  await expect(drive).toContainText('Provider : Drive')
  await expect(drive).toContainText('Terminé')
  await expect(history).not.toContainText(/\d+ audits?\b/)
  for (const action of ['Voir rapport', 'Télécharger PDF', 'DDL brut', 'ER brut']) {
    await expect(drive.locator('.tenant-audit__history-actions--primary').getByRole(action === 'Voir rapport' || action === 'Télécharger PDF' ? 'link' : 'button', { name: action, exact: true })).toBeVisible()
  }
  for (const action of ['Renommer', 'Archiver']) await expect(drive.locator('.tenant-audit__history-actions--secondary').getByRole('button', { name: action, exact: action === 'Archiver' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Rapport sélectionné', exact: true })).toHaveCount(0)
})

test('separates archives and removes an archived audit from the main history', async ({ page }) => {
  const requests = await openAudit(page)
  const history = page.getByRole('region', { name: 'Historique des audits', exact: true })
  await expect(history.locator('.tenant-audit__history-item')).toHaveCount(3)
  await history.getByRole('button', { name: 'Voir les archives', exact: true }).click()
  await expect(history.locator('.tenant-audit__history-item')).toHaveCount(1)
  await expect(history).toContainText('01/08/2026')
  await expect(history.getByRole('button', { name: 'Retour aux audits', exact: true })).toBeVisible()
  await history.getByRole('button', { name: 'Retour aux audits', exact: true }).click()
  const audit = history.locator('.tenant-audit__history-item', { hasText: 'Audit Notion' }).filter({ hasText: '07/09/2026' })
  await audit.getByRole('button', { name: 'Archiver', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  expect(requests.filter((r) => r.method === 'POST')).toHaveLength(0)
  await page.getByRole('button', { name: 'Annuler', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  expect(requests.filter((r) => r.method === 'POST')).toHaveLength(0)
  await audit.getByRole('button', { name: 'Archiver', exact: true }).click()
  await page.getByRole('button', { name: 'Confirmer l’archivage', exact: true }).click()
  await expect(history.locator('.tenant-audit__history-item')).toHaveCount(2)
  await expect(history).not.toContainText('07/09/2026')
  await history.getByRole('button', { name: 'Voir les archives', exact: true }).click()
  const archived = history.locator('.tenant-audit__history-item', { hasText: 'Audit Notion' }).filter({ hasText: '07/09/2026' })
  await expect(archived).toContainText('Archivé')
  await expect(archived.locator('.tenant-audit__history-actions--primary').getByRole('link', { name: 'Voir rapport', exact: true })).toBeVisible()
  await expect(archived.locator('.tenant-audit__history-actions--primary').getByRole('link', { name: 'Télécharger PDF', exact: true })).toBeVisible()
  await expect(archived.locator('.tenant-audit__history-actions--secondary').getByRole('button', { name: /^Renommer/ })).toBeVisible()
  await expect(archived.locator('.tenant-audit__history-actions--secondary').getByRole('button', { name: 'Archiver', exact: true })).toHaveCount(0)
  expect(requests.filter((r) => r.method === 'POST')).toEqual([{ path: `${prefix}/reports/${report.id}/archive`, method: 'POST' }])
  expect(requests.filter((r) => r.path === `${prefix}/reports`)).toHaveLength(2)
  const download = page.waitForEvent('download')
  await history.locator('.tenant-audit__history-item', { hasText: 'Audit Notion' }).filter({ hasText: '07/09/2026' }).getByRole('link', { name: 'Télécharger PDF' }).click()
  expect((await download).suggestedFilename()).toBe('synthetic.pdf')
})

test('opens exact DDL and ER artifacts under their audit row', async ({ page }) => {
  await openAudit(page)
  const history = page.getByRole('region', { name: 'Historique des audits', exact: true })
  const drive = history.locator('.tenant-audit__history-item', { hasText: 'Audit Drive' })
  await drive.getByRole('button', { name: 'DDL brut', exact: true }).click()
  const artifacts = drive.getByRole('region', { name: 'Artefacts de Audit Drive', exact: true })
  await expect(artifacts.locator('pre')).toHaveText('-- Audit Drive\nCREATE TABLE "Audit Drive" ();\n')
  await expect(artifacts).not.toContainText('Le téléchargement est disponible après ouverture du DDL.')
  const download = page.waitForEvent('download')
  await artifacts.getByRole('link', { name: 'Télécharger le DDL brut', exact: true }).click()
  const downloaded = await (await download).path()
  expect(downloaded).not.toBeNull()
  expect(await readFile(downloaded!, 'utf8')).toBe('-- Audit Drive\nCREATE TABLE "Audit Drive" ();\n')
  await drive.getByRole('button', { name: 'ER brut', exact: true }).click()
  const diagram = drive.locator('.raw-er-diagram')
  await expect(diagram.locator('.raw-er-node')).toBeVisible()
  await expect(diagram).toContainText('Observed field')
  await expect(diagram).toContainText('text')
  await expect(diagram).toContainText('Relations observées à cible non résolue')
  await expect(diagram).not.toContainText('Table Contacts')
  const erJsonDownload = page.waitForEvent('download')
  await artifacts.getByRole('link', { name: 'Télécharger l’ER brut (JSON)', exact: true }).click()
  const erJsonPath = await (await erJsonDownload).path()
  expect(erJsonPath).not.toBeNull()
  expect(JSON.parse(await readFile(erJsonPath!, 'utf8'))).toEqual(structuredReport('Audit Drive', null).raw_er)
  const erMermaidDownload = page.waitForEvent('download')
  await artifacts.getByRole('link', { name: 'Télécharger l’ER brut (Mermaid)', exact: true }).click()
  const erMermaidPath = await (await erMermaidDownload).path()
  expect(erMermaidPath).not.toBeNull()
  const erMermaid = await readFile(erMermaidPath!, 'utf8')
  expect(erMermaid).toContain('flowchart LR')
  expect(erMermaid).toContain('Audit Drive')
  expect(erMermaid).toContain('Relation observée non résolue')
})

test('opening another audit replaces the previous row artifacts', async ({ page }) => {
  await openAudit(page)
  const history = page.getByRole('region', { name: 'Historique des audits', exact: true })
  const drive = history.locator('.tenant-audit__history-item', { hasText: 'Audit Drive' })
  await drive.getByRole('button', { name: 'DDL brut', exact: true }).click()
  await expect(drive.locator('pre')).toContainText('-- Audit Drive')
  const notion = history.locator('.tenant-audit__history-item', { hasText: 'Audit Notion' }).filter({ hasText: '07/09/2026' })
  await notion.getByRole('button', { name: 'DDL brut', exact: true }).click()
  await expect(drive.locator('pre')).toHaveCount(0)
  await expect(notion.locator('pre')).toContainText('-- Audit Notion')
  await expect(notion.locator('pre')).not.toContainText('-- Audit Drive')
})

test('keeps decisions neutral when the backend does not provide them', async ({ page }) => {
  await openAudit(page, { nullDecision: true })
  const history = page.getByRole('region', { name: 'Historique des audits', exact: true })
  await expect(history).not.toContainText('Décisions nécessaires')
})

for (const width of [1280, 390]) {
  test(`buttons are centered and aligned at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    await openAudit(page)
    const history = page.getByRole('region', { name: 'Historique des audits', exact: true })
    const card = history.locator('.tenant-audit__history-item').first()
    await expect(card).toBeVisible()
    const layout = await card.locator('.tenant-audit__history-actions > *').evaluateAll((buttons) => buttons.map((button) => {
      const box = button.getBoundingClientRect()
      return { height: box.height, left: box.left, right: box.right }
    }))
    for (const button of layout) {
      expect(button.height).toBeGreaterThanOrEqual(40)
      expect(button.left).toBeGreaterThanOrEqual(0)
      expect(button.right).toBeLessThanOrEqual(width)
    }
    await page.screenshot({ path: testInfo.outputPath(`audit-${width}.png`), fullPage: true })
  })
}

test('an archived tenant has no report links or archive calls', async ({ page }) => {
  const requests = await openAudit(page, { archivedTenant: true })
  await expect(page.getByText('Client archivé : les rapports ne sont pas disponibles.')).toBeVisible()
  expect(requests.some((r) => r.path.includes('/reports'))).toBe(false)
  await expect(page.getByRole('button', { name: /Voir le rapport/ })).toHaveCount(0)
})

test('expired session during archive returns to login', async ({ page }) => {
  await openAudit(page, { archiveStatus: 401 })
  await page.getByRole('button', { name: 'Archiver', exact: true }).first().click()
  await page.getByRole('button', { name: 'Confirmer l’archivage', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Se connecter', exact: true }).first()).toBeVisible()
})

test('failed archive keeps the selected report active and shows a sanitized retry message', async ({ page }) => {
  await openAudit(page, { archiveStatus: 503 })
  await page.getByRole('button', { name: 'Archiver', exact: true }).first().click()
  await page.getByRole('button', { name: 'Confirmer l’archivage', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('Le rapport n’a pas pu être archivé. Réessayez.')
  await expect(page.getByRole('region', { name: 'Historique des audits', exact: true }).locator('.tenant-audit__history-item')).toHaveCount(3)
})

test('launches an audit, polls it to completion and refreshes active reports', async ({ page }) => {
  const requests = await openAudit(page, { auditScenario: 'launch' })
  const launcher = page.getByRole('region', { name: 'Lancement de l’audit', exact: true })
  await expect(launcher).not.toContainText('Nouvelle restitution')
  await launcher.getByLabel('Titre de l’audit').fill('Audit recrutement Novalia')
  await expect(launcher.getByRole('button', { name: 'Lancer l’audit', exact: true })).toBeEnabled()
  await launcher.getByRole('button', { name: 'Lancer l’audit', exact: true }).click()
  await expect(launcher.getByRole('combobox', { name: 'Provider à auditer' })).toBeDisabled()
  await expect(launcher.getByText('État : Terminé', { exact: true })).toBeVisible()
  await expect(launcher).toContainText('Sources analysées5')
  await expect(launcher).toContainText('Sources retenues3')
  await expect(launcher).toContainText('Sources écartées2')
  await expect(launcher).toContainText('Décisions nécessaires1')
  await expect(launcher).toContainText('Enregistrements retenus9')
  await expect(page.getByRole('region', { name: 'Historique des audits', exact: true }).locator('.tenant-audit__history-item', { hasText: 'Audit recrutement Novalia' })).toBeVisible()
  expect(requests.filter((request) => request.path === auditPrefix && request.method === 'POST')).toHaveLength(1)
  expect(requests.filter((request) => request.path === `${auditPrefix}/${auditCorrelationId}` && request.method === 'GET')).toHaveLength(2)
  expect(requests.filter((request) => request.path === `${prefix}/reports`)).toHaveLength(2)
})

test('does not render a permanent selected-report panel', async ({ page }) => {
  await openAudit(page)
  await expect(page.getByRole('region', { name: 'Historique des audits', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Rapport sélectionné', exact: true })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Audit sélectionné', exact: true })).toHaveCount(0)
})

test('keeps the next audit title independent from the latest audit title', async ({ page }) => {
  await openAudit(page, { latestTitle: 'Ancien titre du dernier audit' })
  const launcher = page.getByRole('region', { name: 'Lancement de l’audit', exact: true })
  await launcher.getByRole('combobox', { name: 'Provider à auditer' }).selectOption(notionBId)
  await expect(launcher.getByLabel('Titre de l’audit')).toHaveValue(/Audit Notion — \d{4}-\d{2}-\d{2}/)
  await expect(launcher.getByLabel('Titre de l’audit')).not.toHaveValue('Ancien titre du dernier audit')
  await expect(launcher).toContainText('État : Terminé')
})

test('keeps report actions available for a legacy report without audit references', async ({ page }) => {
  await openAudit(page, { legacyReport: true })
  const history = page.getByRole('region', { name: 'Historique des audits', exact: true })
  const legacy = history.locator('.tenant-audit__history-item', { hasText: 'Audit Notion' }).filter({ hasText: '01/07/2026' })
  await expect(legacy.getByRole('button', { name: /Renommer/ })).toHaveCount(0)
  await expect(legacy.getByRole('link', { name: 'Voir rapport', exact: true })).toBeVisible()
  await expect(legacy.getByRole('link', { name: 'Télécharger PDF' })).toBeVisible()
  await expect(legacy.getByRole('button', { name: 'DDL brut', exact: true })).toHaveCount(0)
  await expect(legacy.getByRole('button', { name: 'ER brut', exact: true })).toHaveCount(0)
})

test('keeps report actions and metadata attached to the audit row', async ({ page }) => {
  const requests = await openAudit(page)
  const history = page.getByRole('region', { name: 'Historique des audits', exact: true })
  const notion = history.locator('.tenant-audit__history-item', { hasText: 'Audit Notion' }).filter({ hasText: '07/09/2026' })
  await expect(notion).toContainText('Provider : Notion')
  await expect(notion).toContainText('07/09/2026')
  await expect(notion.getByRole('link', { name: 'Voir rapport', exact: true })).toHaveAttribute('target', '_blank')
  await expect(notion.getByRole('link', { name: 'Télécharger PDF', exact: true })).toBeVisible()
  await expect(notion).not.toContainText('BLOCKER : confirmer le périmètre.')
  await expect(notion).not.toContainText('Recommandations Syncoria')
  expect(requests.filter((request) => request.path === `${auditPrefix}/${auditCorrelationId}/report` && request.method === 'GET')).toHaveLength(0)
})

test('renames a report in place and keeps its report actions available', async ({ page }) => {
  const requests = await openAudit(page)
  const history = page.getByRole('region', { name: 'Historique des audits', exact: true })
  const notion = history.locator('.tenant-audit__history-item').filter({ hasText: '07/09/2026' })
  await notion.getByRole('button', { name: /Renommer/ }).click()
  await notion.getByLabel('Nouveau titre').fill('Audit recrutement — phase 1')
  await notion.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(notion).toContainText('Audit recrutement — phase 1')
  await expect(history.locator('.tenant-audit__history-item', { hasText: 'Audit recrutement — phase 1' })).toBeVisible()
  expect(requests.filter((request) => request.path === `${auditPrefix}/${auditCorrelationId}/title` && request.method === 'PATCH')).toHaveLength(1)
  expect(requests.filter((request) => request.path === `${auditPrefix}/${auditCorrelationId}` && request.method === 'GET')).toHaveLength(0)
})

test('shows a sanitized rename error and keeps the existing title', async ({ page }) => {
  await openAudit(page, { renameStatus: 503 })
  const history = page.getByRole('region', { name: 'Historique des audits', exact: true })
  const notion = history.locator('.tenant-audit__history-item', { hasText: 'Audit Notion' }).filter({ hasText: '07/09/2026' })
  await notion.getByRole('button', { name: /Renommer/ }).click()
  await notion.getByLabel('Nouveau titre').fill('Titre non sauvegardé')
  await notion.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(notion.getByRole('alert')).toHaveText('Le titre n’a pas pu être enregistré. Réessayez.')
  await expect(notion).toContainText('Audit Notion')
})

test('adds a newly published audit without changing the existing row actions', async ({ page }) => {
  const requests = await openAudit(page, { auditScenario: 'launch' })
  const history = page.getByRole('region', { name: 'Historique des audits', exact: true })
  const notion = history.locator('.tenant-audit__history-item', { hasText: 'Audit Notion' }).filter({ hasText: '07/09/2026' })
  await expect(notion).toBeVisible()
  const launcher = page.getByRole('region', { name: 'Lancement de l’audit', exact: true })
  await launcher.getByRole('button', { name: 'Lancer l’audit', exact: true }).click()
  await expect(launcher.getByText('État : Terminé', { exact: true })).toBeVisible()
  await expect(history.locator('.tenant-audit__history-item', { hasText: /Audit Notion —/ })).toBeVisible()
  await expect(notion.getByRole('link', { name: 'Voir rapport', exact: true })).toBeVisible()
  expect(requests.filter((request) => request.path === `${prefix}/reports`)).toHaveLength(2)
})

test('lets an administrator choose a provider and renders the real V2 progression', async ({ page }) => {
  test.setTimeout(60000)
  const requests = await openAudit(page, { auditScenario: 'v2' })
  const launcher = page.getByRole('region', { name: 'Lancement de l’audit', exact: true })
  const selector = launcher.getByRole('combobox', { name: 'Provider à auditer' })
  await expect(selector).toHaveValue(notionAId)
  await expect(selector.locator('option')).toHaveCount(3)
  await selector.selectOption(notionBId)
  await expect(selector).toHaveValue(notionBId)
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
  await expect(page.getByRole('region', { name: 'Historique des audits', exact: true }).locator('.tenant-audit__history-item', { hasText: /Audit Notion —/ })).toBeVisible()
  const selectedAuditPrefix = `${prefix}/providers/${notionBId}/audits`
  expect(requests.filter((request) => request.path === selectedAuditPrefix && request.method === 'POST')).toHaveLength(1)
  expect(requests.filter((request) => request.path === `${selectedAuditPrefix}/${auditCorrelationId}` && request.method === 'GET')).toHaveLength(6)
})

test('shows unsupported active providers without allowing an audit launch', async ({ page }) => {
  await openAudit(page)
  const launcher = page.getByRole('region', { name: 'Lancement de l’audit', exact: true })
  await expect(launcher.getByRole('option', { name: /n8n synthétique — indisponible/ })).toBeDisabled()
  await expect(launcher).toContainText('non auditables')
  await expect(launcher.getByRole('button', { name: 'Lancer l’audit', exact: true })).toBeEnabled()
  await expect(page.locator('body')).not.toContainText('https://automation.example.test')
  await expect(page.locator('body')).not.toContainText('api_key')
})

test('loads latest for each explicit Notion selection and aborts the previous request', async ({ page }) => {
  const requests = await openAudit(page, { auditScenario: 'abort' })
  const selector = page.getByRole('combobox', { name: 'Provider à auditer' })
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
  const launcher = page.getByRole('region', { name: 'Lancement de l’audit', exact: true })
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
  const launcher = page.getByRole('region', { name: 'Lancement de l’audit', exact: true })
  await expect(launcher.getByText('État : Terminé', { exact: true })).toBeVisible()
  await expect(launcher.getByRole('button', { name: 'Lancer l’audit', exact: true })).toBeEnabled()
  expect(requests.some((request) => request.path === auditPrefix && request.method === 'POST')).toBe(false)
  expect(requests.filter((request) => request.path === `${auditPrefix}/${auditCorrelationId}` && request.method === 'GET')).toHaveLength(1)
})

test('failed audit stops polling and allows a new launch', async ({ page }) => {
  const requests = await openAudit(page, { auditScenario: 'failed' })
  const launcher = page.getByRole('region', { name: 'Lancement de l’audit', exact: true })
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
  const history = page.getByRole('region', { name: 'Historique des audits', exact: true })
  await expect(history.locator('.tenant-audit__history-item')).toHaveCount(3)
  await expect(history).toContainText('Audit Drive')
  await page.getByRole('button', { name: 'Lancer l’audit', exact: true }).click()
  await expect(page.getByText('La mise à jour des rapports est temporairement indisponible.')).toBeVisible()
  await expect(history.locator('.tenant-audit__history-item')).toHaveCount(3)
  await expect(history).toContainText('Audit Drive')
  expect(requests.filter((request) => request.path === `${prefix}/reports`)).toHaveLength(2)
})

test('409 recovers the active audit and resumes polling', async ({ page }) => {
  const requests = await openAudit(page, { auditScenario: 'conflict' })
  const launcher = page.getByRole('region', { name: 'Lancement de l’audit', exact: true })
  const button = launcher.getByRole('button', { name: 'Lancer l’audit', exact: true })
  await button.click()
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
