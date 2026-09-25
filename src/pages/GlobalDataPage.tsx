import { useEffect, useState } from 'react'
import { fetchAdminTenants, type AdminTenant } from '../api/adminTenants.ts'
import { AdminTenantData } from '../components/AdminTenantData.tsx'

interface Props { apiBaseUrl: string | null; onSessionExpired: () => void }
type TenantState = { status: 'loading' | 'error' } | { status: 'loaded'; tenants: AdminTenant[] }

export function GlobalDataPage({ apiBaseUrl, onSessionExpired }: Props) {
  const [state, setState] = useState<TenantState>({ status: 'loading' })
  const [tenantId, setTenantId] = useState('')
  const [reload, setReload] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setState({ status: 'loading' })
    void fetchAdminTenants(apiBaseUrl, controller.signal).then((result) => {
      if (!active) return
      if (result.status === 'unauthenticated') { onSessionExpired(); return }
      setState(result.status === 'loaded' ? { status: 'loaded', tenants: result.tenants } : { status: 'error' })
    })
    return () => { active = false; controller.abort() }
  }, [apiBaseUrl, onSessionExpired, reload])
  return <section className="global-data-page">
    <label className="global-data-page__selector">Client
      <select value={tenantId} onChange={(event) => setTenantId(event.target.value)} disabled={state.status !== 'loaded'}>
        <option value="">Choisir un client</option>
        {state.status === 'loaded' ? state.tenants.map((tenant) => (
          <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
        )) : null}
      </select>
    </label>
    {state.status === 'loading' ? <p role="status">Chargement des clients…</p> : null}
    {state.status === 'error' ? <div role="alert"><p>La liste des clients ne peut pas être chargée.</p>
      <button className="secondary-button" type="button" onClick={() => setReload((key) => key + 1)}>Réessayer</button></div> : null}
    {state.status === 'loaded' && state.tenants.length === 0 ? <p>Aucun client disponible.</p> : null}
    {state.status === 'loaded' && !tenantId && state.tenants.length > 0 ? <p>Choisissez un client pour explorer ses données.</p> : null}
    {tenantId ? <AdminTenantData key={tenantId} apiBaseUrl={apiBaseUrl} tenantId={tenantId} onSessionExpired={onSessionExpired} /> : null}
  </section>
}
