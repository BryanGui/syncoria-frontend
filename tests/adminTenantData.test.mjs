import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const component = await readFile(new URL('../src/components/AdminTenantData.tsx', import.meta.url), 'utf8')
const page = await readFile(new URL('../src/pages/AdminTenantWorkspacePage.tsx', import.meta.url), 'utf8')
const workspace = await readFile(new URL('../src/components/TenantWorkspace.tsx', import.meta.url), 'utf8')

test('mounts the materialized PostgreSQL structure explorer in the admin data section', () => {
  assert.match(page, /adminData=\{/)
  assert.match(page, /<AdminTenantData/)
  assert.match(workspace, /activeSection === 'Données'[\s\S]*?adminData/)
  assert.match(component, /fetchAdminIntegrations/)
  assert.match(component, /fetchAdminIntegrationModelStructure/)
  assert.match(component, /Structure du modèle PostgreSQL matérialisé/)
})

test('covers version status, loading, no model, empty schema and table metadata states', () => {
  assert.match(component, /return 'Test'/)
  assert.match(component, /return 'Actif'/)
  assert.match(component, /return 'Archivé'/)
  assert.match(component, /Chargement des versions/)
  assert.match(component, /Aucune version d’intégration n’est disponible/)
  assert.match(component, /Aucun modèle PostgreSQL construit pour cette version/)
  assert.match(component, /result\.code === 'model_not_built'/)
  assert.match(component, /Le modèle PostgreSQL ne contient aucune table/)
  assert.match(component, /Colonne/)
  assert.match(component, /Type/)
  assert.match(component, /Nullable/)
  assert.doesNotMatch(component, /fetchRows|ligne de données/i)
})
