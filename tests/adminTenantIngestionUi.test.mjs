import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'


const component = await readFile(new URL('../src/components/AdminTenantIngestion.tsx', import.meta.url), 'utf8')
const ingestionModel = await readFile(new URL('../src/tenantIngestion.ts', import.meta.url), 'utf8')
const workspace = await readFile(new URL('../src/components/TenantWorkspace.tsx', import.meta.url), 'utf8')
const page = await readFile(new URL('../src/pages/AdminTenantWorkspacePage.tsx', import.meta.url), 'utf8')
const styles = await readFile(new URL('../src/App.css', import.meta.url), 'utf8')

test('replaces only the admin Ingestion placeholder with the dashboard', () => {
  assert.match(workspace, /activeSection === 'Ingestion'[\s\S]*?adminIngestion/)
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
