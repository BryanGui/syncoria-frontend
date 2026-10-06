import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createAdminFollowUpApi, type AdminFollowUpApi } from '../api/adminFollowUp'
import {
  createAdminProspectingApi,
  type AdminProspectingApi,
} from '../api/adminProspecting'
import {
  Button,
  FormField,
  Notification,
  Panel,
  SelectInput,
  TextInput,
} from '../components/ui'
import type { Company } from '../prospecting/model'
import { ActionForm } from './ActionForm'
import { FollowUpTable } from './FollowUpTable'
import {
  FOLLOW_UP_DUE_FILTERS,
  FOLLOW_UP_VIEWS,
  type FollowUpAction,
  type FollowUpQuery,
  type FollowUpStatus,
} from './model'
import { FOLLOW_UP_ERRORS, useDebouncedSearch, useFollowUpResource } from './state'
import './followUp.css'

const PAGE_SIZE = 25
type FilterState = Required<Pick<FollowUpQuery, 'view' | 'due' | 'sort' | 'offset'>>
export function FollowUpWorkspace({
  api,
  prospectingApi,
  company,
  onSessionExpired,
  openCompany,
}: {
  api: AdminFollowUpApi
  prospectingApi: AdminProspectingApi
  company?: Company
  onSessionExpired: () => void
  openCompany?: (id: string) => void
}) {
  const id = useId()
  const [filters, setFilters] = useState<FilterState>({
    view: 'in_progress',
    due: 'all',
    sort: 'due_at',
    offset: 0,
  })
  const [query, setQuery] = useState('')
  const search = useDebouncedSearch(query)
  const [editor, setEditor] = useState<FollowUpAction | 'new' | null>(null)
  const [notification, setNotification] = useState<{
    tone: 'success' | 'error'
    text: string
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const pending = useRef<AbortController | null>(null)
  useEffect(() => () => pending.current?.abort(), [])
  const companyId = company?.id
  const load = useCallback(
    (signal: AbortSignal) =>
      api.worklist(
        {
          ...filters,
          q: search,
          limit: PAGE_SIZE,
          ...(companyId
            ? { subject_type: 'prospecting.company', subject_id: companyId }
            : {}),
        },
        signal,
      ),
    [api, filters, search, companyId],
  )
  const { state, reload } = useFollowUpResource(load, onSessionExpired)
  function setFilter<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    setFilters((previous) => ({ ...previous, [key]: value, offset: 0 }))
  }
  async function changeStatus(action: FollowUpAction, status: FollowUpStatus) {
    if (pending.current && !pending.current.signal.aborted) return
    const controller = new AbortController()
    pending.current = controller
    setBusy(true)
    setNotification(null)
    const result = await api.updateAction(action.id, { status }, controller.signal)
    if (controller.signal.aborted) return
    pending.current = null
    setBusy(false)
    if (result.status === 'unauthenticated') {
      onSessionExpired()
      return
    }
    if (result.status !== 'loaded') {
      setNotification({ tone: 'error', text: FOLLOW_UP_ERRORS[result.status] })
      return
    }
    setNotification({ tone: 'success', text: 'Action mise à jour.' })
    setFilters((previous) => ({ ...previous, offset: 0 }))
    reload()
  }
  if (editor)
    return (
      <Panel className="cp-panel follow-up">
        <ActionForm
          key={editor === 'new' ? 'new' : editor.id}
          api={api}
          prospectingApi={prospectingApi}
          company={company}
          subjectLabel={
            editor !== 'new' && state.status === 'loaded'
              ? state.value.items.find((item) => item.action.id === editor.id)?.subject
                  .label
              : undefined
          }
          initial={editor === 'new' ? undefined : editor}
          onSessionExpired={onSessionExpired}
          onCancel={() => setEditor(null)}
          onSaved={() => {
            setEditor(null)
            setNotification({ tone: 'success', text: 'Action enregistrée.' })
            setFilters((previous) => ({ ...previous, offset: 0 }))
            reload()
          }}
        />
      </Panel>
    )
  return (
    <Panel className="cp-panel follow-up">
      <div className="cp-panel-heading">
        <Button
          variant="primary"
          disabled={busy}
          onClick={() => {
            setNotification(null)
            setEditor('new')
          }}
        >
          Ajouter une action
        </Button>
      </div>
      <div className="follow-up-filters">
        <FormField htmlFor={`${id}-view`} label="Vue">
          <SelectInput
            id={`${id}-view`}
            value={filters.view}
            onChange={(event) =>
              setFilter('view', event.target.value as FilterState['view'])
            }
          >
            {Object.entries(FOLLOW_UP_VIEWS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectInput>
        </FormField>
        <FormField htmlFor={`${id}-due`} label="Échéances">
          <SelectInput
            id={`${id}-due`}
            value={filters.due}
            onChange={(event) =>
              setFilter('due', event.target.value as FilterState['due'])
            }
          >
            {Object.entries(FOLLOW_UP_DUE_FILTERS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectInput>
        </FormField>
        <FormField htmlFor={`${id}-query`} label="Rechercher une action">
          <TextInput
            id={`${id}-query`}
            type="search"
            maxLength={200}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setFilter('offset', 0)
            }}
          />
        </FormField>
        <FormField htmlFor={`${id}-sort`} label="Trier par">
          <SelectInput
            id={`${id}-sort`}
            value={filters.sort}
            onChange={(event) =>
              setFilter('sort', event.target.value as FilterState['sort'])
            }
          >
            <option value="due_at">Échéance croissante</option>
            <option value="updated_at">Dernière modification</option>
          </SelectInput>
        </FormField>
      </div>
      <p className="follow-up-timezone">Échéances en Europe/Paris.</p>
      {notification && (
        <Notification tone={notification.tone} onDismiss={() => setNotification(null)}>
          {notification.text}
        </Notification>
      )}
      {state.status === 'loading' || query !== search ? (
        <p role="status">Chargement des actions…</p>
      ) : state.status !== 'loaded' ? (
        <Notification tone="error">
          {FOLLOW_UP_ERRORS[state.status]} <Button onClick={reload}>Réessayer</Button>
        </Notification>
      ) : (
        <>
          {!state.value.items.length ? (
            <p className="cp-empty">Aucune action pour cette sélection.</p>
          ) : (
            <FollowUpTable
              items={state.value.items}
              busy={busy}
              edit={setEditor}
              changeStatus={(action, status) => {
                void changeStatus(action, status)
              }}
              openCompany={openCompany}
            />
          )}
          <nav className="follow-up-actions" aria-label="Pagination des actions">
            <Button
              disabled={filters.offset === 0 || busy}
              onClick={() =>
                setFilters({
                  ...filters,
                  offset: Math.max(0, filters.offset - PAGE_SIZE),
                })
              }
            >
              Précédent
            </Button>
            <span>Page {filters.offset / PAGE_SIZE + 1}</span>
            <Button
              disabled={
                !state.value.has_more || filters.offset + PAGE_SIZE > 1_000_000 || busy
              }
              onClick={() =>
                setFilters({ ...filters, offset: filters.offset + PAGE_SIZE })
              }
            >
              Suivant
            </Button>
          </nav>
        </>
      )}
    </Panel>
  )
}

export function FollowUp({
  apiBaseUrl,
  onSessionExpired,
  openCompany,
}: {
  apiBaseUrl: string | null
  onSessionExpired: () => void
  openCompany: (id: string) => void
}) {
  const api = useMemo(() => createAdminFollowUpApi(apiBaseUrl), [apiBaseUrl])
  const prospectingApi = useMemo(
    () => createAdminProspectingApi(apiBaseUrl),
    [apiBaseUrl],
  )
  return (
    <FollowUpWorkspace
      api={api}
      prospectingApi={prospectingApi}
      onSessionExpired={onSessionExpired}
      openCompany={openCompany}
    />
  )
}
