import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'


const integrationSource = await readFile(
  new URL('../src/components/AdminTenantIntegration.tsx', import.meta.url),
  'utf8',
)
const adminWorkspaceSource = await readFile(
  new URL('../src/pages/AdminTenantWorkspacePage.tsx', import.meta.url),
  'utf8',
)
const clientWorkspaceSource = await readFile(
  new URL('../src/pages/ClientWorkspacePage.tsx', import.meta.url),
  'utf8',
)
const tenantWorkspaceSource = await readFile(
  new URL('../src/components/TenantWorkspace.tsx', import.meta.url),
  'utf8',
)

test('adds the integration page only to the admin tenant workspace', () => {
  assert.match(adminWorkspaceSource, /adminIntegration=\{/)
  assert.match(adminWorkspaceSource, /<AdminTenantIntegration/)
  assert.match(tenantWorkspaceSource, /activeSection === 'Intégration'/)
  assert.doesNotMatch(clientWorkspaceSource, /AdminTenantIntegration|adminIntegration/)
})

test('renders only provider records returned by the backend', () => {
  assert.match(integrationSource, /providers\.length === 0/)
  assert.match(integrationSource, /Aucun provider configuré\./)
  assert.match(integrationSource, /providers\.map\(\(providerRecord\)/)
  assert.doesNotMatch(integrationSource, /PROVIDERS\.map|selectProviderRecord/)
})

test('offers Notion and n8n only from the add-provider form', () => {
  assert.match(integrationSource, /\+ Ajouter un provider/)
  assert.match(integrationSource, /<option value="notion">Notion<\/option>/)
  assert.match(integrationSource, /<option value="n8n">n8n<\/option>/)
  assert.match(integrationSource, /<ProviderCreationForm/)
})

test('renders the operational actions on a real provider card', () => {
  assert.match(integrationSource, /providerRecord=\{providerRecord\}/)
  assert.match(integrationSource, /Remplacer le token/)
  assert.match(integrationSource, /Remplacer la clé/)
  assert.match(integrationSource, /Vérifier la connexion/)
  assert.match(integrationSource, /Vérification…/)
  assert.match(integrationSource, /Désactiver/)
})

test('uses password-only transient credential fields and clears them after success', () => {
  assert.equal(integrationSource.match(/type="password"/g)?.length, 2)
  assert.match(
    integrationSource,
    /handleMutationResult[\s\S]*?setSecret\(''\)[\s\S]*?onProviderChanged\(result\.provider\)/,
  )
  assert.doesNotMatch(integrationSource, /localStorage|sessionStorage|console\./)
  assert.doesNotMatch(integrationSource, /value=\{providerRecord[^}]*secret/)
})

test('displays only sanitized verification fields and replaces stale OK state', () => {
  assert.match(integrationSource, /last_verification_message/)
  assert.match(integrationSource, /last_verification_http_status/)
  assert.match(integrationSource, /applyProviderVerification/)
  assert.match(integrationSource, /upsertProviderRecord/)
  assert.doesNotMatch(integrationSource, /response\.text|response\.body|JSON\.stringify\(providerRecord/)
})
