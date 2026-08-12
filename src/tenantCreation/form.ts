import type { AdminTenant } from '../api/adminTenants.ts'

export interface TenantCreationDraft {
  name: string
  slug: string
}

export type TenantCreationStatus =
  | 'idle'
  | 'submitting'
  | 'conflict'
  | 'invalid'
  | 'error'

export interface TenantCreationFormState {
  draft: TenantCreationDraft
  isOpen: boolean
  status: TenantCreationStatus
}

export type TenantCreationFormAction =
  | { type: 'open' }
  | { type: 'cancel' }
  | { type: 'change_name'; name: string }
  | { type: 'change_slug'; slug: string }
  | { type: 'submit' }
  | { type: 'reject'; status: Exclude<TenantCreationStatus, 'idle' | 'submitting'> }
  | { type: 'complete' }

export interface TenantCreationValidation {
  nameError: string | null
  normalizedName: string
  normalizedSlug: string
  slugError: string | null
}

const MAX_TENANT_NAME_LENGTH = 200
const MAX_TENANT_SLUG_LENGTH = 128
const TENANT_SLUG_PATTERN = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/

export const INITIAL_TENANT_CREATION_FORM_STATE: TenantCreationFormState = {
  draft: { name: '', slug: '' },
  isOpen: false,
  status: 'idle',
}

export function tenantCreationFormReducer(
  state: TenantCreationFormState,
  action: TenantCreationFormAction,
): TenantCreationFormState {
  switch (action.type) {
    case 'open':
      return { ...INITIAL_TENANT_CREATION_FORM_STATE, isOpen: true }
    case 'cancel':
    case 'complete':
      return INITIAL_TENANT_CREATION_FORM_STATE
    case 'change_name':
      return {
        ...state,
        draft: { ...state.draft, name: action.name },
        status: 'idle',
      }
    case 'change_slug':
      return {
        ...state,
        draft: { ...state.draft, slug: action.slug },
        status: 'idle',
      }
    case 'submit':
      return { ...state, status: 'submitting' }
    case 'reject':
      return { ...state, status: action.status }
  }
}

export function integrateCreatedTenant(
  tenants: AdminTenant[],
  createdTenant: AdminTenant,
): { tenants: AdminTenant[]; tenantIdToOpen: string } {
  return {
    tenants: [...tenants, createdTenant].sort((left, right) => (
      left.slug.localeCompare(right.slug)
    )),
    tenantIdToOpen: createdTenant.id,
  }
}

export function normalizeTenantSlug(slug: string): string {
  return slug.trim().toLowerCase()
}

export function validateTenantCreationDraft(
  draft: TenantCreationDraft,
): TenantCreationValidation {
  const normalizedName = draft.name.trim()
  const normalizedSlug = normalizeTenantSlug(draft.slug)
  const nameError = normalizedName.length === 0
    ? 'Le nom du client est obligatoire.'
    : normalizedName.length > MAX_TENANT_NAME_LENGTH
      ? 'Le nom du client est trop long.'
      : null
  const slugError = normalizedSlug.length === 0
    ? 'Le slug est obligatoire.'
    : normalizedSlug.length > MAX_TENANT_SLUG_LENGTH
      || !TENANT_SLUG_PATTERN.test(normalizedSlug)
      ? 'Utilisez uniquement des minuscules, chiffres, tirets ou underscores.'
      : null

  return {
    nameError,
    normalizedName,
    normalizedSlug,
    slugError,
  }
}
