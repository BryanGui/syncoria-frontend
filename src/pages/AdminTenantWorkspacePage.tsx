import { useEffect, useState } from 'react'

import { fetchAdminTenant } from '../api/adminTenant'
import { AdminTenantIntegration } from '../components/AdminTenantIntegration'
import { TenantWorkspace } from '../components/TenantWorkspace'
import {
  beginTenantWorkspaceLoad,
  type TenantWorkspaceLoadState,
} from '../tenantWorkspace/state'

interface AdminTenantWorkspacePageProps {
  apiBaseUrl: string | null
  tenantId: string
  onBack: () => void
  onSessionExpired: () => void
}

export function AdminTenantWorkspacePage({
  apiBaseUrl,
  tenantId,
  onBack,
  onSessionExpired,
}: AdminTenantWorkspacePageProps) {
  const [reloadKey, setReloadKey] = useState(0)
  const [pageState, setPageState] = useState<TenantWorkspaceLoadState>(
    beginTenantWorkspaceLoad,
  )

  useEffect(() => {
    const abortController = new AbortController()
    let isActive = true
    setPageState(beginTenantWorkspaceLoad())

    void fetchAdminTenant(apiBaseUrl, tenantId, abortController.signal).then(
      (result) => {
        if (!isActive) return
        if (result.status === 'unauthenticated') {
          onSessionExpired()
          return
        }
        setPageState(result)
      },
    )

    return () => {
      isActive = false
      abortController.abort()
    }
  }, [apiBaseUrl, onSessionExpired, reloadKey, tenantId])

  if (pageState.status === 'loading') {
    return (
      <section aria-live="polite" className="clients-state clients-state--loading">
        <span className="session-loading__indicator" aria-hidden="true" />
        <p>Chargement de l’espace tenant…</p>
      </section>
    )
  }

  if (pageState.status === 'not_found') {
    return (
      <section className="clients-state" role="alert">
        <h2>Tenant introuvable</h2>
        <p>Ce tenant n’existe pas ou n’est plus disponible.</p>
        <button className="secondary-button" onClick={onBack} type="button">
          Retour aux clients
        </button>
      </section>
    )
  }

  if (pageState.status === 'error') {
    return (
      <section className="clients-state" role="alert">
        <h2>Espace tenant indisponible</h2>
        <p>Les informations du tenant ne peuvent pas être chargées.</p>
        <div className="tenant-workspace__error-actions">
          <button className="secondary-button" onClick={onBack} type="button">
            Retour aux clients
          </button>
          <button
            className="secondary-button"
            onClick={() => setReloadKey((currentKey) => currentKey + 1)}
            type="button"
          >
            Réessayer
          </button>
        </div>
      </section>
    )
  }

  return (
    <TenantWorkspace
      adminIntegration={(
        <AdminTenantIntegration
          apiBaseUrl={apiBaseUrl}
          onSessionExpired={onSessionExpired}
          tenantId={pageState.tenant.id}
        />
      )}
      onBack={onBack}
      tenant={pageState.tenant}
    />
  )
}
