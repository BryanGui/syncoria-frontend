/** Tenant-scoped advisory API. These records contain operational summaries only. */
export type AdvisoryResource =
  | 'profile'
  | 'contacts'
  | 'needs'
  | 'opportunities'
  | 'decisions'
  | 'engagements'
  | 'actions'
  | 'provider_access'
export type AdvisoryCollection = Exclude<AdvisoryResource, 'profile'>
export type AdvisoryValue = string | boolean | null
export type AdvisoryRecord = {
  tenant_id: string
  created_at: string
  updated_at: string
} & Record<string, AdvisoryValue>
export interface AdvisoryField {
  key: string
  label: string
  type: 'text' | 'boolean' | 'date' | 'reference' | 'enum'
  nullable: boolean
  max?: number
  options?: string[]
  target?: AdvisoryCollection
  defaultValue?: AdvisoryValue
  allowEmpty?: boolean
}
export interface AdvisorySpec {
  label: string
  id: string | null
  fields: AdvisoryField[]
}
export const advisorySpecs: Record<AdvisoryResource, AdvisorySpec> = {
  profile: {
    label: 'Profil conseil',
    id: null,
    fields: [
      {
        key: 'activity_summary',
        label: 'Activité',
        nullable: true,
        type: 'text',
        max: 2000,
      },
      {
        key: 'business_context',
        label: 'Contexte métier',
        nullable: true,
        type: 'text',
        max: 2000,
      },
      {
        key: 'ai_maturity_notes',
        label: 'Maturité IA',
        nullable: true,
        type: 'text',
        max: 2000,
      },
      {
        key: 'objectives',
        label: 'Objectifs',
        nullable: true,
        type: 'text',
        max: 2000,
      },
      {
        key: 'constraints',
        label: 'Contraintes',
        nullable: true,
        type: 'text',
        max: 2000,
      },
    ],
  },
  contacts: {
    label: 'Interlocuteurs',
    id: 'contact_id',
    fields: [
      {
        key: 'name',
        label: 'Nom professionnel',
        nullable: false,
        type: 'text',
        max: 200,
      },
      {
        key: 'role_title',
        label: 'Rôle',
        nullable: true,
        type: 'text',
        max: 128,
      },
      {
        key: 'email',
        label: 'Email professionnel',
        nullable: true,
        type: 'text',
        max: 320,
      },
      {
        key: 'contact_type',
        label: 'Type de contact',
        nullable: false,
        type: 'enum',
        options: [
          'decision_maker',
          'ai_referent',
          'technical',
          'business',
          'other',
        ],
        defaultValue: 'other',
      },
      {
        key: 'active',
        label: 'Actif',
        nullable: false,
        type: 'boolean',
        defaultValue: true,
      },
      {
        key: 'notes',
        label: 'Notes',
        nullable: true,
        type: 'text',
        max: 2000,
      },
    ],
  },
  needs: {
    label: 'Besoins',
    id: 'need_id',
    fields: [
      {
        key: 'title',
        label: 'Titre',
        nullable: false,
        type: 'text',
        max: 200,
      },
      {
        key: 'description',
        label: 'Besoin identifié',
        nullable: false,
        type: 'text',
        max: 2000,
      },
      {
        key: 'business_area',
        label: 'Domaine métier',
        nullable: true,
        type: 'text',
        max: 128,
      },
      {
        key: 'pain_level',
        label: 'Difficulté',
        nullable: false,
        type: 'enum',
        options: ['low', 'medium', 'high', 'unknown'],
        defaultValue: 'unknown',
      },
      {
        key: 'status',
        label: 'Statut',
        nullable: false,
        type: 'enum',
        options: ['identified', 'exploring', 'addressed', 'dropped'],
        defaultValue: 'identified',
      },
      {
        key: 'source',
        label: 'Source',
        nullable: false,
        type: 'enum',
        options: ['meeting', 'operator', 'client', 'other'],
        defaultValue: 'operator',
      },
    ],
  },
  opportunities: {
    label: 'Opportunités IA',
    id: 'opportunity_id',
    fields: [
      {
        key: 'need_id',
        label: 'Besoin associé',
        nullable: true,
        type: 'reference',
        target: 'needs',
      },
      {
        key: 'title',
        label: 'Titre',
        nullable: false,
        type: 'text',
        max: 200,
      },
      {
        key: 'hypothesis',
        label: 'Hypothèse IA',
        nullable: false,
        type: 'text',
        max: 2000,
      },
      {
        key: 'opportunity_type',
        label: 'Type',
        nullable: false,
        type: 'enum',
        options: [
          'assist',
          'automate',
          'agent',
          'analyze',
          'integrate',
          'train',
          'other',
        ],
        defaultValue: 'other',
      },
      {
        key: 'expected_value',
        label: 'Valeur attendue',
        nullable: false,
        type: 'enum',
        options: ['low', 'medium', 'high', 'unknown'],
        defaultValue: 'unknown',
      },
      {
        key: 'feasibility',
        label: 'Faisabilité',
        nullable: false,
        type: 'enum',
        options: ['low', 'medium', 'high', 'unknown'],
        defaultValue: 'unknown',
      },
      {
        key: 'priority',
        label: 'Priorité',
        nullable: false,
        type: 'enum',
        options: ['low', 'normal', 'high'],
        defaultValue: 'normal',
      },
      {
        key: 'status',
        label: 'Statut',
        nullable: false,
        type: 'enum',
        options: [
          'idea',
          'evaluating',
          'proposed',
          'approved',
          'rejected',
          'implemented',
        ],
        defaultValue: 'idea',
      },
    ],
  },
  decisions: {
    label: 'Décisions & recommandations',
    id: 'decision_id',
    fields: [
      {
        key: 'opportunity_id',
        label: 'Opportunité associée',
        nullable: true,
        type: 'reference',
        target: 'opportunities',
      },
      {
        key: 'title',
        label: 'Titre',
        nullable: false,
        type: 'text',
        max: 200,
      },
      {
        key: 'decision',
        label: 'Recommandation / décision',
        nullable: false,
        type: 'text',
        max: 2000,
      },
      {
        key: 'rationale',
        label: 'Pourquoi cette approche ?',
        nullable: false,
        type: 'text',
        max: 2000,
      },
      {
        key: 'status',
        label: 'Statut',
        nullable: false,
        type: 'enum',
        options: ['proposed', 'accepted', 'rejected', 'superseded'],
        defaultValue: 'proposed',
      },
      {
        key: 'decided_at',
        label: 'Date de décision',
        nullable: true,
        type: 'date',
      },
    ],
  },
  engagements: {
    label: 'Réalisations',
    id: 'engagement_id',
    fields: [
      {
        key: 'opportunity_id',
        label: 'Opportunité associée',
        nullable: true,
        type: 'reference',
        target: 'opportunities',
      },
      {
        key: 'title',
        label: 'Titre',
        nullable: false,
        type: 'text',
        max: 200,
      },
      {
        key: 'kind',
        label: 'Type de réalisation',
        nullable: false,
        type: 'enum',
        options: [
          'prototype',
          'integration',
          'agent',
          'automation',
          'training',
          'assessment',
          'other',
        ],
        defaultValue: 'other',
      },
      {
        key: 'status',
        label: 'Statut',
        nullable: false,
        type: 'enum',
        options: ['planned', 'in_progress', 'delivered', 'paused', 'cancelled'],
        defaultValue: 'planned',
      },
      {
        key: 'summary',
        label: 'Synthèse de la réalisation',
        nullable: false,
        type: 'text',
        max: 2000,
      },
      {
        key: 'started_at',
        label: 'Début',
        nullable: true,
        type: 'date',
      },
      {
        key: 'delivered_at',
        label: 'Livraison',
        nullable: true,
        type: 'date',
      },
      {
        key: 'outcome_notes',
        label: 'Résultats observés',
        nullable: true,
        type: 'text',
        max: 2000,
      },
    ],
  },
  actions: {
    label: 'Prochaines actions',
    id: 'action_id',
    fields: [
      {
        key: 'title',
        label: 'Titre',
        nullable: false,
        type: 'text',
        max: 200,
      },
      {
        key: 'type',
        label: 'Type',
        nullable: false,
        type: 'enum',
        options: [
          'request',
          'incident',
          'intervention',
          'training',
          'review',
          'recommendation',
        ],
        defaultValue: 'request',
      },
      {
        key: 'status',
        label: 'Statut',
        nullable: false,
        type: 'enum',
        options: [
          'open',
          'in_progress',
          'awaiting_approval',
          'completed',
          'cancelled',
        ],
        defaultValue: 'open',
      },
      {
        key: 'priority',
        label: 'Priorité',
        nullable: false,
        type: 'enum',
        options: ['critical', 'high', 'normal', 'low'],
        defaultValue: 'normal',
      },
      {
        key: 'owner',
        label: 'Responsable',
        nullable: true,
        type: 'text',
        max: 128,
      },
      {
        key: 'source',
        label: 'Source',
        nullable: false,
        type: 'text',
        max: 128,
        defaultValue: 'operator',
      },
      {
        key: 'due_at',
        label: 'Échéance',
        nullable: true,
        type: 'date',
      },
      {
        key: 'notes',
        label: 'Notes',
        nullable: false,
        type: 'text',
        max: 2000,
        defaultValue: '',
        allowEmpty: true,
      },
      {
        key: 'need_id',
        label: 'Besoin associé',
        nullable: true,
        type: 'reference',
        target: 'needs',
      },
      {
        key: 'opportunity_id',
        label: 'Opportunité associée',
        nullable: true,
        type: 'reference',
        target: 'opportunities',
      },
      {
        key: 'decision_id',
        label: 'Décision associée',
        nullable: true,
        type: 'reference',
        target: 'decisions',
      },
      {
        key: 'engagement_id',
        label: 'Réalisation associée',
        nullable: true,
        type: 'reference',
        target: 'engagements',
      },
    ],
  },
  provider_access: {
    label: 'Accès client',
    id: 'access_reference_id',
    fields: [
      {
        key: 'provider',
        label: 'Provider',
        nullable: false,
        type: 'text',
        max: 64,
      },
      {
        key: 'label',
        label: 'Libellé',
        nullable: false,
        type: 'text',
        max: 200,
      },
      {
        key: 'access_type',
        label: 'Type d’accès',
        nullable: false,
        type: 'enum',
        options: [
          'workspace_membership',
          'admin_api',
          'oauth',
          'sso',
          'manual',
          'other',
        ],
        defaultValue: 'manual',
      },
      {
        key: 'workspace_name',
        label: 'Workspace',
        nullable: true,
        type: 'text',
        max: 200,
      },
      {
        key: 'workspace_external_id',
        label: 'Référence du workspace',
        nullable: true,
        type: 'text',
        max: 256,
      },
      {
        key: 'login_url',
        label: 'URL de connexion HTTPS',
        nullable: true,
        type: 'text',
        max: 2048,
      },
      {
        key: 'operator_identity_hint',
        label: 'Compte à sélectionner',
        nullable: true,
        type: 'text',
        max: 128,
      },
      {
        key: 'notes',
        label: 'Notes',
        nullable: true,
        type: 'text',
        max: 2000,
      },
      {
        key: 'status',
        label: 'Statut',
        nullable: false,
        type: 'enum',
        options: ['active', 'pending', 'revoked', 'unknown'],
        defaultValue: 'unknown',
      },
      {
        key: 'last_verified_at',
        label: 'Dernière vérification',
        nullable: true,
        type: 'date',
      },
    ],
  },
}
export const advisoryCollections = Object.keys(advisorySpecs).filter(
  (key): key is AdvisoryCollection => key !== 'profile',
)
export interface AdvisoryTimelineEntry {
  tenant_id: string
  resource: 'needs' | 'opportunities' | 'decisions' | 'engagements' | 'actions'
  resource_id: string
  event: string
  at: string
  title: string
}
export type AdvisoryDossier = {
  tenant: { tenant_id: string; slug: string; name: string; status: 'active' }
  read_at: string
  profile: AdvisoryRecord | null
  recent_timeline: AdvisoryTimelineEntry[]
} & Record<AdvisoryCollection, AdvisoryRecord[]>
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const date = (value: unknown): value is string =>
  typeof value === 'string' &&
  /(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
  Number.isFinite(Date.parse(value))
const secret =
  /(?:bearer\s+[a-z0-9._~-]+|(?:password|passwd|api[_ -]?key|access[_ -]?token|refresh[_ -]?token|token|secret|credential|session[_ -]?cookie)\s*[:=]\s*\S+|sk-(?:proj-|ant-)?[a-z0-9_-]{12,}|eyJ[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+)/i
export function safeLauncherUrl(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length > 2048 ||
    /[\\@?#%]/.test(value) ||
    [...value].some(
      (char) =>
        /\s/.test(char) || char.charCodeAt(0) < 32 || char.charCodeAt(0) > 126,
    ) ||
    secret.test(value)
  )
    return false
  try {
    const url = new URL(value)
    return (
      value.startsWith('https://') &&
      url.protocol === 'https:' &&
      !/\/(?:token|secret|password|credential|session|code)(?:\/|=|$)/i.test(
        url.pathname,
      ) &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === '443') &&
      url.hostname.length <= 253 &&
      url.hostname.includes('.') &&
      url.hostname
        .split('.')
        .every((part) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(part))
    )
  } catch {
    return false
  }
}
export function parseAdvisoryRecord(
  value: unknown,
  resource: AdvisoryResource,
  tenantId: string,
): AdvisoryRecord | null {
  if (
    !object(value) ||
    value.tenant_id !== tenantId ||
    !date(value.created_at) ||
    !date(value.updated_at)
  )
    return null
  const spec = advisorySpecs[resource]
  const allowed = [
    'tenant_id',
    'created_at',
    'updated_at',
    ...spec.fields.map((f) => f.key),
    ...(spec.id ? [spec.id] : []),
    ...(resource === 'actions'
      ? ['completed_at', 'provenance', 'alert_id']
      : []),
  ]
  if (Object.keys(value).some((key) => !allowed.includes(key))) return null
  if (
    spec.id &&
    (typeof value[spec.id] !== 'string' || !uuid.test(String(value[spec.id])))
  )
    return null
  for (const field of spec.fields) {
    const item = value[field.key]
    if (item === null && field.nullable) continue
    if (field.type === 'boolean') {
      if (typeof item !== 'boolean') return null
      continue
    }
    if (typeof item !== 'string') return null
    if (
      secret.test(item) ||
      [...item].some(
        (char) => char.charCodeAt(0) < 32 && !['\n', '\t'].includes(char),
      )
    )
      return null
    if (
      field.type === 'text' &&
      ((!field.allowEmpty && !item.trim()) || item.length > (field.max ?? 2000))
    )
      return null
    if (field.type === 'enum' && !field.options?.includes(item)) return null
    if (field.type === 'reference' && !uuid.test(item)) return null
    if (field.type === 'date' && !date(item)) return null
    if (field.key === 'provider' && !/^[a-z0-9_-]{1,64}$/.test(item))
      return null
    if (field.key === 'login_url' && !safeLauncherUrl(item)) return null
    if (field.key === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item))
      return null
  }
  if (resource === 'actions') {
    if (
      value.provenance !== 'syncoria' ||
      (value.alert_id !== null &&
        (typeof value.alert_id !== 'string' || !uuid.test(value.alert_id)))
    )
      return null
    if (
      (value.status === 'completed') !== (value.completed_at !== null) ||
      (value.completed_at !== null && !date(value.completed_at))
    )
      return null
  }
  return value as AdvisoryRecord
}
const timelineEvents: Record<string, string> = {
  need_created: 'needs',
  opportunity_created: 'opportunities',
  decision_accepted: 'decisions',
  engagement_started: 'engagements',
  engagement_delivered: 'engagements',
  action_completed: 'actions',
}
export function parseAdvisoryDossier(
  value: unknown,
  tenantId: string,
): AdvisoryDossier | null {
  if (
    !uuid.test(tenantId) ||
    !object(value) ||
    !object(value.tenant) ||
    value.tenant.tenant_id !== tenantId ||
    value.tenant.status !== 'active' ||
    typeof value.tenant.slug !== 'string' ||
    typeof value.tenant.name !== 'string' ||
    !date(value.read_at)
  )
    return null
  if (
    Object.keys(value.tenant).some(
      (key) => !['tenant_id', 'slug', 'name', 'status'].includes(key),
    ) ||
    Object.keys(value).some(
      (key) =>
        ![
          'tenant',
          'read_at',
          'profile',
          'recent_timeline',
          ...advisoryCollections,
        ].includes(key),
    )
  )
    return null
  if (
    value.profile !== null &&
    !parseAdvisoryRecord(value.profile, 'profile', tenantId)
  )
    return null
  for (const collection of advisoryCollections) {
    const rows = value[collection]
    if (
      !Array.isArray(rows) ||
      rows.some((row) => !parseAdvisoryRecord(row, collection, tenantId))
    )
      return null
  }
  if (
    !Array.isArray(value.recent_timeline) ||
    value.recent_timeline.length > 50
  )
    return null
  for (const event of value.recent_timeline) {
    if (
      !object(event) ||
      event.tenant_id !== tenantId ||
      !date(event.at) ||
      typeof event.resource_id !== 'string' ||
      !uuid.test(event.resource_id) ||
      typeof event.title !== 'string' ||
      event.title.length > 200 ||
      typeof event.event !== 'string' ||
      !Object.hasOwn(timelineEvents, event.event) ||
      typeof event.resource !== 'string' ||
      timelineEvents[event.event] !== event.resource ||
      Object.keys(event).some(
        (key) =>
          ![
            'tenant_id',
            'resource',
            'resource_id',
            'event',
            'at',
            'title',
          ].includes(key),
      )
    )
      return null
    const resource = event.resource as AdvisoryCollection
    const rows = value[resource] as AdvisoryRecord[]
    if (
      !rows.some(
        (row) =>
          row[advisorySpecs[resource].id!] === event.resource_id &&
          row.title === event.title,
      )
    )
      return null
  }
  return value as AdvisoryDossier
}
export type AdvisoryResult<T> =
  | { status: 'loaded'; data: T }
  | {
      status:
        | 'unauthenticated'
        | 'unavailable'
        | 'invalid'
        | 'archived'
        | 'not_found'
    }
function failure(
  status: number,
): Exclude<AdvisoryResult<never>, { status: 'loaded' }> {
  return {
    status:
      status === 401
        ? 'unauthenticated'
        : status === 422
          ? 'invalid'
          : status === 409
            ? 'archived'
            : status === 404
              ? 'not_found'
              : 'unavailable',
  }
}
export async function fetchAdvisoryDossier(
  apiBaseUrl: string | null,
  tenantId: string,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
): Promise<AdvisoryResult<AdvisoryDossier>> {
  if (!apiBaseUrl || !uuid.test(tenantId)) return { status: 'unavailable' }
  try {
    const response = await request(
      `${apiBaseUrl}/admin/advisory/tenants/${tenantId}/dossier`,
      { credentials: 'include', signal },
    )
    if (!response.ok) return failure(response.status)
    const data = parseAdvisoryDossier(await response.json(), tenantId)
    return data ? { status: 'loaded', data } : { status: 'unavailable' }
  } catch {
    return { status: 'unavailable' }
  }
}
export async function saveAdvisoryRecord(
  apiBaseUrl: string | null,
  tenantId: string,
  resource: AdvisoryResource,
  payload: Record<string, AdvisoryValue>,
  recordId?: string,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
): Promise<AdvisoryResult<AdvisoryRecord>> {
  if (!apiBaseUrl || !uuid.test(tenantId) || (recordId && !uuid.test(recordId)))
    return { status: 'unavailable' }
  try {
    const path = resource.replace('_', '-') + (recordId ? `/${recordId}` : '')
    const response = await request(
      `${apiBaseUrl}/admin/advisory/tenants/${tenantId}/${path}`,
      {
        method: resource === 'profile' || recordId ? 'PUT' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal,
      },
    )
    if (!response.ok) return failure(response.status)
    const data = parseAdvisoryRecord(await response.json(), resource, tenantId)
    return data ? { status: 'loaded', data } : { status: 'unavailable' }
  } catch {
    return { status: 'unavailable' }
  }
}
