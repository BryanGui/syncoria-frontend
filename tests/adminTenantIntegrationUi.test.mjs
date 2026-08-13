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

test('renders Notion and n8n cards with their operational actions', () => {
  assert.match(integrationSource, /title: 'Notion'/)
  assert.match(integrationSource, /title: 'n8n'/)
  assert.match(integrationSource, /Configurer/)
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
