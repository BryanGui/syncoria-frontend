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

test('shows the single step-one DDL list with explicit selection and preview', () => {
  assert.match(component, /Étape 1 — Choisir un DDL/)
  assert.match(component, /Charger un DDL/)
  assert.match(component, /aria-label="DDL disponibles"/)
  assert.match(component, /Source : Audit/)
  assert.match(component, /Source : Import manuel/)
  assert.match(component, /Par défaut/)
  assert.match(component, /name="selected-ddl"/)
  assert.match(component, /setDdlPreview\(result.ddl\)/)
  assert.match(component, /Télécharger/)
  assert.doesNotMatch(component, /source_ddl|working_ddl|DDL cible|DDL source.*DDL cible/)
})

test('resolves a hidden draft only on the first meaningful action', () => {
  assert.match(component, /async function ensureDraft/)
  assert.match(component, /await ensureDraft\(\)/)
  assert.match(component, /createAdminIntegration/)
  assert.match(component, /based_on_integration_id/)
  assert.doesNotMatch(component, /cloneAdminIntegration|activateAdminIntegration|Créer une version vide|Cloner cette version/)
  assert.doesNotMatch(component, /window\.location\.reload|window\.location\.hash/)
})

test('supports imported DDL rename and confirmed server deletion only', () => {
  assert.match(component, /renameAdminIntegrationDdl/)
  assert.match(component, /deleteAdminIntegrationDdl/)
  assert.match(component, /Renommer/)
  assert.match(component, /Supprimer ce DDL/)
  assert.match(component, /role="alertdialog"/)
  assert.match(api, /method: 'PATCH'/)
  assert.match(api, /deleteAdminIntegrationDdl/)
})

test('keeps archived tenants read-only and validates imported DDLs', () => {
  assert.match(component, /const isArchivedTenant = tenantStatus !== 'active'/)
  assert.match(component, /Ce client archivé est en lecture seule/)
  assert.match(component, /MAX_DDL_BYTES/)
  assert.match(component, /Le fichier doit être au format \.sql/)
  assert.match(component, /Le fichier dépasse la taille maximale de 1 MiB/)
  assert.match(component, /120 octets UTF-8/)
})

test('keeps canonical tenant-scoped API paths and redacted failures explicit', () => {
  assert.match(api, /\/admin\/tenants\/\$\{encodeURIComponent\(tenantId\)\}\/integrations/)
  assert.match(api, /credentials: 'include'/)
  assert.match(api, /MAX_DDL_BYTES = 1024 \* 1024/)
  assert.match(api, /getDdlValidationError/)
  assert.doesNotMatch(api, /integration-workspaces|source_ddl|working_ddl|console\./)
  assert.doesNotMatch(styles, /tenant-data-integration__|ui-reference__/)
})
