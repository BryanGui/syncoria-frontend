export interface TenantWorkspaceTenant {
  id: string
  slug: string
  status: string
}

export function getTenantStatusLabel(status: string): string {
  if (status === 'active') return 'Actif'
  if (status === 'archived') return 'Archivé'
  return status
}

export const TENANT_WORKSPACE_SECTIONS = [
  'Vue générale',
  'Données',
  'Intégrations',
  'Automatisations',
  'Logs',
] as const

export type TenantWorkspaceSection = typeof TENANT_WORKSPACE_SECTIONS[number]

export const ADMIN_TENANT_WORKSPACE_SECTIONS = [
  'Vue générale',
  'Provider credentials',
  'Intégration',
  'Synchronisation',
  'Automatisations',
  'Logs',
] as const

export type AdminTenantWorkspaceSection =
  typeof ADMIN_TENANT_WORKSPACE_SECTIONS[number]

export const INTEGRATION_WORKSPACE_SECTIONS = [
  'Audit & cartographie',
  'Ingestion',
  'Intégration des données',
] as const

export type IntegrationWorkspaceSection =
  typeof INTEGRATION_WORKSPACE_SECTIONS[number]
