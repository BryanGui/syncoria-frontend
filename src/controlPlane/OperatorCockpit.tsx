import { useEffect, useState } from 'react'
import { fetchAdminTenants } from '../api/adminTenants'
import { DEMO_ACTIONS, DEMO_OBSERVED_AT, DEMO_TENANTS } from './fixtures'
import {
  prioritizeTenants,
  selectTenantActions,
  STATUS_LABELS,
  summarizeFleet,
  type FleetTenant,
} from './model'
import './cockpit.css'
import { Actions, Status } from './presentation'
import { TenantControlPlaneSheet } from './TenantControlPlaneSheet'
import { OperatorChat } from './OperatorChat'
import { FleetOverview } from './FleetOverview'
import { Prospecting } from '../prospecting/Prospecting'
import { FollowUp } from '../followUp/FollowUp'

type View =
  | 'prospecting'
  | 'follow-up'
  | 'overview'
  | 'clients'
  | 'actions'
  | 'history'
  | 'chat'
  | 'memory'
interface Props {
  apiBaseUrl: string | null
  onSessionExpired: () => void
  onLegacy: () => void
  onLogout: () => Promise<boolean>
  onShowPublic: () => void
}
const navigation: [View, string, string][] = [
  ['overview', 'Vue globale', '◫'],
  ['clients', 'Clients', '◎'],
  ['prospecting', 'Prospection', '⌕'],
  ['follow-up', 'Suivi', '◷'],
  ['actions', 'Alertes & actions', '⚑'],
  ['history', 'Historique', '↺'],
  ['chat', 'Assistant Syncoria', '◇'],
  ['memory', 'Mémoire opérationnelle', '▤'],
]

export function OperatorCockpit({
  apiBaseUrl,
  onSessionExpired,
  onLegacy,
  onLogout,
  onShowPublic,
}: Props) {
  const [mode, setMode] = useState<'live' | 'demo'>('live')
  const [view, setView] = useState<View>('overview')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [prospectingCompanyId, setProspectingCompanyId] = useState<string | null>(null)
  const [registry, setRegistry] = useState<FleetTenant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [logoutError, setLogoutError] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(false)
    void fetchAdminTenants(apiBaseUrl, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      setLoading(false)
      if (result.status === 'unauthenticated') {
        onSessionExpired()
        return
      }
      if (result.status === 'error') {
        setError(true)
        setRegistry([])
        return
      }
      setRegistry(
        result.tenants.map((t) => ({
          id: t.id,
          name: t.name,
          lifecycle: t.status,
          status: 'unknown',
          provenance: 'syncoria',
          reason: 'Signaux IA non connectés',
          referent: null,
          providers: [],
          users: null,
          adoption: null,
          costEur: null,
          agents: [],
          history: [],
        })),
      )
    })
    return () => controller.abort()
  }, [apiBaseUrl, onSessionExpired, reload])
  const tenants = mode === 'demo' ? DEMO_TENANTS : registry
  const actions = mode === 'demo' ? DEMO_ACTIONS : []
  const selected = tenants.find((t) => t.id === selectedId)
  const summary = summarizeFleet(tenants, actions)
  const openTenant = (id: string) => {
    setSelectedId(id)
    setView('clients')
  }
  const changeView = (next: View) => {
    setView(next)
    setProspectingCompanyId(null)
    if (next !== 'chat') setSelectedId(null)
  }
  const filtered = prioritizeTenants(tenants).filter(
    (t) =>
      t.name.toLocaleLowerCase('fr').includes(query.toLocaleLowerCase('fr')) &&
      (statusFilter === 'all' || t.status === statusFilter),
  )
  const visibleActions = selected
    ? selectTenantActions(actions, selected.id)
    : actions
  const title = navigation.find(([key]) => key === view)?.[1].toLocaleUpperCase('fr-FR')
  return (
    <div className="cp-shell">
      <aside className="cp-sidebar">
        <a
          className="cp-brand"
          href="#"
          onClick={(event) => {
            event.preventDefault()
            changeView('overview')
          }}
        >
          <span>S</span> Syncoria
        </a>
        <p className="cp-sidebar-caption">AI CONTROL PLANE</p>
        <nav aria-label="Navigation opérateur">
          {navigation.map(([key, label, icon]) => (
            <button
              key={key}
              aria-current={view === key ? 'page' : undefined}
              onClick={() => changeView(key)}
            >
              <span aria-hidden="true">{icon}</span>
              {label}
            </button>
          ))}
        </nav>
        <div className="cp-sidebar-bottom">
          <p>Operator Syncoria</p>
          <small>Supervision multi-clients</small>
          <button onClick={onLegacy}>Outils existants · legacy</button>
          <button onClick={onShowPublic}>Site public</button>
        </div>
      </aside>
      <main className="cp-main">
        <header className="cp-topbar">
          <h1>{title}</h1>
          <button
            disabled={loggingOut}
            onClick={async () => {
              setLoggingOut(true)
              setLogoutError(!(await onLogout()))
              setLoggingOut(false)
            }}
          >
            {loggingOut ? 'Déconnexion…' : 'Se déconnecter'}
          </button>
        </header>
        {logoutError && <p role="alert">Déconnexion impossible. Réessayez.</p>}
        {view !== 'prospecting' && view !== 'follow-up' && view !== 'chat' && (
          <div className="cp-view-controls">
            <div
              className="cp-mode"
              role="group"
              aria-label="Source des données"
            >
              <button
                aria-pressed={mode === 'live'}
                onClick={() => {
                  setMode('live')
                  setSelectedId(null)
                }}
              >
                Registre réel
              </button>
              <button
                aria-pressed={mode === 'demo'}
                onClick={() => {
                  setMode('demo')
                  setSelectedId(null)
                }}
              >
                Démo synthétique
              </button>
            </div>
          </div>
        )}
        {view !== 'prospecting' && view !== 'follow-up' && view !== 'chat' && (
          mode === 'demo' ? (
            <p className="cp-data-note cp-data-note--demo">
              <strong>synthetic/demo</strong> · 50 entreprises fictives · scénario au{' '}
              {new Date(DEMO_OBSERVED_AT).toLocaleDateString('fr-FR')} · aucune action exécutée.
            </p>
          ) : (view === 'overview' || view === 'clients') && (
            <p className="cp-data-note">
              {selected
                ? 'Dossier conseil opérateur · signaux IA non collectés : non évalués.'
                : 'Registre Syncoria · santé IA, coûts, adoption et alertes non évalués.'}
            </p>
          )
        )}
        {view === 'prospecting' ? (
          <Prospecting
            key={`${apiBaseUrl}:${prospectingCompanyId ?? 'list'}`}
            apiBaseUrl={apiBaseUrl}
            onSessionExpired={onSessionExpired}
            initialCompanyId={prospectingCompanyId}
          />
        ) : view === 'follow-up' ? (
          <FollowUp
            apiBaseUrl={apiBaseUrl}
            onSessionExpired={onSessionExpired}
            openCompany={(id) => {
              setProspectingCompanyId(id)
              setView('prospecting')
            }}
          />
        ) : view === 'chat' ? (
          <OperatorChat apiBaseUrl={apiBaseUrl} onSessionExpired={onSessionExpired} />
        ) : mode === 'live' && loading ? (
          <p role="status" className="cp-empty">
            Chargement du registre…
          </p>
        ) : mode === 'live' && error ? (
          <div role="alert" className="cp-empty">
            Registre indisponible. Aucune donnée de démonstration substituée.
            <button onClick={() => setReload((r) => r + 1)}>Réessayer</button>
          </div>
        ) : (
          <>
            {view === 'overview' && (
              <FleetOverview
                tenants={tenants}
                summary={summary}
                mode={mode}
                changeView={changeView}
                openTenant={openTenant}
              />
            )}
            {view === 'clients' && !selected && (
              <section className="cp-panel">
                <div className="cp-panel-heading">
                  <span>{tenants.length} clients</span>
                  <div className="cp-filters">
                    <label>
                      Rechercher
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Nom du client"
                      />
                    </label>
                    <label>
                      État
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                      >
                        <option value="all">Tous les états</option>
                        {Object.entries(STATUS_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
                {filtered.map((t) => (
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
                      <small>
                        {t.reason} ·{' '}
                        {t.lifecycle === 'archived' ? 'Archivé' : 'Actif'}
                      </small>
                    </span>
                    <Status tenant={t} />
                  </button>
                ))}
                {!filtered.length && (
                  <p className="cp-empty">Aucun client pour cette sélection.</p>
                )}
              </section>
            )}
            {view === 'clients' && selected && (
              <TenantControlPlaneSheet
                apiBaseUrl={apiBaseUrl}
                onSessionExpired={onSessionExpired}
                selected={selected}
                mode={mode}
                visibleActions={visibleActions}
                tenants={tenants}
                openTenant={openTenant}
                onBack={() => setSelectedId(null)}
                onChat={() => setView('chat')}
              />
            )}
            {view === 'actions' && (
              <section className="cp-panel">
                {mode === 'demo' && <p className="cp-data-note">Exemples en lecture seule.</p>}
                <Actions
                  actions={actions}
                  tenants={tenants}
                  openTenant={openTenant}
                />
              </section>
            )}
            {view === 'history' && (
              <section className="cp-panel">
                {tenants.flatMap((t) =>
                  t.history.map((h, i) => (
                    <article className="cp-history" key={`${t.id}:${i}`}>
                      <time>{h.date}</time>
                      <div>
                        <button
                          className="cp-text-button"
                          onClick={() => openTenant(t.id)}
                        >
                          {t.name}
                        </button>
                        <p>{h.title}</p>
                      </div>
                    </article>
                  )),
                )}
                {mode === 'live' && (
                  <p className="cp-empty">
                    Aucun historique opérationnel connecté.
                  </p>
                )}
              </section>
            )}
            {view === 'memory' && (
              <div className="cp-columns">
                <section className="cp-panel">
                  <p className="cp-eyebrow">GLOBAL</p>
                  <h2>Méthodes Syncoria</h2>
                  <p>
                    Standards, templates de revue, checklists de gouvernance et
                    supports de formation.
                  </p>
                  <p>
                    Bibliothèque opérationnelle à raccorder. Aucun document
                    synthétique présenté comme réel.
                  </p>
                </section>
                <section className="cp-panel">
                  <p className="cp-eyebrow">TENANT</p>
                  <h2>La mémoire de chaque client</h2>
                  <p>
                    Décisions, architecture, runbooks et notes d’intervention.
                    Références vers SharePoint, Drive ou Notion.
                  </p>
                  <button onClick={() => changeView('clients')}>
                    Ouvrir un dossier client →
                  </button>
                </section>
              </div>
            )}
          </>
        )}
        <footer className="cp-footer">
          Syncoria V2 · cockpit opérateur multi-clients{' '}
          <span>
            Superset : analytics interne disponible dans les outils existants.
          </span>
        </footer>
      </main>
    </div>
  )
}
