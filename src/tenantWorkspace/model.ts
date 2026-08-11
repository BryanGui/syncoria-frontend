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
