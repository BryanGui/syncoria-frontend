import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'


const component = await readFile(new URL('../src/components/AdminTenantIngestion.tsx', import.meta.url), 'utf8')
const ingestionModel = await readFile(new URL('../src/tenantIngestion.ts', import.meta.url), 'utf8')
const workspace = await readFile(new URL('../src/components/TenantWorkspace.tsx', import.meta.url), 'utf8')
const page = await readFile(new URL('../src/pages/AdminTenantWorkspacePage.tsx', import.meta.url), 'utf8')
const styles = await readFile(new URL('../src/App.css', import.meta.url), 'utf8')

test('renders the existing dashboard only from the Integration Ingestion sub-tab', () => {
  assert.match(workspace, /activeIntegrationSection === 'Ingestion'[\s\S]*?adminIngestion/)
  assert.doesNotMatch(workspace, /activeSection === 'Ingestion'/)
  assert.match(page, /<AdminTenantIngestion/)
  assert.match(component, /Provider record concerné/)
  assert.match(component, /Lancer l’ingestion/)
})

test('loads latest state, polls active operations, and cleans up on tab, tenant or unmount', () => {
  assert.match(component, /fetchLatestAdminTenantIngestion/)
  assert.match(component, /fetchAdminTenantIngestion/)
  assert.match(component, /isInitialIngestionActive\(operation\.status\)/)
  assert.match(component, /window\.setInterval\(refreshOperation, POLLING_INTERVAL_MS\)/)
  assert.match(component, /window\.clearInterval\(timer\)/)
  assert.match(component, /abortController\.abort\(\)/)
})

test('renders real global and source counters without data leaks or Novalia fixtures', () => {
  assert.match(component, /getProgressCountLabel\(operation\.items_processed, operation\.items_expected\)/)
  assert.match(component, /getProgressCountLabel\(source\.items_processed, expected\)/)
  assert.match(ingestionModel, /volume attendu indisponible/)
  assert.match(component, /source\.items_inserted} insérés/)
  assert.match(component, /source\.error_code/)
  assert.doesNotMatch(component, /raw_payload|provenance|credential|Novalia|90|localStorage|sessionStorage/)
})

test('disables unsupported providers and ignores stale launch responses', () => {
  assert.match(component, /!isSelectedProviderSupported/)
  assert.match(component, /disabled=\{isLaunching\}/)
  assert.match(component, /isLaunchResponseCurrent\(selectedProviderIdRef\.current, launchedProviderId\)/)
  assert.match(component, /ingestion initiale n’est pas encore disponible pour ce provider/)
})

test('keeps the dashboard responsive on mobile widths', () => {
  assert.match(styles, /\.ingestion-source-grid/)
  assert.match(styles, /\.ingestion-operation__summary,[\s\S]*?grid-template-columns: 1fr/)
})

test('keeps the ingestion heading compact and formats providers without repetition', () => {
  assert.match(component, /Copie brute initiale des sources retenues vers Syncoria\./)
  assert.match(component, /function formatProvider\(tenantSlug: string, providerType: string\)/)
  assert.match(component, /`\$\{tenantSlug\} · \$\{providerType\}`/)
  assert.doesNotMatch(component, /formatProvider\(selectedProvider\)/)
  assert.doesNotMatch(component, /provider\.name === provider\.provider/)
  assert.match(page, /tenantSlug=\{pageState\.tenant\.slug\}/)
  assert.match(styles, /\.tenant-ingestion__heading,[\s\S]*?align-items: center/)
  assert.match(styles, /\.tenant-workspace__integration-content \.tenant-ingestion__heading > div h3/)
})
