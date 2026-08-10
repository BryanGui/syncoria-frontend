import { useEffect, useState } from 'react'

import {
  fetchAdminTenants,
  type AdminTenant,
} from '../api/adminTenants'

interface ClientsPageProps {
  apiBaseUrl: string | null
  onSessionExpired: () => void
}

type ClientsPageState =
  | { status: 'loading' }
  | { status: 'loaded'; tenants: AdminTenant[] }
  | { status: 'error' }

export function ClientsPage({
  apiBaseUrl,
  onSessionExpired,
}: ClientsPageProps) {
  const [reloadKey, setReloadKey] = useState(0)
  const [pageState, setPageState] = useState<ClientsPageState>({
    status: 'loading',
  })

  useEffect(() => {
    const abortController = new AbortController()
    let isActive = true
    setPageState({ status: 'loading' })

    void fetchAdminTenants(apiBaseUrl, abortController.signal).then((result) => {
      if (!isActive) return
      if (result.status === 'unauthenticated') {
        onSessionExpired()
        return
      }
      setPageState(result)
    })

    return () => {
      isActive = false
      abortController.abort()
    }
  }, [apiBaseUrl, onSessionExpired, reloadKey])

  if (pageState.status === 'loading') {
    return (
      <section aria-live="polite" className="clients-state clients-state--loading">
        <span className="session-loading__indicator" aria-hidden="true" />
        <p>Chargement des clients…</p>
      </section>
    )
  }

  if (pageState.status === 'error') {
    return (
      <section className="clients-state" role="alert">
        <h2>Liste indisponible</h2>
        <p>Les clients ne peuvent pas être chargés pour le moment.</p>
        <button
          className="secondary-button"
          onClick={() => setReloadKey((currentKey) => currentKey + 1)}
          type="button"
        >
          Réessayer
        </button>
      </section>
    )
  }

  if (pageState.tenants.length === 0) {
    return (
      <section className="clients-state">
        <h2>Aucun client</h2>
        <p>Aucun tenant n’est actuellement enregistré dans Syncoria.</p>
      </section>
    )
  }

  return (
    <section aria-labelledby="clients-list-title" className="clients-panel">
      <div className="clients-panel__header">
        <div>
          <h2 id="clients-list-title">Clients enregistrés</h2>
          <p>Tenants disponibles dans le registre Syncoria</p>
        </div>
        <span>{pageState.tenants.length} client{pageState.tenants.length > 1 ? 's' : ''}</span>
      </div>
      <div className="clients-table-wrapper">
        <table className="clients-table">
          <thead>
            <tr>
              <th scope="col">Client</th>
              <th scope="col">Statut</th>
              <th scope="col">Identifiant technique</th>
            </tr>
          </thead>
          <tbody>
            {pageState.tenants.map((tenant) => (
              <tr key={tenant.id}>
                <td><strong>{tenant.slug}</strong></td>
                <td>
                  <span className={tenant.status === 'active'
                    ? 'tenant-status tenant-status--active'
                    : 'tenant-status'}>
                    {tenant.status}
                  </span>
                </td>
                <td><code>{tenant.id}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
