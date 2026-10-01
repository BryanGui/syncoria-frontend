import { formatCostEur } from './model'
import type { FleetTenant, OperatorAction } from './model'
import { Actions, Status } from './presentation'
interface Props {
  selected: FleetTenant
  mode: 'live' | 'demo'
  visibleActions: OperatorAction[]
  tenants: FleetTenant[]
  openTenant: (id: string) => void
  onBack: () => void
  onChat: () => void
}
export function TenantControlPlaneSheet({
  selected,
  mode,
  visibleActions,
  tenants,
  openTenant,
  onBack,
  onChat,
}: Props) {
  return (
    <>
      <div className="cp-detail-toolbar">
        <button onClick={onBack}>← Parc clients</button>
        <Status tenant={selected} />
        <button onClick={onChat}>Explorer avec le chat →</button>
      </div>
      <div className="cp-columns">
        <section className="cp-panel">
          <h2>Dossier opérationnel</h2>
          <dl className="cp-facts">
            <dt>Référent IA</dt>
            <dd>{selected.referent ?? 'Non renseigné'}</dd>
            <dt>Providers IA</dt>
            <dd>{selected.providers.join(' · ') || 'Non connectés'}</dd>
            <dt>Utilisateurs</dt>
            <dd>{selected.users ?? 'Non connecté'}</dd>
            <dt>Adoption</dt>
            <dd>
              {selected.adoption === null
                ? 'Non connectée'
                : `${selected.adoption} % d’utilisateurs actifs`}
            </dd>
            <dt>Coût mensuel</dt>
            <dd>{formatCostEur(selected.costEur)}</dd>
          </dl>
        </section>
        <section className="cp-panel">
          <h2>Gouvernance & alertes</h2>
          <p>{selected.reason}</p>
          <p>
            {mode === 'demo'
              ? '3 licences inutilisées · 22 OpenAI, 8 Claude, 5 utilisateurs sur les deux. Ces populations se recouvrent et ne couvrent pas nécessairement tous les utilisateurs.'
              : 'Les permissions, licences et signaux provider ne sont pas encore collectés.'}
          </p>
          <p>
            AI Governance Audit : raccordement à venir. Le moteur d’audit
            existant reste disponible dans les outils legacy.
          </p>
        </section>
      </div>
      <section className="cp-panel">
        <h2>Actions ouvertes</h2>
        <Actions
          actions={visibleActions}
          tenants={tenants}
          openTenant={openTenant}
        />
      </section>
      <section className="cp-panel">
        <h2>Agents & automatisations</h2>
        {selected.agents.map((agent) => (
          <article className="cp-agent" key={agent.name}>
            <div>
              <h3>{agent.name}</h3>
              <p>
                {agent.provider} · {agent.tools} · {agent.trigger}
              </p>
            </div>
            <span>{agent.status}</span>
          </article>
        ))}
        {!selected.agents.length && (
          <p>Inventaire non connecté. Modèle indépendant du fournisseur.</p>
        )}
      </section>
      <section className="cp-panel">
        <h2>Contexte du client</h2>
        {[
          [
            'Intégrations',
            'MCP Syncoria et Provider Gateway réutilisés ; connexions réelles dans les outils existants.',
          ],
          [
            'Formations & historique',
            selected.history.map((h) => `${h.date} — ${h.title}`).join(' · ') ||
              'Historique non connecté.',
          ],
          [
            'Documentation & décisions',
            'Mémoire TENANT : runbooks, décisions et références vers les documents client. Aucune copie documentaire automatique.',
          ],
        ].map(([heading, body]) => (
          <details key={heading}>
            <summary>{heading}</summary>
            <p>{body}</p>
          </details>
        ))}
      </section>
    </>
  )
}
