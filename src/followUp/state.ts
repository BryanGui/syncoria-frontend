import { useEffect, useState } from 'react'
import type { FollowUpFailure, FollowUpResult } from '../api/adminFollowUp'

export const FOLLOW_UP_ERRORS: Record<FollowUpFailure, string> = {
  unauthenticated: 'Votre session a expiré.',
  not_found: 'Cette action est introuvable ou n’est plus accessible.',
  invalid: 'Vérifiez le titre, les notes et l’échéance saisis.',
  unavailable: 'Le suivi est temporairement indisponible. Réessayez plus tard.',
  error: 'Impossible de charger ou d’enregistrer l’action. Réessayez.',
}
export function useFollowUpResource<T>(
  load: (signal: AbortSignal) => Promise<FollowUpResult<T>>,
  onSessionExpired: () => void,
) {
  const [state, setState] = useState<FollowUpResult<T> | { status: 'loading' }>({
    status: 'loading',
  })
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setState({ status: 'loading' })
    void load(controller.signal).then((result) => {
      if (controller.signal.aborted) return
      if (result.status === 'unauthenticated') onSessionExpired()
      setState(result)
    })
    return () => controller.abort()
  }, [load, onSessionExpired, revision])
  return { state, reload: () => setRevision((value) => value + 1) }
}
export function useDebouncedSearch(value: string) {
  const [search, setSearch] = useState(value)
  useEffect(() => {
    const timeout = window.setTimeout(() => setSearch(value), 250)
    return () => window.clearTimeout(timeout)
  }, [value])
  return search
}
