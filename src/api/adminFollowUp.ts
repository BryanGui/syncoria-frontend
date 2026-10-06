import { technicalLogger, type TechnicalLogger } from '../observability/logger.ts'
import {
  FOLLOW_UP_STATUS_LABELS,
  FOLLOW_UP_VIEWS,
  FOLLOW_UP_DUE_FILTERS,
  type FollowUpAction,
  type FollowUpPage,
  type FollowUpInput,
  type FollowUpPatch,
  type FollowUpQuery,
} from '../followUp/model.ts'

export type FollowUpFailure =
  | 'unauthenticated'
  | 'not_found'
  | 'invalid'
  | 'unavailable'
  | 'error'
export type FollowUpResult<T> =
  | { status: 'loaded'; value: T }
  | { status: FollowUpFailure }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: unknown, max: number) =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  [...value].length <= max &&
  !value.includes('\0')
const instant = (value: unknown) =>
  typeof value === 'string' &&
  /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value) &&
  Number.isFinite(Date.parse(value))
const subjectType = (value: unknown) =>
  text(value, 100) &&
  typeof value === 'string' &&
  /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/.test(value)
const exactKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key))
export function parseFollowUpAction(value: unknown): FollowUpAction | null {
  if (
    !object(value) ||
    !exactKeys(value, [
      'id',
      'subject_type',
      'subject_id',
      'title',
      'status',
      'due_at',
      'notes',
      'created_at',
      'updated_at',
    ]) ||
    typeof value.id !== 'string' ||
    !uuid.test(value.id) ||
    !subjectType(value.subject_type) ||
    typeof value.subject_id !== 'string' ||
    !uuid.test(value.subject_id) ||
    !text(value.title, 200) ||
    typeof value.status !== 'string' ||
    !Object.hasOwn(FOLLOW_UP_STATUS_LABELS, value.status) ||
    !(value.due_at === null || instant(value.due_at)) ||
    !(value.notes === null || text(value.notes, 4000)) ||
    !instant(value.created_at) ||
    !instant(value.updated_at)
  )
    return null
  return value as unknown as FollowUpAction
}
export function parseFollowUpPage(value: unknown): FollowUpPage | null {
  if (
    !object(value) ||
    !exactKeys(value, ['items', 'has_more', 'limit', 'offset', 'as_of', 'timezone']) ||
    !Array.isArray(value.items) ||
    typeof value.has_more !== 'boolean' ||
    !Number.isInteger(value.limit) ||
    Number(value.limit) < 1 ||
    Number(value.limit) > 200 ||
    !Number.isInteger(value.offset) ||
    Number(value.offset) < 0 ||
    Number(value.offset) > 1_000_000 ||
    value.items.length > Number(value.limit) ||
    !instant(value.as_of) ||
    value.timezone !== 'Europe/Paris'
  )
    return null
  for (const item of value.items) {
    if (
      !object(item) ||
      !exactKeys(item, ['action', 'subject', 'is_overdue']) ||
      !parseFollowUpAction(item.action) ||
      !object(item.subject) ||
      !exactKeys(item.subject, ['label', 'company_id']) ||
      !text(item.subject.label, 200) ||
      !(
        item.subject.company_id === null ||
        (typeof item.subject.company_id === 'string' &&
          uuid.test(item.subject.company_id))
      ) ||
      typeof item.is_overdue !== 'boolean'
    )
      return null
    const action = item.action as unknown as FollowUpAction
    if (
      item.subject.company_id !== null &&
      (action.subject_type !== 'prospecting.company' ||
        item.subject.company_id !== action.subject_id)
    )
      return null
    if (action.status === 'done' && item.is_overdue) return null
  }
  return value as unknown as FollowUpPage
}
export function followUpQuery(query: FollowUpQuery): string | null {
  const {
    view = 'in_progress',
    due = 'all',
    sort = 'due_at',
    limit = 25,
    offset = 0,
    q,
    subject_type,
    subject_id,
  } = query
  if (
    !Object.hasOwn(FOLLOW_UP_VIEWS, view) ||
    !Object.hasOwn(FOLLOW_UP_DUE_FILTERS, due) ||
    !['due_at', 'updated_at'].includes(sort) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 200 ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > 1_000_000 ||
    (q !== undefined &&
      (typeof q !== 'string' || [...q].length > 200 || q.includes('\0'))) ||
    (subject_type !== undefined && !subjectType(subject_type)) ||
    (subject_id !== undefined && (!subject_type || !uuid.test(subject_id)))
  )
    return null
  const parameters = new URLSearchParams({
    view,
    due,
    sort,
    limit: String(limit),
    offset: String(offset),
  })
  if (q?.trim()) parameters.set('q', q.trim())
  if (subject_type) parameters.set('subject_type', subject_type)
  if (subject_id) parameters.set('subject_id', subject_id)
  return parameters.toString()
}
export function createAdminFollowUpApi(
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
  ): Promise<FollowUpResult<T>> {
    if (apiBaseUrl === null) return { status: 'unavailable' }
    try {
      const response = await request(`${apiBaseUrl}/admin/follow-up${path}`, {
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
        logger.warning('Follow-up request rejected.', {
          page: 'follow-up',
          action: method,
          endpoint,
          httpStatus: response.status,
        })
        const failures: Record<number, FollowUpFailure> = {
          404: 'not_found',
          422: 'invalid',
          503: 'unavailable',
        }
        return { status: failures[response.status] ?? 'error' }
      }
      const value = parse(await response.json())
      if (value === null) {
        logger.warning('Invalid follow-up response.', {
          page: 'follow-up',
          action: method,
          endpoint,
          errorType: 'invalid_response',
        })
        return { status: 'error' }
      }
      return { status: 'loaded', value }
    } catch {
      if (!signal?.aborted)
        logger.error('Follow-up request failed.', {
          page: 'follow-up',
          action: method,
          endpoint,
          errorType: 'request_failed',
        })
      return { status: 'error' }
    }
  }
  const invalid = async (): Promise<{ status: 'invalid' }> => ({ status: 'invalid' })
  return {
    worklist(query: FollowUpQuery = {}, signal?: AbortSignal) {
      const parameters = followUpQuery(query)
      if (parameters === null) return invalid()
      return execute(
        `/worklist?${parameters}`,
        '/admin/follow-up/worklist',
        'GET',
        parseFollowUpPage,
        signal,
      )
    },
    createAction(input: FollowUpInput, signal?: AbortSignal) {
      const fields = [
        'subject_type',
        'subject_id',
        'title',
        'status',
        'due_at',
        'notes',
      ]
      return execute(
        '/actions',
        '/admin/follow-up/actions',
        'POST',
        parseFollowUpAction,
        signal,
        Object.fromEntries(
          Object.entries(input).filter(([key]) => fields.includes(key)),
        ),
      )
    },
    updateAction(id: string, input: FollowUpPatch, signal?: AbortSignal) {
      if (!uuid.test(id)) return invalid()
      const fields = ['title', 'status', 'due_at', 'notes']
      const patch = Object.fromEntries(
        Object.entries(input).filter(([key]) => fields.includes(key)),
      )
      if (!Object.keys(patch).length) return invalid()
      return execute(
        `/actions/${id}`,
        '/admin/follow-up/actions/{action_id}',
        'PATCH',
        (value) => {
          const action = parseFollowUpAction(value)
          return action?.id === id ? action : null
        },
        signal,
        patch,
      )
    },
  }
}
export type AdminFollowUpApi = ReturnType<typeof createAdminFollowUpApi>
