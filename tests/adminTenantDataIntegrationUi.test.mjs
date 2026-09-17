import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const component = await readFile(new URL('../src/components/AdminTenantVersionedIntegration.tsx', import.meta.url), 'utf8')
const api = await readFile(new URL('../src/api/adminIntegrations.ts', import.meta.url), 'utf8')
const workspace = await readFile(new URL('../src/components/TenantWorkspace.tsx', import.meta.url), 'utf8')
const page = await readFile(new URL('../src/pages/AdminTenantWorkspacePage.tsx', import.meta.url), 'utf8')
const styles = await readFile(new URL('../src/App.css', import.meta.url), 'utf8')

test('exposes the versioned integration workflow in the dedicated admin section', () => {
  assert.match(workspace, /ADMIN_TENANT_WORKSPACE_SECTIONS/)
  assert.match(workspace, /activeSection === 'Intégration'/)
  assert.match(workspace, /adminVersionedIntegration/)
  assert.match(page, /<AdminTenantVersionedIntegration/)
  assert.match(page, /adminVersionedIntegration=\{/)
  assert.match(component, /const labels = \{ create: 'Créer', active: 'Active', versions: 'Versions' \}/)
  assert.match(component, /setView\(active \? 'active' : 'create'\)/)
})

test('keeps one version-scoped DDL library with explicit selection and preview', () => {
  assert.match(component, /DDL disponibles/)
  assert.match(component, /Ajouter depuis un audit/)
  assert.match(component, /Importer un DDL/)
  assert.match(component, /Sélectionner \$\{ddl.title\}/)
  assert.match(component, /setDdlPreview\(result.ddl\)/)
  assert.match(component, /Télécharger/)
  assert.match(component, /Le DDL a été importé sans être sélectionné automatiquement/)
  assert.doesNotMatch(component, /source_ddl|working_ddl|DDL cible|DDL source.*DDL cible/)
})

test('keeps draft editing, cloning and activation explicit', () => {
  assert.match(component, /cloneAdminIntegration/)
  assert.match(component, /patchAdminIntegration/)
  assert.match(component, /activateAdminIntegration/)
  assert.match(component, /Confirmation d’activation/)
  assert.match(component, /Note de conception/)
  assert.match(component, /based_on_integration_id/)
  assert.doesNotMatch(component, /window\.location\.reload|window\.location\.hash/)
})

test('uses version-scoped ingestion references with replace and remove actions', () => {
  assert.match(component, /fetchAdminIntegrationIngestionCandidates/)
  assert.match(component, /selectAdminIntegrationIngestion/)
  assert.match(component, /deleteAdminIntegrationIngestion/)
  assert.match(component, /Choisir \{ingestionSummary\(candidate\)\}/)
  assert.match(component, /Retirer la référence/)
})

test('keeps archived tenants read-only and validates imported DDLs', () => {
  assert.match(component, /const isArchivedTenant = tenantStatus !== 'active'/)
  assert.match(component, /const canEdit = !isArchivedTenant && isCurrentDraft/)
  assert.match(component, /aucune création ni modification n’est possible/)
  assert.match(component, /MAX_DDL_BYTES/)
  assert.match(component, /Le fichier doit être au format \.sql/)
  assert.match(component, /Le fichier dépasse la taille maximale de 1 MiB/)
})

test('keeps canonical tenant-scoped API paths and redacted failures explicit', () => {
  assert.match(api, /\/admin\/tenants\/\$\{encodeURIComponent\(tenantId\)\}\/integrations/)
  assert.match(api, /credentials: 'include'/)
  assert.match(api, /MAX_DDL_BYTES = 1024 \* 1024/)
  assert.match(api, /getDdlValidationError/)
  assert.doesNotMatch(api, /integration-workspaces|source_ddl|working_ddl|console\./)
  assert.doesNotMatch(styles, /tenant-data-integration__|ui-reference__/)
})
