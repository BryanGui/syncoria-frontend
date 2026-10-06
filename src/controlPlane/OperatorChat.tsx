import { RealOperatorChat } from './RealOperatorChat'
import type { FleetTenant, OperatorAction } from './model'
interface Props {
  apiBaseUrl: string | null
  onSessionExpired: () => void
  mode: 'live' | 'demo'

  selectedId: string | null
  setSelectedId: (id: string | null) => void
  tenants: FleetTenant[]
  selected: FleetTenant | undefined
  visibleActions: OperatorAction[]
}
export function OperatorChat({
  apiBaseUrl,
  onSessionExpired,
  mode,
  selectedId,
  setSelectedId,
  tenants,
  selected,
}: Props) {
  return (
    <section className="cp-panel cp-chat">
      <label>
        Client actif
        <select
          value={selectedId ?? ''}
          onChange={(e) => setSelectedId(e.target.value || null)}
        >
          <option value="">Sélectionner un client</option>
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      {mode === 'live' && selected && selected.lifecycle === 'active' ? (
        <RealOperatorChat
          key={`${apiBaseUrl}:${selected.id}`}
          tenantId={selected.id}
          apiBaseUrl={apiBaseUrl}
          onSessionExpired={onSessionExpired}
        />
      ) : (
        <>
          <div className="cp-chat-unavailable">
            <span aria-hidden="true">◇</span>
            <h3>
              {mode === 'demo'
                ? 'Runtime réel indisponible sur les fixtures'
                : 'Sélectionnez un client actif'}
            </h3>
            <p>
              Choisissez un client actif pour ouvrir son workspace
              conversationnel privé. Les fixtures de démonstration n’appellent
              pas le runtime.
            </p>
          </div>
          <label>
            Message opérateur
            <textarea
              disabled
              placeholder={
                selected
                  ? `Pourquoi ${selected.name} nécessite une intervention ?`
                  : 'Choisissez un client pour définir le contexte.'
              }
              rows={3}
            />
          </label>
          <button disabled>Envoi indisponible</button>
        </>
      )}
    </section>
  )
}
