import { formatCostEur } from './model'
import { prioritizeTenants, summarizeFleet, type FleetTenant } from './model'
import { Status } from './presentation'
interface Props {
  tenants: FleetTenant[]
  summary: ReturnType<typeof summarizeFleet>
  mode: 'live' | 'demo'
  changeView: (view: 'clients' | 'actions' | 'chat') => void
  openTenant: (id: string) => void
}
export function FleetOverview({
  tenants,
  summary,
  mode,
  changeView,
  openTenant,
}: Props) {
  return (
    <>
      <section className="cp-metrics" aria-label="État du parc">
        {[
          ['Clients', summary.total, 'Entreprises dans cette vue'],
          [
            'Critiques',
            mode === 'demo' ? summary.critical : '—',
            'Intervention prioritaire',
          ],
          [
            'À surveiller',
            mode === 'demo' ? summary.watch : '—',
            'Signaux à examiner',
          ],
          [
            'Formations / revues',
            mode === 'demo' ? summary.due : '—',
            'Clients avec une échéance',
          ],
          [
            mode === 'demo' ? 'OK' : 'Non évalués',
            mode === 'demo' ? summary.healthy : summary.unknown,
            mode === 'demo'
              ? `${summary.unknown} non évalués`
              : 'Santé IA non connectée',
          ],
        ].map(([label, value, note]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{note}</small>
          </article>
        ))}
      </section>
      <div className="cp-columns">
        <section className="cp-panel">
          <div className="cp-panel-heading">
            <div>
              <h2>Clients prioritaires</h2>
            </div>
            <button onClick={() => changeView('clients')}>
              Voir le parc →
            </button>
          </div>
          {prioritizeTenants(tenants)
            .slice(0, 5)
            .map((t) => (
              <button
                className="cp-client-row"
                key={t.id}
                onClick={() => openTenant(t.id)}
              >
                <span className="cp-avatar">
                  {t.name.slice(0, 2).toUpperCase()}
                </span>
                <span>
                  <strong>{t.name}</strong>
                  <small>{t.reason}</small>
                </span>
                <Status tenant={t} />
                <span aria-hidden="true">↗</span>
              </button>
            ))}
          {!tenants.length && (
            <p className="cp-empty">Aucun client enregistré.</p>
          )}
        </section>
        <section className="cp-panel cp-summary">
          <p className="cp-eyebrow">
            {mode === 'demo'
              ? 'CE MOIS-CI · SCÉNARIO DÉMO'
              : 'COÛTS IA · NON CONNECTÉS'}
          </p>
          <h2>Coûts IA du parc</h2>
          <strong className="cp-cost">{formatCostEur(summary.costEur)}</strong>
          <p>
            {mode === 'demo'
              ? 'OpenAI + Anthropic · estimation synthétique mensuelle'
              : 'Les adapters usage / costs restent à connecter.'}
          </p>
          <hr />
          <h3>
            {mode === 'demo'
              ? `${summary.openActions} actions ouvertes`
              : 'Actions non connectées'}
          </h3>
          <p>
            {mode === 'demo'
              ? 'Incidents, recommandations et prochaines revues.'
              : 'Le registre réel ne contient pas de suivi opérationnel V2.'}
          </p>
          <button onClick={() => changeView('actions')}>
            Consulter les actions →
          </button>
        </section>
      </div>
      <button className="cp-text-button" onClick={() => changeView('chat')}>
        Assistant Syncoria →
      </button>
    </>
  )
}
