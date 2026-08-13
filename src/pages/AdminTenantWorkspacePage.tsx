import { useEffect, useState } from 'react'

import {
  archiveAdminTenant,
  fetchAdminTenant,
  reactivateAdminTenant,
  type AdminTenantLifecycleResult,
} from '../api/adminTenant'
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
  const [isArchiveConfirmationOpen, setIsArchiveConfirmationOpen] = useState(false)
  const [isLifecycleSubmitting, setIsLifecycleSubmitting] = useState(false)
  const [lifecycleError, setLifecycleError] = useState<string | null>(null)
  const [lifecycleNotice, setLifecycleNotice] = useState<string | null>(null)

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

  function handleLifecycleFailure(result: AdminTenantLifecycleResult) {
    if (result.status === 'unauthenticated') {
      onSessionExpired()
      return
    }
    if (result.status === 'not_found') {
      setLifecycleError('Ce client n’existe plus.')
    } else if (result.status === 'conflict') {
      setLifecycleError('L’état du client a changé. Rechargez la fiche.')
    } else {
      setLifecycleError('Le statut du client ne peut pas être modifié pour le moment.')
    }
  }

  async function archiveTenant() {
    setIsLifecycleSubmitting(true)
    setLifecycleError(null)
    setLifecycleNotice(null)
    const result = await archiveAdminTenant(apiBaseUrl, tenantId)
    setIsLifecycleSubmitting(false)
    if (result.status !== 'updated') {
      handleLifecycleFailure(result)
      return
    }
    setPageState({ status: 'loaded', tenant: result.tenant })
    setIsArchiveConfirmationOpen(false)
  }

  async function reactivateTenant() {
    setIsLifecycleSubmitting(true)
    setLifecycleError(null)
    const result = await reactivateAdminTenant(apiBaseUrl, tenantId)
    setIsLifecycleSubmitting(false)
    if (result.status !== 'updated') {
      handleLifecycleFailure(result)
      return
    }
    setPageState({ status: 'loaded', tenant: result.tenant })
    setLifecycleNotice(
      'Client réactivé. Les providers et credentials doivent être reconfigurés.',
    )
  }

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
          tenantStatus={pageState.tenant.status}
        />
      )}
      lifecycleControls={(
        <div className="tenant-lifecycle">
          {pageState.tenant.status === 'active' ? (
            isArchiveConfirmationOpen ? (
              <div
                aria-labelledby="archive-tenant-confirmation-title"
                className="tenant-lifecycle__confirmation"
                role="alertdialog"
              >
                <strong id="archive-tenant-confirmation-title">
                  Confirmer l’archivage
                </strong>
                <p>
                  L’archivage coupe les accès du client et supprime les providers
                  et credentials configurés. Les anciens tokens ne pourront pas
                  être restaurés automatiquement après une réactivation.
                </p>
                <div>
                  <button
                    className="secondary-button"
                    disabled={isLifecycleSubmitting}
                    onClick={() => setIsArchiveConfirmationOpen(false)}
                    type="button"
                  >
                    Annuler
                  </button>
                  <button
                    className="danger-button"
                    disabled={isLifecycleSubmitting}
                    onClick={() => void archiveTenant()}
                    type="button"
                  >
                    {isLifecycleSubmitting ? 'Archivage…' : 'Confirmer l’archivage'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="danger-button"
                onClick={() => {
                  setLifecycleError(null)
                  setIsArchiveConfirmationOpen(true)
                }}
                type="button"
              >
                Archiver le client
              </button>
            )
          ) : (
            <div className="tenant-lifecycle__reactivation">
              <button
                className="primary-button"
                disabled={isLifecycleSubmitting}
                onClick={() => void reactivateTenant()}
                type="button"
              >
                {isLifecycleSubmitting ? 'Réactivation…' : 'Réactiver le client'}
              </button>
              <span>Les providers devront être reconfigurés après réactivation.</span>
            </div>
          )}
          {lifecycleError ? (
            <p className="tenant-lifecycle__error" role="alert">{lifecycleError}</p>
          ) : null}
          {lifecycleNotice ? (
            <p className="tenant-lifecycle__notice" role="status">{lifecycleNotice}</p>
          ) : null}
        </div>
      )}
      onBack={onBack}
      tenant={pageState.tenant}
    />
  )
}
