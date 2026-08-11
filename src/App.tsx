import {
  useCallback,
  useEffect,
  useReducer,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import './App.css'
import {
  createAdminSession,
  deleteAdminSession,
  fetchAdminSession,
} from './api/adminSession'
import {
  createClientSession,
  deleteClientSession,
  fetchCurrentClientUser,
  type CurrentClientUser,
} from './api/clientSession'
import {
  fetchHealthStatus,
  INITIAL_HEALTH_STATUS,
  normalizeApiBaseUrl,
  type HealthEndpoint,
  type HealthStatus,
} from './api/health'
import {
  dashboardNavigationReducer,
  INITIAL_DASHBOARD_NAVIGATION_STATE,
  type DashboardPage,
} from './navigation/dashboardNavigation'
import { selectLoginMode, type LoginMode } from './auth/loginMode'
import { AdminTenantWorkspacePage } from './pages/AdminTenantWorkspacePage'
import { ClientWorkspacePage } from './pages/ClientWorkspacePage'
import { ClientsPage } from './pages/ClientsPage'

const apiBaseUrl = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL)

type IconName =
  | 'overview'
  | 'clients'
  | 'data'
  | 'sync'
  | 'process'
  | 'server'
  | 'database'
  | 'activity'
  | 'check'

interface IconProps {
  name: IconName
  size?: number
}

function Icon({ name, size = 20 }: IconProps) {
  const paths: Record<IconName, ReactNode> = {
    overview: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    clients: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    data: (
      <>
        <ellipse cx="12" cy="5" rx="8" ry="3" />
        <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
        <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
      </>
    ),
    sync: (
      <>
        <path d="M20 7h-5V2" />
        <path d="M20 7a8 8 0 0 0-14.7-2.7L4 6" />
        <path d="M4 17h5v5" />
        <path d="M4 17a8 8 0 0 0 14.7 2.7L20 18" />
      </>
    ),
    process: (
      <>
        <circle cx="5" cy="6" r="2" />
        <circle cx="19" cy="6" r="2" />
        <circle cx="12" cy="18" r="2" />
        <path d="M7 6h10M6 8l5 8M18 8l-5 8" />
      </>
    ),
    server: (
      <>
        <rect x="3" y="4" width="18" height="6" rx="2" />
        <rect x="3" y="14" width="18" height="6" rx="2" />
        <path d="M7 7h.01M7 17h.01" />
      </>
    ),
    database: (
      <>
        <ellipse cx="12" cy="5" rx="8" ry="3" />
        <path d="M4 5v7c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
        <path d="M4 12v7c0 1.66 3.58 3 8 3s8-1.34 8-3v-7" />
      </>
    ),
    activity: (
      <>
        <path d="M3 12h4l2.5-7 5 14 2.5-7h4" />
      </>
    ),
    check: (
      <>
        <path d="m5 12 4 4L19 6" />
      </>
    ),
  }

  return (
    <svg
      aria-hidden="true"
      className="icon"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75">
        {paths[name]}
      </g>
    </svg>
  )
}

const navigation: Array<{
  icon: IconName
  label: string
  page?: Exclude<DashboardPage, 'tenant_workspace'>
}> = [
  { icon: 'overview', label: 'Vue d’ensemble', page: 'overview' },
  { icon: 'clients', label: 'Clients', page: 'clients' },
  { icon: 'data', label: 'Données' },
  { icon: 'sync', label: 'Synchronisations' },
  { icon: 'process', label: 'Processus' },
]

interface StatusCardProps {
  icon: IconName
  label: string
  status: string
  detail: string
  tone?: 'error' | 'loading' | 'success'
}

function StatusCard({
  icon,
  label,
  status,
  detail,
  tone = 'success',
}: StatusCardProps) {
  return (
    <article className="status-card">
      <div className="status-card__topline">
        <span className="status-card__icon">
          <Icon name={icon} size={21} />
        </span>
        <span className={`status-pill status-pill--${tone}`}>
          <span className="status-pill__dot" />
          {status}
        </span>
      </div>
      <div>
        <h2>{label}</h2>
        <p>{detail}</p>
      </div>
    </article>
  )
}

interface HealthStatusCardProps {
  endpoint: HealthEndpoint
  icon: IconName
  label: string
  operationalDetail: string
  operationalStatus: string
  unavailableDetail: string
}

function useHealthStatus(endpoint: HealthEndpoint): HealthStatus {
  const [healthStatus, setHealthStatus] = useState<HealthStatus>(
    INITIAL_HEALTH_STATUS,
  )

  useEffect(() => {
    const abortController = new AbortController()
    let isActive = true

    setHealthStatus(INITIAL_HEALTH_STATUS)
    void fetchHealthStatus(apiBaseUrl, endpoint, abortController.signal).then(
      (loadedStatus) => {
        if (isActive) {
          setHealthStatus(loadedStatus)
        }
      },
    )

    return () => {
      isActive = false
      abortController.abort()
    }
  }, [endpoint])

  return healthStatus
}

function HealthStatusCard({
  endpoint,
  icon,
  label,
  operationalDetail,
  operationalStatus,
  unavailableDetail,
}: HealthStatusCardProps) {
  const healthStatus = useHealthStatus(endpoint)

  if (healthStatus === 'loading') {
    return (
      <StatusCard
        detail="Vérification en cours…"
        icon={icon}
        label={label}
        status="Chargement"
        tone="loading"
      />
    )
  }

  if (healthStatus === 'unavailable') {
    return (
      <StatusCard
        detail={unavailableDetail}
        icon={icon}
        label={label}
        status="Indisponible"
        tone="error"
      />
    )
  }

  return (
    <StatusCard
      detail={operationalDetail}
      icon={icon}
      label={label}
      status={operationalStatus}
    />
  )
}

interface ActivityItemProps {
  title: string
  description: string
  time: string
}

function ActivityItem({ title, description, time }: ActivityItemProps) {
  return (
    <li className="activity-item">
      <span className="activity-item__icon">
        <Icon name="check" size={17} />
      </span>
      <div className="activity-item__content">
        <p className="activity-item__title">{title}</p>
        <p>{description}</p>
      </div>
      <time>{time}</time>
    </li>
  )
}

interface LoginPageProps {
  initialError?: string
  onAuthenticated: () => void
  onRetrySession: () => void
  onSwitchMode: () => void
}

function AdminLoginPage({
  initialError,
  onAuthenticated,
  onRetrySession,
  onSwitchMode,
}: LoginPageProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState(initialError)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setErrorMessage(undefined)

    const result = await createAdminSession(apiBaseUrl, username, password)
    setPassword('')
    setIsSubmitting(false)

    if (result === 'authenticated') {
      onAuthenticated()
      return
    }
    setErrorMessage(
      result === 'rejected'
        ? 'Identifiant ou mot de passe incorrect.'
        : 'Le service d’authentification est indisponible.',
    )
  }

  return (
    <main className="login-page">
      <section aria-labelledby="login-title" className="login-panel">
        <div className="login-brand">
          <span className="brand__mark" aria-hidden="true">S</span>
          <span>Syncoria</span>
        </div>
        <p className="eyebrow">Administration</p>
        <h1 id="login-title">Connexion</h1>
        <p className="login-panel__description">
          Identifiez-vous pour accéder au dashboard administrateur.
        </p>

        <form className="login-form" onSubmit={handleSubmit}>
          <label htmlFor="admin-username">Identifiant</label>
          <input
            autoComplete="username"
            id="admin-username"
            maxLength={128}
            name="username"
            onChange={(event) => setUsername(event.target.value)}
            required
            type="text"
            value={username}
          />

          <label htmlFor="admin-password">Mot de passe</label>
          <input
            autoComplete="current-password"
            id="admin-password"
            maxLength={1024}
            name="password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />

          {errorMessage && (
            <div aria-live="polite" className="login-error" role="alert">
              <span>{errorMessage}</span>
              {initialError && (
                <button onClick={onRetrySession} type="button">
                  Réessayer
                </button>
              )}
            </div>
          )}

          <button className="primary-button" disabled={isSubmitting} type="submit">
            {isSubmitting ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>
        <button className="login-mode-button" onClick={onSwitchMode} type="button">
          Accéder à la connexion client
        </button>
      </section>
    </main>
  )
}

function ClientLoginPage({
  initialError,
  onAuthenticated,
  onRetrySession,
  onSwitchMode,
}: LoginPageProps) {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState(initialError)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setErrorMessage(undefined)
    const result = await createClientSession(apiBaseUrl, login, password)
    setPassword('')
    setIsSubmitting(false)

    if (result === 'authenticated') {
      onAuthenticated()
      return
    }
    setErrorMessage(
      result === 'rejected'
        ? 'Identifiant ou mot de passe incorrect.'
        : 'Le service d’authentification est indisponible.',
    )
  }

  return (
    <main className="login-page">
      <section aria-labelledby="client-login-title" className="login-panel">
        <div className="login-brand">
          <span className="brand__mark" aria-hidden="true">S</span>
          <span>Syncoria</span>
        </div>
        <p className="eyebrow">Espace client</p>
        <h1 id="client-login-title">Connexion</h1>
        <p className="login-panel__description">
          Identifiez-vous pour accéder à l’espace de votre organisation.
        </p>

        <form className="login-form" onSubmit={handleSubmit}>
          <label htmlFor="client-login">Identifiant</label>
          <input
            autoComplete="username"
            id="client-login"
            maxLength={254}
            name="login"
            onChange={(event) => setLogin(event.target.value)}
            required
            type="text"
            value={login}
          />

          <label htmlFor="client-password">Mot de passe</label>
          <input
            autoComplete="current-password"
            id="client-password"
            maxLength={1024}
            name="password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />

          {errorMessage && (
            <div aria-live="polite" className="login-error" role="alert">
              <span>{errorMessage}</span>
              {initialError && (
                <button onClick={onRetrySession} type="button">
                  Réessayer
                </button>
              )}
            </div>
          )}

          <button className="primary-button" disabled={isSubmitting} type="submit">
            {isSubmitting ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>
        <button className="login-mode-button" onClick={onSwitchMode} type="button">
          Accéder à l’administration Syncoria
        </button>
      </section>
    </main>
  )
}

interface DashboardProps {
  onLogout: () => Promise<boolean>
  onSessionExpired: () => void
}

function Dashboard({ onLogout, onSessionExpired }: DashboardProps) {
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState(false)
  const [navigationState, dispatchNavigation] = useReducer(
    dashboardNavigationReducer,
    INITIAL_DASHBOARD_NAVIGATION_STATE,
  )
  const isOverview = navigationState.activePage === 'overview'
  const isClients = navigationState.activePage === 'clients'

  async function handleLogout() {
    setIsLoggingOut(true)
    setLogoutError(false)
    const wasLoggedOut = await onLogout()
    if (wasLoggedOut) {
      return
    }
    setIsLoggingOut(false)
    setLogoutError(true)
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">S</span>
          <span>Syncoria</span>
        </div>

        <nav aria-label="Navigation principale" className="navigation">
          <p className="navigation__label">Administration</p>
          <ul>
            {navigation.map((item) => (
              <li key={item.label}>
                {item.page ? (
                  <button
                    aria-current={(navigationState.activePage === item.page
                      || (item.page === 'clients'
                        && navigationState.activePage === 'tenant_workspace'))
                      ? 'page'
                      : undefined}
                    className={(navigationState.activePage === item.page
                      || (item.page === 'clients'
                        && navigationState.activePage === 'tenant_workspace'))
                      ? 'navigation__link navigation__link--active'
                      : 'navigation__link'}
                    onClick={() => dispatchNavigation({
                      type: 'open_page',
                      page: item.page as Exclude<DashboardPage, 'tenant_workspace'>,
                    })}
                    type="button"
                  >
                    <Icon name={item.icon} />
                    <span>{item.label}</span>
                  </button>
                ) : (
                  <a
                    className="navigation__link"
                    href={`#${item.label.toLowerCase()}`}
                  >
                    <Icon name={item.icon} />
                    <span>{item.label}</span>
                  </a>
                )}
              </li>
            ))}
          </ul>
        </nav>

        <div className="sidebar__footer">
          <span className="sidebar__status" aria-hidden="true" />
          <div>
            <p>Environnement</p>
            <strong>Démonstration</strong>
          </div>
        </div>
      </aside>

      <main className="main-content" id={navigationState.activePage}>
        <header className="page-header">
          <div>
            <p className="eyebrow">Administration</p>
            <h1>{isOverview
              ? 'Vue d’ensemble'
              : isClients
                ? 'Clients'
                : 'Espace tenant'}</h1>
            <p className="page-header__description">
              {isOverview
                ? 'Consultez l’état général des services et les dernières opérations.'
                : isClients
                  ? 'Consultez les tenants enregistrés dans Syncoria.'
                  : 'Consultez les informations et sections du tenant sélectionné.'}
            </p>
          </div>
          <div className="page-header__actions">
            <div className="context-badge">
              <span>Espace</span>
              <strong>Démonstration</strong>
            </div>
            <button
              className="secondary-button"
              disabled={isLoggingOut}
              onClick={handleLogout}
              type="button"
            >
              {isLoggingOut ? 'Déconnexion…' : 'Se déconnecter'}
            </button>
            {logoutError && (
              <p aria-live="polite" className="logout-error" role="alert">
                Déconnexion impossible. Réessayez.
              </p>
            )}
          </div>
        </header>

        {isOverview ? (
          <>
          <section aria-labelledby="systems-title" className="systems-section">
          <div className="section-heading">
            <div>
              <h2 id="systems-title">État du système</h2>
              <p>Disponibilité des services</p>
            </div>
            <span className="updated-label">Mis à jour à l’instant</span>
          </div>

          <div className="status-grid">
            <HealthStatusCard
              endpoint="/health"
              icon="server"
              label="Backend"
              operationalDetail="Le service répond normalement."
              operationalStatus="Opérationnel"
              unavailableDetail="Le service ne répond pas."
            />
            <HealthStatusCard
              endpoint="/health/db"
              icon="database"
              label="Base de données"
              operationalDetail="La connexion est disponible."
              operationalStatus="Opérationnelle"
              unavailableDetail="La connexion est indisponible."
            />
            <StatusCard
              detail="Aucune opération en attente."
              icon="sync"
              label="Synchronisations"
              status="À jour"
            />
          </div>
          </section>

          <section aria-labelledby="activity-title" className="activity-panel">
          <div className="activity-panel__header">
            <div className="activity-panel__heading">
              <span className="activity-panel__heading-icon">
                <Icon name="activity" size={20} />
              </span>
              <div>
                <h2 id="activity-title">Activité récente</h2>
                <p>Dernières opérations enregistrées</p>
              </div>
            </div>
            <span className="activity-panel__count">3 événements</span>
          </div>

          <ul className="activity-list">
            <ActivityItem
              description="Les données de démonstration ont été traitées."
              time="Il y a 8 min"
              title="Synchronisation terminée"
            />
            <ActivityItem
              description="Le contrôle planifié s’est terminé sans anomalie."
              time="Il y a 24 min"
              title="Vérification des données réussie"
            />
            <ActivityItem
              description="L’espace de travail est prêt à être utilisé."
              time="Aujourd’hui, 09:12"
              title="Environnement initialisé"
            />
          </ul>
          </section>
          </>
        ) : isClients ? (
          <ClientsPage
            apiBaseUrl={apiBaseUrl}
            onOpenTenant={(tenantId) => dispatchNavigation({
              type: 'open_tenant',
              tenantId,
            })}
            onSessionExpired={onSessionExpired}
          />
        ) : navigationState.selectedTenantId !== null ? (
          <AdminTenantWorkspacePage
            apiBaseUrl={apiBaseUrl}
            onBack={() => dispatchNavigation({
              type: 'open_page',
              page: 'clients',
            })}
            onSessionExpired={onSessionExpired}
            tenantId={navigationState.selectedTenantId}
          />
        ) : null}
      </main>
    </div>
  )
}

type ApplicationSessionState =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'error' }
  | { status: 'admin_authenticated' }
  | { status: 'client_authenticated'; currentUser: CurrentClientUser }


function App() {
  const [sessionState, setSessionState] = useState<ApplicationSessionState>({
    status: 'loading',
  })
  const [loginMode, setLoginMode] = useState<LoginMode>('client')

  function loadSessions() {
    setSessionState({ status: 'loading' })
    const abortController = new AbortController()
    void fetchCurrentClientUser(apiBaseUrl, abortController.signal).then(
      async (clientResult) => {
        if (abortController.signal.aborted) return
        if (clientResult.status === 'loaded') {
          setSessionState({
            status: 'client_authenticated',
            currentUser: clientResult.currentUser,
          })
          return
        }

        const adminResult = await fetchAdminSession(
          apiBaseUrl,
          abortController.signal,
        )
        if (abortController.signal.aborted) return
        if (adminResult === 'authenticated') {
          setSessionState({ status: 'admin_authenticated' })
          return
        }
        setSessionState({
          status: clientResult.status === 'error' || adminResult === 'error'
            ? 'error'
            : 'unauthenticated',
        })
      },
    )
    return abortController
  }

  function loadClientSession() {
    setSessionState({ status: 'loading' })
    const abortController = new AbortController()
    void fetchCurrentClientUser(apiBaseUrl, abortController.signal).then((result) => {
      if (abortController.signal.aborted) return
      if (result.status === 'loaded') {
        setSessionState({
          status: 'client_authenticated',
          currentUser: result.currentUser,
        })
        return
      }
      setSessionState({ status: result.status === 'error' ? 'error' : 'unauthenticated' })
    })
    return abortController
  }

  function loadAdminSession() {
    setSessionState({ status: 'loading' })
    const abortController = new AbortController()
    void fetchAdminSession(apiBaseUrl, abortController.signal).then((result) => {
      if (abortController.signal.aborted) return
      setSessionState({
        status: result === 'authenticated'
          ? 'admin_authenticated'
          : result === 'error'
            ? 'error'
            : 'unauthenticated',
      })
    })
    return abortController
  }

  useEffect(() => {
    const abortController = loadSessions()
    return () => abortController.abort()
  }, [])

  async function handleLogout() {
    const wasLoggedOut = await deleteAdminSession(apiBaseUrl)
    if (wasLoggedOut) {
      setLoginMode(selectLoginMode('admin'))
      setSessionState({ status: 'unauthenticated' })
    }
    return wasLoggedOut
  }

  async function handleClientLogout() {
    const wasLoggedOut = await deleteClientSession(apiBaseUrl)
    if (wasLoggedOut) {
      setLoginMode(selectLoginMode('client'))
      setSessionState({ status: 'unauthenticated' })
    }
    return wasLoggedOut
  }

  const handleSessionExpired = useCallback(() => {
    setLoginMode(selectLoginMode('admin'))
    setSessionState({ status: 'unauthenticated' })
  }, [])

  if (sessionState.status === 'loading') {
    return (
      <main aria-live="polite" className="session-loading">
        <span className="session-loading__indicator" aria-hidden="true" />
        <p>Vérification de la session…</p>
      </main>
    )
  }

  if (sessionState.status === 'client_authenticated') {
    return (
      <ClientWorkspacePage
        currentUser={sessionState.currentUser}
        onLogout={handleClientLogout}
      />
    )
  }

  if (sessionState.status !== 'admin_authenticated') {
    if (loginMode === 'client') {
      return (
        <ClientLoginPage
          initialError={sessionState.status === 'error'
            ? 'Impossible de vérifier la session client.'
            : undefined}
          onAuthenticated={loadClientSession}
          onRetrySession={loadClientSession}
          onSwitchMode={() => setLoginMode(selectLoginMode('admin'))}
        />
      )
    }
    return (
      <AdminLoginPage
        initialError={sessionState.status === 'error'
          ? 'Impossible de vérifier la session administrateur.'
          : undefined}
        onAuthenticated={() => setSessionState({ status: 'admin_authenticated' })}
        onRetrySession={loadAdminSession}
        onSwitchMode={() => setLoginMode(selectLoginMode('client'))}
      />
    )
  }

  return (
    <Dashboard
      onLogout={handleLogout}
      onSessionExpired={handleSessionExpired}
    />
  )
}

export default App
