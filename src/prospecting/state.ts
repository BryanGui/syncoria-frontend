import { useEffect, useState } from 'react'
import type { ProspectingFailure, ProspectingResult } from '../api/adminProspecting'

export const PROSPECTING_ERRORS: Record<ProspectingFailure, string> = {
  unauthenticated: 'Votre session a expiré.',
  not_found:
    'Cette fiche est introuvable ou n’est plus accessible. Revenez à la liste.',
  invalid: 'Vérifiez les champs saisis, leur longueur et le format des coordonnées.',
  unavailable: 'Prospection est temporairement indisponible. Réessayez plus tard.',
  error: 'Impossible de charger ou d’enregistrer la fiche. Réessayez.',
}
export function useProspectingResource<T>(
  load: (signal: AbortSignal) => Promise<ProspectingResult<T>>,
  onSessionExpired: () => void,
) {
  const [state, setState] = useState<ProspectingResult<T> | { status: 'loading' }>({
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
  return {
    state,
    reload: () => setRevision((value) => value + 1),
    setValue: (value: T) => setState({ status: 'loaded', value }),
  }
}
