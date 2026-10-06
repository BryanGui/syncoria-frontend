import type { ReactNode } from 'react'
import { Button } from '../components/ui'
import { formatDeadline } from './dates'
import {
  FOLLOW_UP_STATUS_LABELS,
  type FollowUpAction,
  type FollowUpItem,
  type FollowUpStatus,
} from './model'

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <td>
      <span className="follow-up-cell-label">{label}</span>
      <div>{children}</div>
    </td>
  )
}
export function FollowUpTable({
  items,
  busy,
  edit,
  changeStatus,
  openCompany,
}: {
  items: FollowUpItem[]
  busy: boolean
  edit: (action: FollowUpAction) => void
  changeStatus: (action: FollowUpAction, status: FollowUpStatus) => void
  openCompany?: (id: string) => void
}) {
  return (
    <table className="follow-up-table" aria-label="Actions de suivi">
      <thead>
        <tr>
          {['Action', 'Sujet', 'Échéance', 'Statut', 'Actions'].map((label) => (
            <th key={label} scope="col">
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {items.map(({ action, subject, is_overdue }) => (
          <tr key={action.id}>
            <th scope="row">
              <Button
                variant="ghost"
                className="cp-text-button"
                disabled={busy}
                onClick={() => edit(action)}
              >
                {action.title}
              </Button>
            </th>
            <Cell label="Sujet">
              {subject.company_id && openCompany ? (
                <Button
                  variant="ghost"
                  className="cp-text-button"
                  onClick={() => openCompany(subject.company_id!)}
                >
                  {subject.label}
                </Button>
              ) : (
                subject.label
              )}
            </Cell>
            <Cell label="Échéance">
              {action.due_at ? (
                <>
                  <time dateTime={action.due_at}>{formatDeadline(action.due_at)}</time>
                  {is_overdue && action.status !== 'done' && (
                    <span className="follow-up-overdue">En retard</span>
                  )}
                </>
              ) : (
                'Sans échéance'
              )}
            </Cell>
            <Cell label="Statut">
              <span className="prospecting-status">
                {FOLLOW_UP_STATUS_LABELS[action.status]}
              </span>
            </Cell>
            <Cell label="Actions">
              <div className="follow-up-row-actions">
                <Button
                  size="compact"
                  disabled={busy}
                  onClick={() => edit(action)}
                  aria-label={`Modifier ${action.title}`}
                >
                  Modifier
                </Button>
                {action.status === 'done' ? (
                  <Button
                    size="compact"
                    disabled={busy}
                    onClick={() => changeStatus(action, 'todo')}
                    aria-label={`Rouvrir ${action.title}`}
                  >
                    Rouvrir
                  </Button>
                ) : (
                  <>
                    <Button
                      size="compact"
                      disabled={busy}
                      onClick={() => changeStatus(action, 'done')}
                      aria-label={`Terminer ${action.title}`}
                    >
                      Terminer
                    </Button>
                    {action.status === 'todo' ? (
                      <Button
                        size="compact"
                        disabled={busy}
                        onClick={() => changeStatus(action, 'waiting')}
                        aria-label={`Mettre en attente ${action.title}`}
                      >
                        En attente
                      </Button>
                    ) : (
                      <Button
                        size="compact"
                        disabled={busy}
                        onClick={() => changeStatus(action, 'todo')}
                        aria-label={`Reprendre ${action.title}`}
                      >
                        À faire
                      </Button>
                    )}
                  </>
                )}
              </div>
            </Cell>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
