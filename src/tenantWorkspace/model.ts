export interface TenantWorkspaceTenant {
  id: string
  slug: string
  status: string
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
  'Données',
  'Intégration',
  'Automatisations',
  'Logs',
] as const

export type AdminTenantWorkspaceSection =
  typeof ADMIN_TENANT_WORKSPACE_SECTIONS[number]
