export type FleetStatus = 'critical' | 'watch' | 'due' | 'healthy' | 'unknown'
export type ActionType =
  | 'request'
  | 'incident'
  | 'intervention'
  | 'training'
  | 'review'
  | 'recommendation'
export interface OperatorAction {
  id: string
  tenantId: string
  type: ActionType
  title: string
  status: 'open' | 'in_progress' | 'awaiting_approval' | 'completed'
  priority: 'critical' | 'high' | 'normal'
  owner: string
  source: string
  createdAt: string
  dueAt: string
  completedAt: string | null
  notes: string
  provenance: 'synthetic/demo'
}
export interface FleetTenant {
  id: string
  name: string
  lifecycle: string
  status: FleetStatus
  provenance: 'syncoria' | 'synthetic/demo'
  reason: string
  referent: string | null
  providers: string[]
  users: number | null
  adoption: number | null
  costEur: number | null
  agents: {
    name: string
    provider: string
    status: string
    tools: string
    trigger: string
  }[]
  history: { date: string; title: string }[]
}
export const STATUS_LABELS: Record<FleetStatus, string> = {
  critical: 'Critique',
  watch: 'À surveiller',
  due: 'Revue / formation due',
  healthy: 'OK',
  unknown: 'Non évalué',
}
export function summarizeFleet(
  tenants: FleetTenant[],
  actions: OperatorAction[],
) {
  return {
    total: tenants.length,
    critical: tenants.filter((t) => t.status === 'critical').length,
    watch: tenants.filter((t) => t.status === 'watch').length,
    due: tenants.filter((t) => t.status === 'due').length,
    healthy: tenants.filter((t) => t.status === 'healthy').length,
    unknown: tenants.filter((t) => t.status === 'unknown').length,
    openActions: actions.filter((a) => a.status !== 'completed').length,
    costEur:
      tenants.every((t) => t.costEur !== null) && tenants.length > 0
        ? tenants.reduce((sum, t) => sum + (t.costEur ?? 0), 0)
        : null,
  }
}
export function prioritizeTenants(tenants: FleetTenant[]) {
  const order: Record<FleetStatus, number> = {
    critical: 0,
    watch: 1,
    due: 2,
    unknown: 3,
    healthy: 4,
  }
  return [...tenants].sort(
    (a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name),
  )
}
export function selectTenantActions(
  actions: OperatorAction[],
  tenantId: string,
) {
  return actions.filter((action) => action.tenantId === tenantId)
}

export const formatCostEur = (value: number | null) =>
  value === null
    ? 'Non connecté'
    : new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0,
      }).format(value)
