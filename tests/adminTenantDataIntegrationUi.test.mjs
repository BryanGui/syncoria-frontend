import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const component = await readFile(new URL('../src/components/AdminTenantDataIntegration.tsx', import.meta.url), 'utf8')
const api = await readFile(new URL('../src/api/adminIntegrationWorkspaces.ts', import.meta.url), 'utf8')
const workspace = await readFile(new URL('../src/components/TenantWorkspace.tsx', import.meta.url), 'utf8')
const page = await readFile(new URL('../src/pages/AdminTenantWorkspacePage.tsx', import.meta.url), 'utf8')
const styles = await readFile(new URL('../src/App.css', import.meta.url), 'utf8')

test('keeps the existing navigation and wires the data integration sub-tab', () => {
  assert.match(workspace, /INTEGRATION_WORKSPACE_SECTIONS\.map/)
  assert.match(workspace, /adminDataIntegration \?\?/)
  assert.match(page, /<AdminTenantDataIntegration/)
  assert.match(page, /adminDataIntegration=\{/)
  assert.match(component, /aria-label="Workspaces d’intégration"/)
  assert.match(component, /Le détail et les DDL seront chargés uniquement après votre sélection/)
})

test('presents source to target as read-only opaque text with downloads', () => {
  assert.match(component, /DDL source/)
  assert.match(component, /DDL cible/)
  assert.match(component, /Non modifiable/)
  assert.match(component, /Lecture seule/)
  assert.match(component, /URL\.createObjectURL\(new Blob\(\[content\]/)
  assert.match(component, /Télécharger le DDL/)
  assert.match(component, /SQL conservé comme texte opaque/)
  assert.doesNotMatch(component, /<textarea|Monaco|CodeMirror|console\./)
})

test('supports creation and explicit replacement without executing SQL', () => {
  assert.match(component, /createAdminIntegrationWorkspaceFromAudit/)
  assert.match(component, /createAdminIntegrationWorkspaceFromUpload/)
  assert.match(component, /replaceAdminIntegrationWorkspaceWorkingDdl/)
  assert.match(component, /accept="\.sql,text\/plain,application\/sql"/)
  assert.match(component, /Remplacer le DDL cible \?/)
  assert.match(component, /Confirmer le remplacement/)
  assert.match(component, /aucun SQL ne sera exécuté/)
  assert.doesNotMatch(component, /fetch\([^)]*content|execute|runSql|CREATE TABLE/)
})

test('explains the initial source state and keeps archived tenants read-only', () => {
  assert.match(component, /version === 1/)
  assert.match(component, /working_ddl === loadedWorkspace\.source_ddl/)
  assert.match(component, /Aucun DDL cible n’a encore été importé/)
  assert.match(component, /tenantStatus !== 'active'/)
  assert.match(component, /aucune création ni modification n’est possible/)
  assert.match(component, /!isArchived/)
  assert.match(component, /MAX_DDL_BYTES/)
})

test('keeps API validation, tenant scoping, and redacted failures explicit', () => {
  assert.match(api, /credentials: 'include'/)
  assert.match(api, /encodeURIComponent\(tenantId\)/)
  assert.match(api, /encodeURIComponent\(workspaceId\)/)
  assert.match(api, /MAX_DDL_BYTES = 1024 \* 1024/)
  assert.match(api, /getDdlValidationError/)
  assert.match(api, /errorType/)
  assert.doesNotMatch(api, /logger\([^)]*content|logFailure\([^)]*content/)
  assert.match(styles, /\.tenant-data-integration__ddl-grid/)
  assert.match(styles, /\.tenant-data-integration__target-upload/)
})
