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
const clientsPageSource = await readFile(
  new URL('../src/pages/ClientsPage.tsx', import.meta.url),
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

test('shows localized active and archived tenant statuses', () => {
  assert.match(clientsPageSource, /getTenantStatusLabel\(tenant\.status\)/)
  assert.match(tenantWorkspaceSource, /getTenantStatusLabel\(tenant\.status\)/)
})

test('requires an explicit destructive confirmation before archival', () => {
  assert.match(adminWorkspaceSource, /Archiver le client/)
  assert.match(adminWorkspaceSource, /role="alertdialog"/)
  assert.match(adminWorkspaceSource, /Confirmer l’archivage/)
  assert.match(adminWorkspaceSource, /coupe les accès du client/)
  assert.match(adminWorkspaceSource, /anciens tokens ne pourront pas/)
  assert.match(adminWorkspaceSource, /pageState\.tenant\.status === 'active'/)
})

test('offers reactivation only for an archived tenant and explains reconfiguration', () => {
  assert.match(adminWorkspaceSource, /Réactiver le client/)
  assert.match(
    adminWorkspaceSource,
    /providers et credentials doivent être reconfigurés/,
  )
  assert.match(
    adminWorkspaceSource,
    /providers devront être reconfigurés après réactivation/,
  )
})

test('renders archived integrations read-only and clears stale providers', () => {
  assert.match(integrationSource, /tenantStatus === 'archived'/)
  assert.match(
    integrationSource,
    /tenantStatus === 'archived'[\s\S]*?setProviders\(\[\]\)/,
  )
  assert.match(integrationSource, /Client archivé\./)
  assert.match(integrationSource, /Les intégrations sont désactivées/)
  assert.match(integrationSource, /credentials ont été révoqués/)
  assert.match(
    integrationSource,
    /tenantStatus === 'active'[\s\S]*?\+ Ajouter un provider/,
  )
})

test('reloads providers from the backend after tenant reactivation', () => {
  assert.match(
    integrationSource,
    /setProviders\(\[\]\)[\s\S]*?fetchAdminTenantProviders/,
  )
  assert.match(
    integrationSource,
    /tenantStatus\]\)/,
  )
  assert.doesNotMatch(
    adminWorkspaceSource,
    /createAdminTenantProvider|Notion|n8n/,
  )
})
