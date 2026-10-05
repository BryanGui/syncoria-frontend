import { Button, Notification } from '../components/ui'
import type { AdminProspectingApi, ProspectingFailure } from '../api/adminProspecting'
import { PROSPECTING_ERRORS } from './state'

export const PAGE_SIZE = 25
export interface ProspectingProps {
  api: AdminProspectingApi
  onSessionExpired: () => void
}
export function LoadError({
  status,
  retry,
}: {
  status: ProspectingFailure
  retry: () => void
}) {
  return (
    <Notification tone="error">
      {PROSPECTING_ERRORS[status]} <Button onClick={retry}>Réessayer</Button>
    </Notification>
  )
}
export function Pagination({
  offset,
  count,
  setOffset,
}: {
  offset: number
  count: number
  setOffset: (offset: number) => void
}) {
  return (
    <nav className="prospecting-actions" aria-label="Pagination">
      <Button
        disabled={offset === 0}
        onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
      >
        Précédent
      </Button>
      <span>Page {offset / PAGE_SIZE + 1}</span>
      <Button
        disabled={count < PAGE_SIZE}
        onClick={() => setOffset(offset + PAGE_SIZE)}
      >
        Suivant
      </Button>
    </nav>
  )
}
