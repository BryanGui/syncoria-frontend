import { useEffect, useState } from 'react'
import { loadInternalContext } from '../api/internalAssistant'
import { ChatRequestError } from '../api/operatorChat'
import { Button, Notification } from '../components/ui'
import { RealOperatorChat } from './RealOperatorChat'

export function OperatorChat({
  apiBaseUrl,
  onSessionExpired,
}: {
  apiBaseUrl: string | null
  onSessionExpired: () => void
}) {
  const [context, setContext] = useState<{ tenant_id: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setContext(null)
    setError(null)
    void loadInternalContext(apiBaseUrl, controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setContext(next)
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        if (reason instanceof ChatRequestError && reason.status === 401) {
          onSessionExpired()
          return
        }
        setError(
          reason instanceof ChatRequestError && reason.status === 503
            ? 'L’espace interne est indisponible ou archivé. Aucun espace client ne peut le remplacer.'
            : 'Impossible d’ouvrir l’Assistant interne. Réessayez.',
        )
      })
    return () => controller.abort()
  }, [apiBaseUrl, onSessionExpired, revision])
  return (
    <section className="cp-panel cp-chat">
      {error ? (
        <Notification tone="error">
          {error}{' '}
          <Button onClick={() => setRevision((value) => value + 1)}>Réessayer</Button>
        </Notification>
      ) : context ? (
        <RealOperatorChat
          key={`${apiBaseUrl}:internal:${context.tenant_id}`}
          tenantId={context.tenant_id}
          scope="internal"
          apiBaseUrl={apiBaseUrl}
          onSessionExpired={onSessionExpired}
        />
      ) : (
        <p role="status">Ouverture de l’espace interne…</p>
      )}
    </section>
  )
}
