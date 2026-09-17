import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'


const component = await readFile(new URL('../src/components/AdminTenantIngestion.tsx', import.meta.url), 'utf8')
const ingestionApi = await readFile(new URL('../src/api/adminTenantIngestions.ts', import.meta.url), 'utf8')
const providerApi = await readFile(new URL('../src/api/adminTenantProviders.ts', import.meta.url), 'utf8')
const ingestionModel = await readFile(new URL('../src/tenantIngestion.ts', import.meta.url), 'utf8')
const workspace = await readFile(new URL('../src/components/TenantWorkspace.tsx', import.meta.url), 'utf8')
const page = await readFile(new URL('../src/pages/AdminTenantWorkspacePage.tsx', import.meta.url), 'utf8')
const styles = await readFile(new URL('../src/App.css', import.meta.url), 'utf8')

test('renders the existing dashboard from the dedicated admin Ingestion section', () => {
  assert.match(workspace, /activeSection === 'Ingestion'[\s\S]*?adminIngestion/)
  assert.doesNotMatch(workspace, /activeIntegrationSection/)
  assert.match(page, /<AdminTenantIngestion/)
  assert.match(component, /Provider à ingérer/)
  assert.match(component, /Lancer l’ingestion/)
})

test('loads history and latest state, polls active operations, and cleans up on unmount', () => {
  assert.match(component, /fetchAdminTenantIngestionHistory/)
  assert.match(component, /fetchLatestAdminTenantIngestion/)
  assert.match(component, /fetchAdminTenantIngestion/)
  assert.match(component, /isInitialIngestionActive\(operation\.status\)/)
  assert.match(component, /window\.setInterval\(refreshOperation, POLLING_INTERVAL_MS\)/)
  assert.match(component, /window\.clearInterval\(timer\)/)
  assert.match(component, /abortController\.abort\(\)/)
})

test('keeps current and archived ingestion runs in separate views and archives by real run scope', () => {
  assert.match(component, /fetchAdminTenantIngestionHistory\([\s\S]*?false\)/)
  assert.match(component, /fetchAdminTenantIngestionHistory\([\s\S]*?true\)/)
  assert.match(component, /archiveAdminTenantIngestion/)
  assert.match(component, /Voir les archives/)
  assert.match(component, /tenant_provider_record_id/)
  assert.doesNotMatch(component, /localStorage|sessionStorage/)
})

test('renders real global and source counters without data leaks or Novalia fixtures', () => {
  assert.match(component, /getProgressCountLabel\(operation\.items_processed, operation\.items_expected\)/)
  assert.match(component, /operation\.items_received} lus/)
  assert.match(ingestionModel, /volume attendu indisponible/)
  assert.match(component, /operation\.items_inserted} insérés/)
  assert.match(component, /source\.error_code/)
  assert.match(component, /source\.capture_contract_versions/)
  assert.match(component, /operation\.error_codes/)
  assert.doesNotMatch(component, /raw_payload|provenance|credential|Novalia|90|localStorage|sessionStorage/)
})

test('disables unsupported providers and ignores stale launch responses', () => {
  assert.match(component, /!isSelectedProviderSupported/)
  assert.match(component, /selectedProvider\.initial_ingestion_supported/)
  assert.match(component, /!provider\.initial_ingestion_supported/)
  assert.match(component, /disabled=\{isLaunching\}/)
  assert.match(component, /isLaunchResponseCurrent\(selectedProviderIdRef\.current, launchedProviderId\)/)
  assert.match(component, /Ce provider est visible mais indisponible/)
})

test('uses the backend ingestion capability without a provider-name hardcode', () => {
  assert.match(providerApi, /initial_ingestion_supported: boolean/)
  assert.match(providerApi, /value\.initial_ingestion_supported/)
  assert.doesNotMatch(ingestionApi, /supportsInitialIngestionProvider/)
  assert.doesNotMatch(
    ingestionApi,
    /provider\s*(?:===|!==|==|!=)\s*['"]notion['"]/
  )
})

test('keeps the dashboard responsive on mobile widths', () => {
  assert.match(styles, /\.ingestion-source-grid/)
  assert.match(styles, /\.ingestion-operation__summary,[\s\S]*?grid-template-columns: 1fr/)
})

test('keeps the launcher compact and displays provider connections generically', () => {
  assert.doesNotMatch(component, /Copie brute initiale des sources retenues vers Syncoria\./)
  assert.match(component, /function formatProvider\(provider: AdminProviderRecord\)/)
  assert.match(component, /formatProviderType\(provider\.provider\)/)
  assert.match(component, /provider\.name/)
  assert.match(component, /ingestion-history__item/)
  assert.match(component, /correlation_id/)
  assert.match(styles, /\.ingestion-launcher/)
  assert.match(styles, /\.ingestion-history__row/)
  assert.match(styles, /\.ingestion-history__metadata/)
})
