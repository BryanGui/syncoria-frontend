export const FOLLOW_UP_STATUS_LABELS = {
  todo: 'À faire',
  waiting: 'En attente',
  done: 'Terminée',
} as const
export type FollowUpStatus = keyof typeof FOLLOW_UP_STATUS_LABELS
export interface FollowUpAction {
  id: string
  subject_type: string
  subject_id: string
  title: string
  status: FollowUpStatus
  due_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}
export type FollowUpInput = Pick<
  FollowUpAction,
  'subject_type' | 'subject_id' | 'title' | 'status' | 'due_at' | 'notes'
>
export type FollowUpPatch = Partial<
  Pick<FollowUpAction, 'title' | 'status' | 'due_at' | 'notes'>
>
export interface FollowUpItem {
  action: FollowUpAction
  subject: { label: string; company_id: string | null }
  is_overdue: boolean
}
export interface FollowUpPage {
  items: FollowUpItem[]
  has_more: boolean
  limit: number
  offset: number
  as_of: string
  timezone: 'Europe/Paris'
}
export const FOLLOW_UP_VIEWS = {
  in_progress: 'En cours',
  todo: 'À faire',
  waiting: 'En attente',
  done: 'Terminées',
  all: 'Toutes',
} as const
export const FOLLOW_UP_DUE_FILTERS = {
  all: 'Toutes',
  overdue: 'En retard',
  today: 'Aujourd’hui',
  upcoming: 'À venir',
  none: 'Sans échéance',
} as const
export interface FollowUpQuery {
  view?: keyof typeof FOLLOW_UP_VIEWS
  due?: keyof typeof FOLLOW_UP_DUE_FILTERS
  q?: string
  subject_type?: string
  subject_id?: string
  sort?: 'due_at' | 'updated_at'
  limit?: number
  offset?: number
}

/** Preserve fields omitted by the editor, especially an unchanged precise deadline. */
export function changedActionFields(
  input: FollowUpPatch,
  initial: FollowUpAction,
): FollowUpPatch {
  return Object.fromEntries(
    Object.entries(input).filter(
      ([key, value]) => value !== initial[key as keyof FollowUpPatch],
    ),
  )
}
