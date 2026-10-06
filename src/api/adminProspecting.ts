import { technicalLogger, type TechnicalLogger } from '../observability/logger.ts'
import {
  COMPANY_FIELDS,
  CONTACT_FIELDS,
  PROSPECT_STATUS_LABELS,
  type Company,
  type CompanyInput,
  type Contact,
  type ContactInput,
} from '../prospecting/model.ts'

export type ProspectingFailure =
  | 'unauthenticated'
  | 'not_found'
  | 'invalid'
  | 'unavailable'
  | 'error'
export type ProspectingResult<T> =
  | { status: 'loaded'; value: T }
  | { status: ProspectingFailure }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: unknown, max: number) =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  [...value].length <= max &&
  !value.includes('\0')
const nullableText = (value: unknown, max: number) => value === null || text(value, max)
const date = (value: unknown) =>
  typeof value === 'string' &&
  /^\d{4}-\d\d-\d\dT/.test(value) &&
  Number.isFinite(Date.parse(value))
function httpUrl(value: unknown): boolean {
  if (value === null) return true
  if (!text(value, 2048) || typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      !!url.hostname &&
      !url.username &&
      !url.password
    )
  } catch {
    return false
  }
}
function record(
  value: unknown,
  fields: readonly string[],
): value is Record<string, unknown> {
  return (
    object(value) &&
    typeof value.id === 'string' &&
    uuid.test(value.id) &&
    date(value.created_at) &&
    date(value.updated_at) &&
    Object.keys(value).every((key) =>
      [...fields, 'id', 'created_at', 'updated_at'].includes(key),
    )
  )
}
export function parseCompany(value: unknown): Company | null {
  if (
    !record(value, COMPANY_FIELDS) ||
    !text(value.name, 200) ||
    !httpUrl(value.website) ||
    !nullableText(value.city, 200) ||
    !nullableText(value.sector, 200) ||
    !nullableText(value.source, 200) ||
    !nullableText(value.notes, 4000) ||
    typeof value.status !== 'string' ||
    !Object.hasOwn(PROSPECT_STATUS_LABELS, value.status)
  )
    return null
  return value as unknown as Company
}
export function parseContact(value: unknown, companyId?: string): Contact | null {
  if (
    !record(value, [...CONTACT_FIELDS, 'company_id']) ||
    typeof value.company_id !== 'string' ||
    !uuid.test(value.company_id) ||
    (companyId !== undefined && value.company_id !== companyId) ||
    !text(value.first_name, 200) ||
    !text(value.last_name, 200) ||
    !nullableText(value.role, 200) ||
    !nullableText(value.phone, 64) ||
    !nullableText(value.notes, 4000) ||
    !nullableText(value.email, 320) ||
    (value.email !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value.email))) ||
    !httpUrl(value.linkedin_url)
  )
    return null
  return value as unknown as Contact
}
function parseList<T>(value: unknown, parse: (entry: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null
  const entries = value.map(parse)
  return entries.some((entry) => entry === null) ? null : (entries as T[])
}
function pick(input: object, fields: readonly string[]) {
  return Object.fromEntries(
    Object.entries(input).filter(([key]) => fields.includes(key)),
  )
}

/** Every operation uses the authenticated admin API; no demo or tenant fallback. */
export function createAdminProspectingApi(
  apiBaseUrl: string | null,
  request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
) {
  async function execute<T>(
    path: string,
    endpoint: string,
    method: 'GET' | 'POST' | 'PATCH',
    parse: (value: unknown) => T | null,
    signal?: AbortSignal,
    input?: object,
  ): Promise<ProspectingResult<T>> {
    if (apiBaseUrl === null) return { status: 'unavailable' }
    try {
      const response = await request(`${apiBaseUrl}/admin/prospecting${path}`, {
        method,
        credentials: 'include',
        signal,
        headers: {
          Accept: 'application/json',
          ...(input ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(input ? { body: JSON.stringify(input) } : {}),
      })
      if (response.status === 401) return { status: 'unauthenticated' }
      if (!response.ok) {
        logger.warning('Prospecting request rejected.', {
          page: 'prospecting',
          action: method,
          endpoint,
          httpStatus: response.status,
        })
        const statuses: Record<number, ProspectingFailure> = {
          404: 'not_found',
          422: 'invalid',
          503: 'unavailable',
        }
        return { status: statuses[response.status] ?? 'error' }
      }
      const value = parse(await response.json())
      if (value === null) {
        logger.warning('Invalid prospecting response.', {
          page: 'prospecting',
          action: method,
          endpoint,
          errorType: 'invalid_response',
        })
        return { status: 'error' }
      }
      return { status: 'loaded', value }
    } catch {
      if (!signal?.aborted)
        logger.error('Prospecting request failed.', {
          page: 'prospecting',
          action: method,
          endpoint,
          errorType: 'request_failed',
        })
      return { status: 'error' }
    }
  }
  const validPage = (limit: number, offset: number) =>
    Number.isInteger(limit) &&
    limit >= 1 &&
    limit <= 200 &&
    Number.isSafeInteger(offset) &&
    offset >= 0
  const invalid = async (): Promise<{ status: 'invalid' }> => ({ status: 'invalid' })
  return {
    listCompanies(limit = 25, offset = 0, signal?: AbortSignal) {
      if (!validPage(limit, offset)) return invalid()
      return execute(
        `/companies?limit=${limit}&offset=${offset}`,
        '/admin/prospecting/companies',
        'GET',
        (value) => parseList(value, parseCompany),
        signal,
      )
    },
    getCompany(id: string, signal?: AbortSignal) {
      if (!uuid.test(id)) return invalid()
      return execute(
        `/companies/${id}`,
        '/admin/prospecting/companies/{company_id}',
        'GET',
        (value) => {
          const company = parseCompany(value)
          return company?.id === id ? company : null
        },
        signal,
      )
    },
    createCompany(input: CompanyInput, signal?: AbortSignal) {
      return execute(
        '/companies',
        '/admin/prospecting/companies',
        'POST',
        parseCompany,
        signal,
        pick(input, COMPANY_FIELDS),
      )
    },
    updateCompany(id: string, input: Partial<CompanyInput>, signal?: AbortSignal) {
      if (!uuid.test(id)) return invalid()
      return execute(
        `/companies/${id}`,
        '/admin/prospecting/companies/{company_id}',
        'PATCH',
        (value) => {
          const company = parseCompany(value)
          return company?.id === id ? company : null
        },
        signal,
        pick(input, COMPANY_FIELDS),
      )
    },
    listContacts(companyId: string, limit = 25, offset = 0, signal?: AbortSignal) {
      if (!uuid.test(companyId) || !validPage(limit, offset)) return invalid()
      return execute(
        `/companies/${companyId}/contacts?limit=${limit}&offset=${offset}`,
        '/admin/prospecting/companies/{company_id}/contacts',
        'GET',
        (value) => parseList(value, (entry) => parseContact(entry, companyId)),
        signal,
      )
    },
    getContact(id: string, companyId: string, signal?: AbortSignal) {
      if (!uuid.test(id) || !uuid.test(companyId)) return invalid()
      return execute(
        `/contacts/${id}`,
        '/admin/prospecting/contacts/{contact_id}',
        'GET',
        (value) => {
          const contact = parseContact(value, companyId)
          return contact?.id === id ? contact : null
        },
        signal,
      )
    },
    createContact(companyId: string, input: ContactInput, signal?: AbortSignal) {
      if (!uuid.test(companyId)) return invalid()
      return execute(
        `/companies/${companyId}/contacts`,
        '/admin/prospecting/companies/{company_id}/contacts',
        'POST',
        (value) => parseContact(value, companyId),
        signal,
        pick(input, CONTACT_FIELDS),
      )
    },
    updateContact(
      id: string,
      companyId: string,
      input: Partial<ContactInput>,
      signal?: AbortSignal,
    ) {
      if (!uuid.test(id) || !uuid.test(companyId)) return invalid()
      return execute(
        `/contacts/${id}`,
        '/admin/prospecting/contacts/{contact_id}',
        'PATCH',
        (value) => {
          const contact = parseContact(value, companyId)
          return contact?.id === id ? contact : null
        },
        signal,
        pick(input, CONTACT_FIELDS),
      )
    },
  }
}
export type AdminProspectingApi = ReturnType<typeof createAdminProspectingApi>
