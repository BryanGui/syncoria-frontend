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
  visibleActions,
}: Props) {
  return (
    <section className="cp-panel cp-chat">
      <p className="cp-eyebrow">INTERFACE CONVERSATIONNELLE OPÉRATEUR</p>
      <h2>Comprendre avant d’agir</h2>
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
      {selected && (
        <div className="cp-chat-context">
          <strong>
            {selected.name} · {selected.provenance}
          </strong>
          <p>{selected.reason}</p>
          <p>
            Contexte tenant fixé · {visibleActions.length} actions visibles.
          </p>
        </div>
      )}
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
              La connexion sécurisée au runtime existant nécessite un ticket
              dédié. Aucun message n’est envoyé et aucune action technique n’est
              exécutée.
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
      <details>
        <summary>Contrat de raccordement</summary>
        <p>
          Session opérateur vérifiée côté backend, tenant autorisé et fixé côté
          serveur, contexte minimal, provenance, policies, approvals,
          correlation_id et traces sanitisées. Les IDs demo sont interdits sur
          le runtime réel.
        </p>
      </details>
    </section>
  )
}
