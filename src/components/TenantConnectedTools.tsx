import type { ConnectedTool } from '../tenantWorkspace/connectedTools'
import { ProviderLogo } from './ProviderLogo'

export type ConnectedToolsState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'loaded'; tools: readonly ConnectedTool[] }

interface TenantConnectedToolsProps {
  state: ConnectedToolsState
  onManageSources?: () => void
}

export function TenantConnectedTools({ state, onManageSources }: TenantConnectedToolsProps) {
  return (
    <section aria-labelledby="tenant-connected-tools-title" className="tenant-connected-tools">
      <div className="tenant-connected-tools__heading">
        <h3 id="tenant-connected-tools-title">Outils connectés</h3>
        {onManageSources ? (
          <button className="tenant-connected-tools__manage" onClick={onManageSources} type="button">Gérer les sources <span aria-hidden="true">→</span></button>
        ) : null}
      </div>
      {state.status === 'loading' ? (
        <div aria-label="Chargement des outils connectés" className="tenant-connected-tools__grid" role="status">
          <span className="tenant-connected-tools__skeleton" />
          <span className="tenant-connected-tools__skeleton" />
        </div>
      ) : state.status === 'error' ? (
        <p className="tenant-connected-tools__message" role="alert">Impossible de charger les outils connectés.</p>
      ) : state.tools.length === 0 ? (
        <p className="tenant-connected-tools__message">Aucun outil connecté pour le moment.</p>
      ) : (
        <div className="tenant-connected-tools__grid">
          {state.tools.map((tool) => (
            <article className="tenant-connected-tools__card" key={tool.id}>
              <ProviderLogo provider={tool.provider} />
              <h4>{tool.label}</h4>
              <span className={`tenant-connected-tools__status tenant-connected-tools__status--${tool.statusTone}`}>
                {tool.statusLabel}
              </span>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
