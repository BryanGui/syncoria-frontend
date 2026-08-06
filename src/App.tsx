import type { ReactNode } from 'react'
import './App.css'

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
}

function StatusCard({ icon, label, status, detail }: StatusCardProps) {
  return (
    <article className="status-card">
      <div className="status-card__topline">
        <span className="status-card__icon">
          <Icon name={icon} size={21} />
        </span>
        <span className="status-pill">
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

function App() {
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
          <div className="context-badge">
            <span>Espace</span>
            <strong>Démonstration</strong>
          </div>
        </header>

        <section aria-labelledby="systems-title" className="systems-section">
          <div className="section-heading">
            <div>
              <h2 id="systems-title">État du système</h2>
              <p>Données statiques de démonstration</p>
            </div>
            <span className="updated-label">Mis à jour à l’instant</span>
          </div>

          <div className="status-grid">
            <StatusCard
              detail="Le service répond normalement."
              icon="server"
              label="Backend"
              status="Opérationnel"
            />
            <StatusCard
              detail="La connexion est disponible."
              icon="database"
              label="Base de données"
              status="Opérationnelle"
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

export default App
