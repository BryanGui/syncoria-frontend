import { useState } from 'react'

import type { CurrentClientUser } from '../api/clientSession'
import { TenantWorkspace } from '../components/TenantWorkspace'


interface ClientWorkspacePageProps {
  currentUser: CurrentClientUser
  onLogout: () => Promise<boolean>
}

export function ClientWorkspacePage({
  currentUser,
  onLogout,
}: ClientWorkspacePageProps) {
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState(false)

  async function handleLogout() {
    setIsLoggingOut(true)
    setLogoutError(false)
    if (await onLogout()) return
    setIsLoggingOut(false)
    setLogoutError(true)
  }

  return (
    <main className="client-workspace-page">
      <header className="client-workspace-header">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">S</span>
          <span>Syncoria</span>
        </div>
        <div className="client-workspace-header__account">
          <div>
            <strong>{currentUser.user.displayName ?? currentUser.user.login}</strong>
            <span>{currentUser.user.role}</span>
          </div>
          <button
            className="secondary-button"
            disabled={isLoggingOut}
            onClick={handleLogout}
            type="button"
          >
            {isLoggingOut ? 'Déconnexion…' : 'Se déconnecter'}
          </button>
        </div>
      </header>
      {logoutError && (
        <p aria-live="polite" className="logout-error" role="alert">
          Déconnexion impossible. Réessayez.
        </p>
      )}
      <TenantWorkspace tenant={currentUser.tenant} />
    </main>
  )
}
