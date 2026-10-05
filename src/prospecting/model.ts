/** Commercial records only: no tenant identity or provisioning contract. */
export const PROSPECT_STATUS_LABELS = {
  identified: 'Identifié',
  contacted: 'Contacté',
  in_discussion: 'En discussion',
  converted: 'Converti',
  closed: 'Clos',
} as const
export type ProspectStatus = keyof typeof PROSPECT_STATUS_LABELS
export interface CompanyInput {
  name: string
  website: string | null
  city: string | null
  sector: string | null
  status: ProspectStatus
  source: string | null
  notes: string | null
}
export interface Company extends CompanyInput {
  id: string
  created_at: string
  updated_at: string
}
export interface ContactInput {
  first_name: string
  last_name: string
  role: string | null
  email: string | null
  phone: string | null
  linkedin_url: string | null
  notes: string | null
}
export interface Contact extends ContactInput {
  id: string
  company_id: string
  created_at: string
  updated_at: string
}
export const COMPANY_FIELDS = [
  'name',
  'website',
  'city',
  'sector',
  'status',
  'source',
  'notes',
] as const
export const CONTACT_FIELDS = [
  'first_name',
  'last_name',
  'role',
  'email',
  'phone',
  'linkedin_url',
  'notes',
] as const

/** Explicit null clears an optional field; untouched fields are omitted from PATCH. */
export function changedFields<T extends CompanyInput | ContactInput>(
  input: T,
  original: T,
): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([key, value]) => value !== original[key as keyof T]),
  ) as Partial<T>
}
