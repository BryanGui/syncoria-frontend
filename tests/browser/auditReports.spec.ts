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
const unavailableProviderId = '99999999-9999-4999-8999-999999999999'
const hubspotId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const screenshotDir = 'docs/screenshots/audit-tabular'
const auditPrefix = `${prefix}/providers/${notionAId}/audits`
const auditStartedAt = new Date(Date.now() - 25_000).toISOString()
const auditOperation = (status: 'pending' | 'running' | 'completed' | 'failed') => ({
  phase: status === 'pending' ? 'preparing' : status === 'completed' ? 'completed' : status === 'failed' ? 'failed' : 'collecting',
  tenant_id: tenantId,
  provider: 'notion',
  tenant_provider_record_id: notionAId,
  correlation_id: auditCorrelationId,
  status,
  display_title: 'Audit Notion — 2026-09-11',
  codex_thread_id: status === 'pending' ? null : 'thread-synthetic',
  created_at: auditStartedAt,
  started_at: status === 'pending' ? null : auditStartedAt,
  completed_at: status === 'completed' || status === 'failed' ? new Date().toISOString() : null,
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
  latestStatus?: 'completed' | 'failed'
  legacyReport?: boolean
  globalReport?: boolean
  missingCredential?: boolean
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
    { ...report, id: 'audit-notion-long-2026-08-03', title: 'Audit Notion avec un titre volontairement très long', correlation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', report_date: '2026-08-03', status: 'archived', decisions_required: options.nullDecision ? null : 2 },
    { ...report, id: 'audit-drive-short-2026-08-02', provider: 'drive', title: 'Audit court', correlation_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', report_date: '2026-08-02', status: 'archived', decisions_required: options.nullDecision ? null : 2 },
    ...(options.legacyReport ? [{ ...legacyReport, id: 'audit-legacy-2026-07-01', report_date: '2026-07-01' }] : []),
    ...(options.globalReport ? [{ ...report, id: 'audit-multi-2026-11-01', title: 'Audit multi-provider', report_date: '2026-11-01', scope_kind: 'global', tenant_provider_record_ids: [notionAId, hubspotId], sources_analyzed: 32, decisions_required: 8 }] : []),
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
      credential_configured: !options.missingCredential,
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
      id: hubspotId, tenant_id: tenantId, provider: 'hubspot',
      audit_supported: true, initial_ingestion_supported: false,
      credential_type: 'api_key', name: 'HubSpot synthétique', status: 'active', configuration: {},
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
    }, {
      id: unavailableProviderId, tenant_id: tenantId, provider: 'notion',
      audit_supported: true,
      initial_ingestion_supported: true,
      credential_type: 'integration_token', name: 'Notion indisponible', status: 'inactive', configuration: {},
      credential_configured: true, created_at: '2026-08-16T08:00:00Z', updated_at: '2026-08-16T08:00:00Z',
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
        json: { ...auditOperation(options.latestStatus ?? 'completed'), display_title: options.latestTitle },
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
    await expect(page.getByRole('heading', { name: 'Client synthétique', exact: true })).toBeVisible()
    const mobileMenu = page.getByRole('button', { name: 'Menu du client' })
    if (await mobileMenu.isVisible()) await mobileMenu.click()
    await page.getByRole('button', { name: 'Audit', exact: true }).click()
  }
  return requests
}


function launcher(page: Page) {
  return page.getByRole('region', { name: 'Lancement de l’audit', exact: true })
}

function history(page: Page) {
  return page.getByRole('region', { name: 'Historique des audits', exact: true })
}

function providerCheckbox(page: Page, name: string) {
  return launcher(page).locator('.ui-selectable-list__row').filter({ hasText: name }).getByRole('checkbox')
}

function historyRow(page: Page, title: string) {
  return history(page).locator('tr.tenant-audit__history-item').filter({ hasText: title })
}

async function openReportMenu(page: Page, title: string) {
  await historyRow(page, title).getByRole('button', { name: 'Actions de l’audit' }).click()
  const menu = page.locator('.ui-action-menu__content--portal')
  await expect(menu).toBeVisible()
  return menu
}

test('provider checkboxes precede the title and support a genuine multiple selection', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const requests = await openAudit(page)
  const launch = launcher(page)
  const list = launch.locator('.tenant-audit__provider-options .ui-selectable-list')
  await expect(list.getByRole('checkbox')).toHaveCount(5)
  await expect(providerCheckbox(page, 'Notion A')).toBeChecked()
  await expect(providerCheckbox(page, 'n8n synthétique')).toBeDisabled()
  await expect(providerCheckbox(page, 'Notion indisponible')).toBeDisabled()
  await expect(launch).toContainText('1 provider sélectionné')
  await expect(launch).not.toContainText('Une connexion par audit')
  await expect(list.locator('.provider-logo')).toHaveCount(5)
  expect(await launch.locator('.tenant-audit__provider-list').evaluate((element) => element.compareDocumentPosition(document.getElementById('audit-title')) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy()
  await page.screenshot({ path: `${screenshotDir}/01-launcher-single.png`, fullPage: true })
  await providerCheckbox(page, 'HubSpot synthétique').check()
  await expect(providerCheckbox(page, 'Notion A')).toBeChecked()
  await expect(providerCheckbox(page, 'HubSpot synthétique')).toBeChecked()
  await expect(launch).toContainText('2 providers sélectionnés')
  await expect(launch.getByLabel('Titre de l’audit')).toHaveValue(/Audit Notion \+ HubSpot — \d{2}\/\d{2}\/\d{4}/)
  await expect(launch.getByRole('button', { name: 'Lancer l’audit' })).toBeDisabled()
  await expect(launch).toContainText('prise en charge de l’API d’audit')
  expect(requests.filter((request) => request.method === 'POST')).toHaveLength(0)
  await page.screenshot({ path: `${screenshotDir}/02-launcher-multiple.png`, fullPage: true })
  await providerCheckbox(page, 'Notion B').check()
  await expect(launch.getByLabel('Titre de l’audit')).toHaveValue(/Audit multi-provider — \d{2}\/\d{2}\/\d{4}/)
  await providerCheckbox(page, 'HubSpot synthétique').uncheck()
  await providerCheckbox(page, 'Notion A').uncheck()
  await expect(launch.getByRole('button', { name: 'Lancer l’audit' })).toBeEnabled()
  await expect(launch.getByLabel('Titre de l’audit')).toHaveValue(/Audit Notion — \d{2}\/\d{2}\/\d{4}/)
  await page.screenshot({ path: `${screenshotDir}/03-providers-unavailable.png`, fullPage: true })
})

test('keeps the editable title and its 120-byte validation', async ({ page }) => {
  await openAudit(page)
  const launch = launcher(page)
  const title = launch.getByLabel('Titre de l’audit')
  await title.fill('Audit recrutement synthétique')
  await expect(title).toHaveValue('Audit recrutement synthétique')
  await title.fill('')
  await launch.getByRole('button', { name: 'Lancer l’audit' }).click()
  await expect(launch.getByRole('alert')).toHaveText('Saisissez un titre de 1 à 120 octets.')
  await title.fill('é'.repeat(61))
  await launch.getByRole('button', { name: 'Lancer l’audit' }).click()
  await expect(launch.getByRole('alert')).toHaveText('Saisissez un titre de 1 à 120 octets.')
})

test('keeps launch unavailable when the selected connection lacks credentials', async ({ page }) => {
  await openAudit(page, { missingCredential: true })
  await expect(launcher(page).getByRole('button', { name: 'Lancer l’audit' })).toBeDisabled()
  await expect(launcher(page)).toContainText('Configurez d’abord le credential')
})

test('resumes an active audit and updates the elapsed timer without relaunching', async ({ page }) => {
  const requests = await openAudit(page, { auditScenario: 'timer' })
  const launch = launcher(page)
  await expect(launch.locator('.tenant-audit__step--current')).toContainText('Analyse des données')
  const elapsed = launch.locator('.tenant-audit__elapsed')
  const first = await elapsed.textContent()
  await expect.poll(() => elapsed.textContent()).not.toBe(first)
  await expect(launch.getByRole('button', { name: 'Audit en cours…' })).toBeDisabled()
  expect(requests.filter((request) => request.method === 'POST')).toHaveLength(0)
})

test('keeps the five phases, elapsed time and compact final metrics', async ({ page }) => {
  test.setTimeout(60000)
  const requests = await openAudit(page, { auditScenario: 'v2' })
  const launch = launcher(page)
  await launch.getByRole('button', { name: 'Lancer l’audit' }).click()
  await expect(launch.locator('.tenant-audit__step')).toHaveCount(5)
  await expect(launch.locator('.tenant-audit__step--current')).toContainText('Collecte des sources')
  await expect(launch).toContainText('5 / 11')
  await expect(launch.getByText(/Temps écoulé/)).toBeVisible()
  await expect(launch.locator('.tenant-audit__progress [aria-live="polite"]')).toContainText('Phase actuelle')
  await page.screenshot({ path: `${screenshotDir}/04-audit-running.png`, fullPage: true })
  await expect(launch.locator('.tenant-audit__step--current')).toContainText('Analyse des données', { timeout: 15_000 })
  await expect(launch.locator('.tenant-audit__step--current')).toContainText('Génération du rapport', { timeout: 15_000 })
  await expect(launch.locator('.tenant-audit__step--current')).toContainText('Publication', { timeout: 15_000 })
  await expect(launch).toContainText('État : Terminé', { timeout: 15_000 })
  await expect(launch.locator('.tenant-audit__metrics > div')).toHaveCount(5)
  await expect(launch.locator('.tenant-audit__metrics')).toContainText('Enregistrements retenus')
  await page.screenshot({ path: `${screenshotDir}/05-audit-completed.png`, fullPage: true })
  expect(requests.filter((request) => request.path === auditPrefix && request.method === 'POST')).toHaveLength(1)
  expect(requests.filter((request) => request.path === `${auditPrefix}/${auditCorrelationId}` && request.method === 'GET')).toHaveLength(6)
})

test('shows the failed phase and keeps the previous active phase for context', async ({ page }) => {
  await openAudit(page, { auditScenario: 'failed' })
  await launcher(page).getByRole('button', { name: 'Lancer l’audit' }).click()
  await expect(launcher(page)).toContainText('Échec de l’audit')
  await expect(launcher(page).locator('.tenant-audit__step--failed')).toContainText('Échec')
  await expect(launcher(page).getByText(/Temps écoulé/)).toBeVisible()
})

test('renders a compact history table with real scope metadata and opens only the selected PDF', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openAudit(page, { globalReport: true })
  const table = history(page).getByRole('table')
  await expect(table.getByRole('columnheader')).toHaveText(['Audit', 'Date', 'Périmètre', 'Sources', 'Décisions', 'Statut', ''])
  await expect(table.getByRole('columnheader', { name: 'Actions' })).toHaveAttribute('aria-label', 'Actions')
  await expect(table.locator('tr.tenant-audit__history-item')).toHaveCount(4)
  await expect(historyRow(page, 'Audit multi-provider')).toContainText('2 providers')
  await expect(historyRow(page, 'Audit Drive')).toContainText('Drive')
  await expect(history(page).locator('.provider-logo')).toHaveCount(0)
  await expect(history(page).locator('article.tenant-audit__history-item')).toHaveCount(0)
  await expect(historyRow(page, 'Audit Drive').getByRole('button', { name: 'Audit Drive' })).toHaveText('Audit Drive')
  await expect(historyRow(page, 'Audit Drive').getByRole('time')).toHaveText('16/10/2026')
  await page.screenshot({ path: `${screenshotDir}/06-history.png`, fullPage: true })
  await page.evaluate(() => { window.open = ((url?: string | URL) => { (window as Window & { __opened?: string }).__opened = String(url); return null }) as typeof window.open })
  await historyRow(page, 'Audit Drive').getByRole('button', { name: 'Audit Drive' }).click()
  await expect.poll(() => page.evaluate(() => (window as Window & { __opened?: string }).__opened)).toContain('/reports/audit-drive-2026-10-16/pdf')
})

test('keeps PDF, DDL, ER, rename and archive actions in the right-hand menu', async ({ page }) => {
  const requests = await openAudit(page)
  let menu = await openReportMenu(page, 'Audit Drive')
  for (const name of ['Télécharger le DDL', 'Télécharger l’ER', 'Renommer', 'Archiver']) await expect(menu.getByRole('button', { name })).toBeVisible()
  await expect(menu.getByRole('link', { name: 'Télécharger le PDF' })).toBeVisible()
  const ddlDownload = page.waitForEvent('download')
  await menu.getByRole('button', { name: 'Télécharger le DDL' }).click()
  const ddl = await ddlDownload
  expect(ddl.suggestedFilename()).toMatch(/\.sql$/)
  expect(await readFile((await ddl.path())!, 'utf8')).toBe('-- Audit Drive\nCREATE TABLE "Audit Drive" ();\n')
  menu = await openReportMenu(page, 'Audit Drive')
  const erDownload = page.waitForEvent('download')
  await menu.getByRole('button', { name: 'Télécharger l’ER' }).click()
  const er = await erDownload
  expect(er.suggestedFilename()).toMatch(/\.json$/)
  expect(JSON.parse(await readFile((await er.path())!, 'utf8'))).toEqual(structuredReport('Audit Drive', null).raw_er)
  menu = await openReportMenu(page, 'Audit Drive')
  await menu.getByRole('button', { name: 'Renommer' }).click()
  const rename = history(page).locator('.tenant-audit__inline-rename')
  await expect(rename).toBeVisible()
  await rename.getByLabel('Nouveau titre').fill('Audit renommé')
  await rename.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(historyRow(page, 'Audit renommé')).toBeVisible()
  expect(requests.filter((request) => request.path.endsWith('/title') && request.method === 'PATCH')).toHaveLength(1)
})

test('archives through a detail row, then uses the same table for archived reports', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const requests = await openAudit(page)
  const menu = await openReportMenu(page, 'Audit Drive')
  await menu.getByRole('button', { name: 'Archiver' }).click()
  await expect(history(page).getByRole('alertdialog')).toBeVisible()
  await history(page).getByRole('button', { name: 'Annuler' }).click()
  await expect(history(page).getByRole('alertdialog')).toHaveCount(0)
  const again = await openReportMenu(page, 'Audit Drive')
  await again.getByRole('button', { name: 'Archiver' }).click()
  await history(page).getByRole('button', { name: 'Confirmer l’archivage' }).click()
  await expect(historyRow(page, 'Audit Drive')).toHaveCount(0)
  await history(page).getByRole('button', { name: 'Voir les archives' }).click()
  await expect(historyRow(page, 'Audit Drive')).toContainText('Archivé')
  await expect(history(page).getByRole('table')).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: `${screenshotDir}/07-archives.png`, fullPage: true })
  const archivedMenu = await openReportMenu(page, 'Audit Drive')
  await expect(archivedMenu.getByRole('button', { name: 'Archiver' })).toHaveCount(0)
  await expect(archivedMenu.getByRole('link', { name: 'Télécharger le PDF' })).toBeVisible()
  expect(requests.filter((request) => request.path === `${prefix}/reports/audit-drive-2026-10-16/archive` && request.method === 'POST')).toHaveLength(1)
})

test('keeps a failed archive in the active table with a retry message', async ({ page }) => {
  await openAudit(page, { archiveStatus: 503 })
  const menu = await openReportMenu(page, 'Audit Drive')
  await menu.getByRole('button', { name: 'Archiver' }).click()
  await history(page).getByRole('button', { name: 'Confirmer l’archivage' }).click()
  await expect(history(page).getByRole('alert')).toHaveText('Le rapport n’a pas pu être archivé. Réessayez.')
  await expect(historyRow(page, 'Audit Drive')).toBeVisible()
})

test('returns to login when the session expires during archive', async ({ page }) => {
  await openAudit(page, { archiveStatus: 401 })
  const menu = await openReportMenu(page, 'Audit Drive')
  await menu.getByRole('button', { name: 'Archiver' }).click()
  await history(page).getByRole('button', { name: 'Confirmer l’archivage' }).click()
  await expect(page.getByRole('button', { name: 'Se connecter', exact: true }).first()).toBeVisible()
})

test('preserves PDF and archive actions for a legacy report without audit references', async ({ page }) => {
  await openAudit(page, { legacyReport: true })
  const legacy = history(page).locator('tr.tenant-audit__history-item').filter({ hasText: '01/07/2026' })
  await legacy.getByRole('button', { name: 'Actions de l’audit' }).click()
  const menu = page.locator('.ui-action-menu__content--portal')
  await expect(menu.getByRole('link', { name: 'Télécharger le PDF' })).toBeVisible()
  await expect(menu.getByRole('button', { name: 'Archiver' })).toBeVisible()
  await expect(menu.getByRole('button', { name: 'Télécharger le DDL' })).toHaveCount(0)
})

test('keeps the mobile page within the viewport and the history table scrollable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openAudit(page, { globalReport: true })
  await expect(launcher(page)).toBeVisible()
  await expect(history(page).getByRole('table')).toBeVisible()
  const tableScroll = history(page).locator('.tenant-audit__table-scroll')
  expect(await tableScroll.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: `${screenshotDir}/08-mobile.png`, fullPage: true })
  const row = historyRow(page, 'Audit Drive')
  await row.getByRole('button', { name: 'Actions de l’audit' }).click()
  const menu = page.locator('.ui-action-menu__content--portal')
  await expect(menu).toBeVisible()
  const box = await menu.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(390)
})

test('recovers conflicts through the existing per-provider latest endpoint', async ({ page }) => {
  const requests = await openAudit(page, { auditScenario: 'conflict' })
  await launcher(page).getByRole('button', { name: 'Lancer l’audit' }).click()
  await expect.poll(() => requests.filter((request) => request.path === `${auditPrefix}/latest`).length).toBeGreaterThanOrEqual(2)
  await expect(launcher(page)).toContainText('État : Terminé')
})

test('aborts a stale latest request when the selected scope changes', async ({ page }) => {
  const requests = await openAudit(page, { auditScenario: 'abort' })
  await expect(providerCheckbox(page, 'Notion A')).toBeChecked()
  const initialAborts = await page.evaluate(() => (window as Window & { __auditAbortCount: number }).__auditAbortCount)
  await providerCheckbox(page, 'Notion A').uncheck()
  await providerCheckbox(page, 'Notion B').check()
  await expect.poll(() => page.evaluate(() => (window as Window & { __auditAbortCount: number }).__auditAbortCount)).toBeGreaterThan(initialAborts)
  await expect.poll(() => requests.filter((request) => request.path === `${prefix}/providers/${notionBId}/audits/latest`).length).toBe(1)
  await expect(launcher(page).locator('.tenant-audit__launcher-status')).toHaveCount(0)
})

test('keeps the last phase during a temporary polling error and then completes', async ({ page }) => {
  const requests = await openAudit(page, { auditScenario: 'network' })
  await launcher(page).getByRole('button', { name: 'Lancer l’audit' }).click()
  await expect(launcher(page).locator('.tenant-audit__step--current')).toContainText('Analyse des données')
  await expect(launcher(page).getByRole('alert')).toContainText('Réessai automatique', { timeout: 12_000 })
  await expect(launcher(page).locator('.tenant-audit__step--current')).toContainText('Analyse des données')
  await expect(launcher(page)).toContainText('État : Terminé', { timeout: 12_000 })
  expect(requests.filter((request) => request.path === `${auditPrefix}/${auditCorrelationId}`)).toHaveLength(3)
})

test('preserves the history after a failed refresh and reports rename errors', async ({ page }) => {
  await openAudit(page, { renameStatus: 503, reportsRefreshFails: true, auditScenario: 'v2' })
  const menu = await openReportMenu(page, 'Audit Drive')
  await menu.getByRole('button', { name: 'Renommer' }).click()
  const rename = history(page).locator('.tenant-audit__inline-rename')
  await rename.getByLabel('Nouveau titre').fill('Titre non sauvegardé')
  await rename.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(rename.getByRole('alert')).toHaveText('Le titre n’a pas pu être enregistré. Réessayez.')
  await rename.getByRole('button', { name: 'Annuler' }).click()
  await launcher(page).getByRole('button', { name: 'Lancer l’audit' }).click()
  await expect(launcher(page)).toContainText('État : Terminé', { timeout: 30000 })
  await expect(historyRow(page, 'Audit Drive')).toBeVisible()
})

test('does not restore a terminal latest audit in the active launcher', async ({ page }) => {
  await openAudit(page, { latestTitle: 'Ancien titre du dernier audit', latestStatus: 'completed' })
  await expect(launcher(page).locator('.tenant-audit__launcher-status')).toHaveCount(0)
  await expect(launcher(page).getByLabel('Titre de l’audit')).toHaveValue(/Audit Notion — \d{2}\/\d{2}\/\d{4}/)
})

test('the client workspace has no admin audit actions', async ({ page }) => {
  await openAudit(page, { client: true })
  await expect(page.getByRole('region', { name: 'Lancement de l’audit' })).toHaveCount(0)
})
