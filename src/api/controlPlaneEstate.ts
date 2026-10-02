import type { ControlPlaneProvenance } from '../controlPlane/model.ts'

export const estateCollections = [
  'identities',
  'groups',
  'identity_groups',
  'memberships',
  'licenses',
  'automations',
  'permissions',
  'metrics',
  'states',
] as const
export type EstateCollection = (typeof estateCollections)[number]
export interface EstateRecord {
  tenant_id: string
  provenance: ControlPlaneProvenance
  observed_at: string | null
}
export interface TenantIdentity extends EstateRecord {
  identity_id: string
  display_name: string
  primary_email: string | null
  status: 'active' | 'inactive' | 'unknown'
  department: string | null
  job_title: string | null
  source_of_truth: string | null
  created_at: string
  updated_at: string
}
export interface TenantGroup extends EstateRecord {
  group_id: string
  name: string
  external_ref: string | null
  source_system: string | null
  status: string
}
export interface TenantIdentityGroup extends EstateRecord {
  identity_id: string
  group_id: string
}
export interface AIProviderMembership extends EstateRecord {
  membership_id: string
  identity_id: string | null
  provider: string
  external_user_id: string | null
  external_email: string | null
  role: string | null
  status: string
  observed_at: string
}
export interface AIProviderLicense extends EstateRecord {
  license_id: string
  provider: string
  identity_id: string | null
  membership_id: string | null
  external_license_id: string | null
  plan: string | null
  status: string
  assigned_at: string | null
  last_seen_at: string | null
  observed_at: string
}
export interface ManagedEstateAutomation extends EstateRecord {
  automation_id: string
  provider: string
  external_id: string | null
  kind: 'agent' | 'automation'
  name: string
  objective: string | null
  status: 'healthy' | 'error' | 'paused' | 'unknown'
  owner_identity_id: string | null
  tools: string[]
  connectors: string[]
  trigger: string | null
  last_run_at: string | null
  last_review_at: string | null
  observed_at: string
}
export interface ObservedPermission extends EstateRecord {
  permission_id: string
  provider: string
  subject_type: 'user' | 'group' | 'agent'
  subject_ref: string
  resource: string
  action: string
  policy: 'allowed' | 'denied' | 'approval_required' | 'unknown'
  observed_at: string
}
export interface ObservabilityMetric extends EstateRecord {
  signal_id: string
  provider: string
  kind:
    | 'users'
    | 'groups'
    | 'licenses'
    | 'usage'
    | 'costs'
    | 'agents'
    | 'tools'
    | 'mcp_calls'
    | 'approvals'
    | 'errors'
  value: number
  unit: string
  observed_at: string
}
export interface ObservabilityState extends EstateRecord {
  signal_id: string
  provider: string
  kind: 'permissions' | 'service_health'
  state: string
  observed_at: string
}
export interface TenantAIEstate {
  tenant: { tenant_id: string; slug: string; name: string; status: 'active' }
  read_at: string
  identities: TenantIdentity[]
  groups: TenantGroup[]
  identity_groups: TenantIdentityGroup[]
  memberships: AIProviderMembership[]
  licenses: AIProviderLicense[]
  automations: ManagedEstateAutomation[]
  permissions: ObservedPermission[]
  metrics: ObservabilityMetric[]
  states: ObservabilityState[]
}
const nullable = new Set([
  'primary_email',
  'department',
  'job_title',
  'source_of_truth',
  'external_ref',
  'source_system',
  'identity_id',
  'external_user_id',
  'external_email',
  'role',
  'membership_id',
  'external_license_id',
  'plan',
  'assigned_at',
  'last_seen_at',
  'external_id',
  'objective',
  'owner_identity_id',
  'trigger',
  'last_run_at',
  'last_review_at',
])
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const fields: Record<EstateCollection, string[]> = {
  identities: [
    'identity_id',
    'display_name',
    'primary_email',
    'status',
    'department',
    'job_title',
    'source_of_truth',
    'created_at',
    'updated_at',
  ],
  groups: ['group_id', 'name', 'external_ref', 'source_system', 'status'],
  identity_groups: ['identity_id', 'group_id'],
  memberships: [
    'membership_id',
    'identity_id',
    'provider',
    'external_user_id',
    'external_email',
    'role',
    'status',
  ],
  licenses: [
    'license_id',
    'provider',
    'identity_id',
    'membership_id',
    'external_license_id',
    'plan',
    'status',
    'assigned_at',
    'last_seen_at',
  ],
  automations: [
    'automation_id',
    'provider',
    'external_id',
    'kind',
    'name',
    'objective',
    'status',
    'owner_identity_id',
    'tools',
    'connectors',
    'trigger',
    'last_run_at',
    'last_review_at',
  ],
  permissions: [
    'permission_id',
    'provider',
    'subject_type',
    'subject_ref',
    'resource',
    'action',
    'policy',
  ],
  metrics: ['signal_id', 'provider', 'kind', 'value', 'unit'],
  states: ['signal_id', 'provider', 'kind', 'state'],
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function date(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    /(?:Z|[+-]\d\d:\d\d)$/.test(value) &&
    Number.isFinite(Date.parse(value))
  )
}
/** Live views fail closed on fixture provenance, unexpected fields, or scope mismatch. */
export function parseTenantEstate(
  value: unknown,
  tenantId: string,
): TenantAIEstate | null {
  if (!uuid.test(tenantId) || !object(value) || !object(value.tenant))
    return null
  const tenant = value.tenant
  if (
    tenant.tenant_id !== tenantId ||
    tenant.status !== 'active' ||
    typeof tenant.slug !== 'string' ||
    typeof tenant.name !== 'string' ||
    !date(value.read_at)
  )
    return null
  if (
    Object.keys(tenant).some(
      (key) => !['tenant_id', 'slug', 'name', 'status'].includes(key),
    ) ||
    Object.keys(value).some(
      (key) =>
        !['tenant', 'read_at', ...estateCollections].includes(
          key as EstateCollection,
        ),
    )
  )
    return null
  for (const collection of estateCollections) {
    const records = value[collection]
    if (!Array.isArray(records)) return null
    for (const record of records) {
      if (
        !object(record) ||
        record.tenant_id !== tenantId ||
        !['provider', 'syncoria'].includes(String(record.provenance))
      )
        return null
      if (record.observed_at !== null && !date(record.observed_at)) return null
      if (
        !['identities', 'groups', 'identity_groups'].includes(collection) &&
        record.observed_at === null
      )
        return null
      const allowed = [
        'tenant_id',
        'provenance',
        'observed_at',
        ...fields[collection],
      ]
      if (Object.keys(record).some((key) => !allowed.includes(key))) return null
      for (const key of fields[collection]) {
        const item = record[key]
        if (
          item === undefined ||
          (item === null &&
            (!nullable.has(key) ||
              collection === 'identity_groups' ||
              (collection === 'identities' && key === 'identity_id') ||
              (collection === 'memberships' && key === 'membership_id')))
        )
          return null
        if (typeof item === 'string' && !item.trim()) return null
        if (
          (key.endsWith('_at') ||
            key === 'created_at' ||
            key === 'updated_at') &&
          item !== null &&
          !date(item)
        )
          return null
        if (key === 'value') {
          if (typeof item !== 'number' || !Number.isFinite(item) || item < 0)
            return null
        } else if (key === 'tools' || key === 'connectors') {
          if (
            !Array.isArray(item) ||
            item.length > 64 ||
            !item.every(
              (ref) =>
                typeof ref === 'string' && ref.length > 0 && ref.length <= 128,
            )
          )
            return null
        } else if (
          item !== null &&
          (typeof item !== 'string' || item.length > 320)
        )
          return null
        if (
          [
            'identity_id',
            'group_id',
            'membership_id',
            'license_id',
            'automation_id',
            'permission_id',
            'signal_id',
            'owner_identity_id',
          ].includes(key) &&
          item !== null &&
          (typeof item !== 'string' || !uuid.test(item))
        )
          return null
        if (
          key === 'status' &&
          collection === 'identities' &&
          !['active', 'inactive', 'unknown'].includes(String(item))
        )
          return null
        if (
          key === 'status' &&
          collection === 'automations' &&
          !['healthy', 'error', 'paused', 'unknown'].includes(String(item))
        )
          return null
        if (
          key === 'policy' &&
          !['allowed', 'denied', 'approval_required', 'unknown'].includes(
            String(item),
          )
        )
          return null
        if (
          key === 'subject_type' &&
          !['user', 'group', 'agent'].includes(String(item))
        )
          return null
        if (
          key === 'kind' &&
          collection === 'automations' &&
          !['agent', 'automation'].includes(String(item))
        )
          return null
        if (
          key === 'kind' &&
          collection === 'metrics' &&
          ![
            'users',
            'groups',
            'licenses',
            'usage',
            'costs',
            'agents',
            'tools',
            'mcp_calls',
            'approvals',
            'errors',
          ].includes(String(item))
        )
          return null
        if (
          key === 'kind' &&
          collection === 'states' &&
          !['permissions', 'service_health'].includes(String(item))
        )
          return null
        if (
          key === 'provider' &&
          (typeof item !== 'string' || !/^[a-z0-9_-]{1,64}$/.test(item))
        )
          return null
      }
    }
  }
  return value as unknown as TenantAIEstate
}
export type EstateResult =
  | { status: 'loaded'; estate: TenantAIEstate }
  | { status: 'error' | 'unauthenticated' }
export async function fetchTenantEstate(
  apiBaseUrl: string | null,
  tenantId: string,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
): Promise<EstateResult> {
  if (!apiBaseUrl || !uuid.test(tenantId)) return { status: 'error' }
  try {
    const response = await request(
      `${apiBaseUrl}/admin/control-plane/tenants/${tenantId}/estate`,
      {
        credentials: 'include',
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal,
      },
    )
    if (response.status === 401) return { status: 'unauthenticated' }
    if (!response.ok) return { status: 'error' }
    const estate = parseTenantEstate(await response.json(), tenantId)
    return estate ? { status: 'loaded', estate } : { status: 'error' }
  } catch {
    return { status: 'error' }
  }
}
