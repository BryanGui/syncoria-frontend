import {
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import './App.css'
import {
  createAdminSession,
  deleteAdminSession,
  fetchAdminSession,
  type AdminSessionStatus,
} from './api/adminSession'
import {
  fetchHealthStatus,
  INITIAL_HEALTH_STATUS,
  normalizeApiBaseUrl,
  type HealthEndpoint,
  type HealthStatus,
} from './api/health'

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

const navigation: Array<{ icon: IconName; label: string }> = [
  { icon: 'overview', label: 'Vue d’ensemble' },
  { icon: 'clients', label: 'Clients' },
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
}

function LoginPage({
  initialError,
  onAuthenticated,
  onRetrySession,
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
      </section>
    </main>
  )
}

interface DashboardProps {
  onLogout: () => Promise<boolean>
}

function Dashboard({ onLogout }: DashboardProps) {
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState(false)

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
            {navigation.map((item, index) => (
              <li key={item.label}>
                <a
                  aria-current={index === 0 ? 'page' : undefined}
                  className={index === 0 ? 'navigation__link navigation__link--active' : 'navigation__link'}
                  href={index === 0 ? '#overview' : `#${item.label.toLowerCase()}`}
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                </a>
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

      <main className="main-content" id="overview">
        <header className="page-header">
          <div>
            <p className="eyebrow">Administration</p>
            <h1>Vue d’ensemble</h1>
            <p className="page-header__description">
              Consultez l’état général des services et les dernières opérations.
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
      </main>
    </div>
  )
}

function App() {
  const [sessionStatus, setSessionStatus] = useState<
    AdminSessionStatus | 'loading'
  >('loading')

  function loadSession() {
    setSessionStatus('loading')
    const abortController = new AbortController()
    void fetchAdminSession(apiBaseUrl, abortController.signal).then(setSessionStatus)
    return abortController
  }

  useEffect(() => {
    const abortController = loadSession()
    return () => abortController.abort()
  }, [])

  async function handleLogout() {
    const wasLoggedOut = await deleteAdminSession(apiBaseUrl)
    if (wasLoggedOut) {
      setSessionStatus('unauthenticated')
    }
    return wasLoggedOut
  }

  if (sessionStatus === 'loading') {
    return (
      <main aria-live="polite" className="session-loading">
        <span className="session-loading__indicator" aria-hidden="true" />
        <p>Vérification de la session…</p>
      </main>
    )
  }

  if (sessionStatus !== 'authenticated') {
    return (
      <LoginPage
        initialError={sessionStatus === 'error'
          ? 'Impossible de vérifier la session administrateur.'
          : undefined}
        onAuthenticated={() => setSessionStatus('authenticated')}
        onRetrySession={loadSession}
      />
    )
  }

  return <Dashboard onLogout={handleLogout} />
}

export default App
