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
  'Logs',
  'Superset',
] as const

export type TenantWorkspaceSection = typeof TENANT_WORKSPACE_SECTIONS[number]

export const ADMIN_TENANT_WORKSPACE_SECTIONS = [
  'Vue générale',
  'Audit',
  'Ingestion',
  'Intégration',
  'Sources',
  'Accès',
  'Synchronisations',
  'Workflows',
  'Logs',
  'Superset',
] as const

export type AdminTenantWorkspaceSection =
  typeof ADMIN_TENANT_WORKSPACE_SECTIONS[number]

export const ADMIN_TENANT_GROUPS = [
  { label: 'Pipeline', sections: ['Ingestion', 'Intégration'] },
  { label: 'Configuration', sections: ['Sources', 'Accès'] },
  { label: 'Automatisations', sections: ['Synchronisations', 'Workflows'] },
] as const

export type AdminTenantGroup = typeof ADMIN_TENANT_GROUPS[number]['label']
