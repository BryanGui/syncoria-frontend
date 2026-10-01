import { STATUS_LABELS, type FleetTenant, type OperatorAction } from './model'
export function Status({ tenant }: { tenant: FleetTenant }) {
  return (
    <span className={`cp-status cp-status--${tenant.status}`}>
      {STATUS_LABELS[tenant.status]}
    </span>
  )
}
export function Actions({
  actions,
  tenants,
  openTenant,
}: {
  actions: OperatorAction[]
  tenants: FleetTenant[]
  openTenant: (id: string) => void
}) {
  return actions.length ? (
    <div className="cp-actions">
      {actions.map((action) => (
        <article key={action.id}>
          <div>
            <span
              className={`cp-status cp-status--${action.priority === 'critical' ? 'critical' : 'due'}`}
            >
              {action.type}
            </span>
            <h3>{action.title}</h3>
            <button
              className="cp-text-button"
              onClick={() => openTenant(action.tenantId)}
            >
              {tenants.find((t) => t.id === action.tenantId)?.name}
            </button>
            <p>
              {action.owner} · Échéance{' '}
              {new Date(action.dueAt).toLocaleDateString('fr-FR', {
                timeZone: 'Europe/Paris',
              })}
            </p>
          </div>
          <span>
            {action.status === 'in_progress'
              ? 'En cours'
              : action.status === 'awaiting_approval'
                ? 'Validation attendue'
                : 'Ouverte'}
          </span>
          <details>
            <summary>Détails de l’action</summary>
            <p>{action.notes}</p>
            <p>
              Source : {action.source} · {action.provenance}
            </p>
          </details>
        </article>
      ))}
    </div>
  ) : (
    <p className="cp-empty">
      Aucune action connectée. Les actions réelles seront disponibles après
      raccordement du control plane.
    </p>
  )
}
