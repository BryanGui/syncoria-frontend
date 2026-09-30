import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const component = await readFile(new URL('../src/components/AdminTenantIngestion.tsx', import.meta.url), 'utf8')
const tables = await readFile(new URL('../src/components/IngestionTables.tsx', import.meta.url), 'utf8')
const ingestionApi = await readFile(new URL('../src/api/adminTenantIngestions.ts', import.meta.url), 'utf8')
const providerApi = await readFile(new URL('../src/api/adminTenantProviders.ts', import.meta.url), 'utf8')
const workspace = await readFile(new URL('../src/components/TenantWorkspace.tsx', import.meta.url), 'utf8')
const page = await readFile(new URL('../src/pages/AdminTenantWorkspacePage.tsx', import.meta.url), 'utf8')
const styles = await readFile(new URL('../src/App.css', import.meta.url), 'utf8')

test('renders the admin Ingestion section with a generic tool launcher', () => {
  assert.match(workspace, /activeSection === 'Ingestion'[\s\S]*?adminIngestion/)
  assert.match(page, /<AdminTenantIngestion/)
  assert.match(component, /Outil à ingérer/)
  assert.match(component, /Lancer l’ingestion/)
  assert.match(component, /formatProvider\(provider\)/)
})

test('preserves loading, polling, stale-response and archive behavior', () => {
  assert.match(component, /fetchAdminTenantIngestionHistory/)
  assert.match(component, /fetchLatestAdminTenantIngestion/)
  assert.match(component, /fetchAdminTenantIngestion/)
  assert.match(component, /window\.setInterval\(refreshOperation, POLLING_INTERVAL_MS\)/)
  assert.match(component, /window\.clearInterval\(timer\)/)
  assert.match(component, /abortController\.abort\(\)/)
  assert.match(component, /isLaunchResponseCurrent\(selectedProviderIdRef\.current, launchedProviderId\)/)
  assert.match(component, /archiveAdminTenantIngestion/)
  assert.match(component, /Voir les archives/)
  assert.match(component, /!isSelectedProviderSupported/)
  assert.match(component, /!provider\.initial_ingestion_supported/)
  assert.doesNotMatch(component, /localStorage|sessionStorage/)
})

test('uses real ingestion counters in the summary and table rows', () => {
  for (const field of ['items_received', 'items_processed', 'items_inserted', 'items_duplicate', 'items_rejected']) {
    assert.match(tables, new RegExp(`operation\\.${field}`))
    assert.match(tables, new RegExp(`source\\.${field}`))
  }
  assert.match(tables, /source\.observed_record_count/)
  assert.match(tables, /getProgressCountLabel\(operation\.items_processed, operation\.items_expected\)/)
  assert.match(tables, /getProgressWidth\(operation\.items_processed, operation\.items_expected\)/)
  assert.match(tables, /ProviderLogo provider=\{operation\.provider\}/)
  assert.match(tables, /getProviderLabel\(operation\.provider\)/)
  assert.match(tables, /source\.source_name/)
  assert.doesNotMatch(tables, /Novalia|Pipeline candidats|raw_payload|credential/)
})

test('shows sources and history as accessible tables with expandable technical details', () => {
  assert.match(tables, /<table className="ingestion-table ingestion-sources-table"/)
  assert.match(tables, /<table className="ingestion-table ingestion-history-table"/)
  assert.match(tables, /aria-expanded=\{expanded\}/)
  assert.match(tables, /aria-controls=\{detailId\}/)
  assert.match(tables, /<details className="ingestion-technical">/)
  assert.match(tables, /source\.external_source_id/)
  assert.match(tables, /source\.run_id/)
  assert.match(tables, /source\.capture_contract_versions/)
  assert.match(tables, /source\.error_code/)
  assert.match(tables, /operation\.correlation_id/)
  assert.match(tables, /operation\.error_codes/)
  assert.match(tables, /<ActionMenu[^>]*portal>/)
  assert.doesNotMatch(styles, /\.ingestion-source-grid/)
  assert.doesNotMatch(styles, /\.ingestion-history__list/)
})

test('keeps the existing backend capability contract', () => {
  assert.match(providerApi, /initial_ingestion_supported: boolean/)
  assert.match(providerApi, /value\.initial_ingestion_supported/)
  assert.doesNotMatch(ingestionApi, /supportsInitialIngestionProvider/)
  assert.doesNotMatch(ingestionApi, /provider\s*(?:===|!==|==|!=)\s*['"]notion['"]/)
})

test('scrolls both tables within their container on mobile', () => {
  assert.match(styles, /\.ingestion-table-scroll \{[^}]*overflow-x: auto/)
  assert.match(styles, /\.ingestion-sources-table \{ min-width: 760px/)
  assert.match(styles, /\.ingestion-history-table \{ min-width: 940px/)
})
