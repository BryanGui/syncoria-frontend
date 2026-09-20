import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { compatibleGlobalAuditReports } from '../src/integrationVersions/auditCompatibility.ts'

const component = await readFile(new URL('../src/components/AdminTenantVersionedIntegration.tsx', import.meta.url), 'utf8')
const api = await readFile(new URL('../src/api/adminIntegrations.ts', import.meta.url), 'utf8')
const auditCompatibility = await readFile(new URL('../src/integrationVersions/auditCompatibility.ts', import.meta.url), 'utf8')
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

test('shows provider scope before the single DDL list with explicit selection and preview', () => {
  assert.match(component, /Étape 1 — Choisir les providers à intégrer/)
  assert.match(component, /Étape 2 — Choisir un DDL/)
  assert.match(component, /replaceAdminIntegrationProviders/)
  assert.match(auditCompatibility, /scope_kind !== 'global'/)
  assert.match(auditCompatibility, /tenant_provider_record_ids/)
  assert.match(auditCompatibility, /second\.created_at/)
  assert.match(component, /Aucun DDL compatible avec les providers sélectionnés/)
  assert.match(component, /Sélectionnez au moins un provider à l’étape 1/)
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
  assert.match(component, /async function toggleProvider/)
  assert.match(component, /based_on_integration_id/)
  assert.doesNotMatch(component, /cloneAdminIntegration|activateAdminIntegration|Créer une version vide|Cloner cette version/)
  assert.doesNotMatch(component, /window\.location\.reload|window\.location\.hash/)
})

test('filters exact global audit sets and breaks created-at ties by report id', () => {
  const providerA = '11111111-1111-4111-8111-111111111111'
  const providerB = '22222222-2222-4222-8222-222222222222'
  const report = (id, scopeKind, providerIds, createdAt, status = 'completed') => ({
    id,
    title: id,
    provider: 'multi',
    report_date: '2026-09-18',
    status,
    sources_analyzed: 1,
    sources_retained: 1,
    sources_excluded: 0,
    records_retained: 1,
    decisions_required: 0,
    scope_kind: scopeKind,
    tenant_provider_record_ids: providerIds,
    created_at: createdAt,
    has_usable_ddl: true,
  })
  const reports = [
    report('audit-a', 'global', [providerA, providerB], '2026-09-18T10:00:00Z'),
    report('audit-z', 'global', [providerB, providerA], '2026-09-18T10:00:00Z'),
    report('individual', 'individual', [providerA, providerB], '2026-09-19T10:00:00Z'),
    report('partial', 'global', [providerA], '2026-09-19T10:00:00Z'),
    { ...report('without-ddl', 'global', [providerA, providerB], '2026-09-19T10:00:00Z'), has_usable_ddl: false },
    report('archived', 'global', [providerA, providerB], '2026-09-19T10:00:00Z', 'archived'),
  ]

  assert.deepEqual(
    compatibleGlobalAuditReports(reports, [providerA, providerB]).map(({ id }) => id),
    ['audit-z', 'audit-a'],
  )
})

test('supports imported DDL rename and confirmed server deletion only', () => {
  assert.match(component, /renameAdminIntegrationDdlCandidate/)
  assert.match(component, /deleteAdminIntegrationDdlCandidate/)
  assert.match(component, /Renommer/)
  assert.match(component, /Supprimer ce DDL/)
  assert.match(component, /role="alertdialog"/)
  assert.match(api, /method: 'PATCH'/)
  assert.match(api, /deleteAdminIntegrationDdlCandidate/)
})

test('keeps archived tenants read-only and validates imported DDLs', () => {
  assert.match(component, /const isArchivedTenant = tenantStatus !== 'active'/)
  assert.match(component, /Ce client archivé est en lecture seule/)
  assert.match(component, /MAX_DDL_BYTES/)
  assert.match(component, /Le fichier doit être au format \.sql/)
  assert.match(component, /Le fichier dépasse la taille maximale de 1 MiB/)
  assert.match(component, /120 octets UTF-8/)
})

test('makes the reference dataset an explicit third step scoped by provider record', () => {
  assert.match(component, /Étape 3 — Constituer le jeu de données de référence/)
  assert.match(component, /fetchAdminIntegrationIngestions/)
  assert.match(component, /fetchAdminIntegrationIngestionCandidates/)
  assert.match(component, /selectAdminIntegrationIngestion/)
  assert.match(component, /deleteAdminIntegrationIngestion/)
  assert.match(component, /tenant_provider_record_id === provider\.tenant_provider_record_id/)
  assert.match(component, /name=\{`selected-ingestion-\$\{provider\.tenant_provider_record_id\}`\}/)
  assert.match(component, /0 \/ 2 connexions couvertes|connexions couvertes/)
  assert.match(component, /Sélectionnez un DDL à l’étape 2 avant de constituer le jeu de données de référence/)
  assert.match(component, /Aucune ingestion terminée disponible pour cette connexion/)
  assert.match(component, /Retirer l’ingestion de référence/)
  assert.match(component, /Étape 4 — Construire le modèle PostgreSQL/)
})

test('adds a single guarded model-build action without SQL or destructive controls', () => {
  assert.match(api, /AdminIntegrationModelBuild/)
  assert.match(api, /fetchAdminIntegrationModel/)
  assert.match(api, /prepareAdminIntegrationModel/)
  assert.match(api, /buildAdminIntegrationModel/)
  assert.match(component, /model_not_prepared/)
  assert.match(component, /Construire le modèle PostgreSQL/)
  assert.match(component, /Préparation du modèle…/)
  assert.match(component, /Construction en cours…/)
  assert.match(component, /modelAction !== null/)
  assert.match(component, /Un modèle physique existe déjà pour cette version/)
  assert.match(component, /invalidateModel/)
  assert.doesNotMatch(api, /model\/build[\s\S]{0,200}Content-Type/)
  assert.doesNotMatch(component, /Reconstruire le modèle|\bDROP\b|\breset\b/)
})

test('keeps canonical tenant-scoped API paths and redacted failures explicit', () => {
  assert.match(api, /\/admin\/tenants\/\$\{encodeURIComponent\(tenantId\)\}\/integrations/)
  assert.match(api, /credentials: 'include'/)
  assert.match(api, /MAX_DDL_BYTES = 1024 \* 1024/)
  assert.match(api, /getDdlValidationError/)
  assert.doesNotMatch(api, /integration-workspaces|source_ddl|working_ddl|console\./)
  assert.doesNotMatch(styles, /tenant-data-integration__|ui-reference__/)
})
