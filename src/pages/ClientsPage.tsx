import { useEffect, useReducer, useState, type FormEvent } from 'react'

import {
  createAdminTenant,
  fetchAdminTenants,
  type AdminTenant,
} from '../api/adminTenants'
import {
  INITIAL_TENANT_CREATION_FORM_STATE,
  integrateCreatedTenant,
  tenantCreationFormReducer,
  validateTenantCreationDraft,
} from '../tenantCreation/form'

interface ClientsPageProps {
  apiBaseUrl: string | null
  onOpenTenant: (tenantId: string) => void
  onSessionExpired: () => void
}

type ClientsPageState =
  | { status: 'loading' }
  | { status: 'loaded'; tenants: AdminTenant[] }
  | { status: 'error' }

export function ClientsPage({
  apiBaseUrl,
  onOpenTenant,
  onSessionExpired,
}: ClientsPageProps) {
  const [reloadKey, setReloadKey] = useState(0)
  const [pageState, setPageState] = useState<ClientsPageState>({
    status: 'loading',
  })
  const [creationState, dispatchCreation] = useReducer(
    tenantCreationFormReducer,
    INITIAL_TENANT_CREATION_FORM_STATE,
  )
  const validation = validateTenantCreationDraft(creationState.draft)

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

  const closeCreation = () => {
    if (creationState.status === 'submitting') return
    dispatchCreation({ type: 'cancel' })
  }

  const submitCreation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (validation.nameError !== null || validation.slugError !== null) {
      dispatchCreation({ type: 'reject', status: 'invalid' })
      return
    }

    dispatchCreation({ type: 'submit' })
    const result = await createAdminTenant(apiBaseUrl, {
      name: validation.normalizedName,
      slug: validation.normalizedSlug,
    })
    if (result.status === 'unauthenticated') {
      onSessionExpired()
      return
    }
    if (result.status !== 'created') {
      dispatchCreation({ type: 'reject', status: result.status })
      return
    }

    const completion = integrateCreatedTenant(
      pageState.status === 'loaded' ? pageState.tenants : [],
      result.tenant,
    )
    setPageState({ status: 'loaded', tenants: completion.tenants })
    dispatchCreation({ type: 'complete' })
    onOpenTenant(completion.tenantIdToOpen)
  }

  return (
    <section aria-labelledby="clients-list-title" className="clients-panel">
      <div className="clients-panel__header">
        <div>
          <h2 id="clients-list-title">Clients enregistrés</h2>
          <p>Tenants disponibles dans le registre Syncoria</p>
        </div>
        <div className="clients-panel__actions">
          {pageState.status === 'loaded' ? (
            <span>{pageState.tenants.length} client{pageState.tenants.length > 1 ? 's' : ''}</span>
          ) : null}
          <button
            className="primary-button"
            onClick={() => {
              dispatchCreation({ type: 'open' })
            }}
            type="button"
          >
            + Nouveau client
          </button>
        </div>
      </div>

      {creationState.isOpen ? (
        <form className="tenant-creation-form" onSubmit={submitCreation}>
          <div className="tenant-creation-form__heading">
            <div>
              <h3>Créer un nouveau client</h3>
              <p>Cette opération crée uniquement le tenant dans Syncoria.</p>
            </div>
            <button
              aria-label="Fermer le formulaire"
              className="tenant-creation-form__close"
              disabled={creationState.status === 'submitting'}
              onClick={closeCreation}
              type="button"
            >
              ×
            </button>
          </div>
          <div className="tenant-creation-form__fields">
            <label>
              Nom du client
              <input
                aria-describedby={creationState.status === 'invalid' && validation.nameError
                  ? 'tenant-name-error'
                  : undefined}
                disabled={creationState.status === 'submitting'}
                maxLength={200}
                onChange={(event) => {
                  dispatchCreation({ type: 'change_name', name: event.target.value })
                }}
                value={creationState.draft.name}
              />
              {creationState.status === 'invalid' && validation.nameError ? (
                <span className="tenant-creation-form__field-error" id="tenant-name-error">
                  {validation.nameError}
                </span>
              ) : null}
            </label>
            <label>
              Slug
              <input
                aria-describedby={creationState.status === 'invalid' && validation.slugError
                  ? 'tenant-slug-error'
                  : 'tenant-slug-help'}
                autoCapitalize="none"
                disabled={creationState.status === 'submitting'}
                maxLength={128}
                onChange={(event) => {
                  dispatchCreation({ type: 'change_slug', slug: event.target.value })
                }}
                spellCheck={false}
                value={creationState.draft.slug}
              />
              <span className="tenant-creation-form__help" id="tenant-slug-help">
                Valeur finale : <code>{validation.normalizedSlug || 'exemple-client'}</code>
              </span>
              {creationState.status === 'invalid' && validation.slugError ? (
                <span className="tenant-creation-form__field-error" id="tenant-slug-error">
                  {validation.slugError}
                </span>
              ) : null}
            </label>
          </div>
          {creationState.status === 'conflict' ? (
            <p className="tenant-creation-form__error" role="alert">
              Ce slug est déjà utilisé par un client existant.
            </p>
          ) : null}
          {creationState.status === 'error' ? (
            <p className="tenant-creation-form__error" role="alert">
              Le client ne peut pas être créé pour le moment.
            </p>
          ) : null}
          <div className="tenant-creation-form__buttons">
            <button
              className="secondary-button"
              disabled={creationState.status === 'submitting'}
              onClick={closeCreation}
              type="button"
            >
              Annuler
            </button>
            <button
              className="primary-button"
              disabled={creationState.status === 'submitting'}
              type="submit"
            >
              {creationState.status === 'submitting' ? 'Création…' : 'Créer le client'}
            </button>
          </div>
        </form>
      ) : null}

      {pageState.status === 'loading' ? (
        <div aria-live="polite" className="clients-state clients-state--embedded clients-state--loading">
          <span className="session-loading__indicator" aria-hidden="true" />
          <p>Chargement des clients…</p>
        </div>
      ) : pageState.status === 'error' ? (
        <div className="clients-state clients-state--embedded" role="alert">
          <h2>Liste indisponible</h2>
          <p>Les clients ne peuvent pas être chargés pour le moment.</p>
          <button
            className="secondary-button"
            onClick={() => setReloadKey((currentKey) => currentKey + 1)}
            type="button"
          >
            Réessayer
          </button>
        </div>
      ) : pageState.tenants.length === 0 ? (
        <div className="clients-state clients-state--embedded">
          <h2>Aucun client</h2>
          <p>Aucun tenant n’est actuellement enregistré dans Syncoria.</p>
        </div>
      ) : (
        <div className="clients-table-wrapper">
          <table className="clients-table">
            <thead>
              <tr>
                <th scope="col">Client</th>
                <th scope="col">Slug</th>
                <th scope="col">Statut</th>
                <th scope="col">Identifiant technique</th>
                <th scope="col"><span className="visually-hidden">Action</span></th>
              </tr>
            </thead>
            <tbody>
              {pageState.tenants.map((tenant) => (
                <tr key={tenant.id}>
                  <td>
                    <button
                      className="client-link"
                      onClick={() => onOpenTenant(tenant.id)}
                      type="button"
                    >
                      {tenant.name}
                    </button>
                  </td>
                  <td><code>{tenant.slug}</code></td>
                  <td>
                    <span className={tenant.status === 'active'
                      ? 'tenant-status tenant-status--active'
                      : 'tenant-status'}>
                      {tenant.status}
                    </span>
                  </td>
                  <td><code>{tenant.id}</code></td>
                  <td>
                    <button
                      className="secondary-button clients-table__open"
                      onClick={() => onOpenTenant(tenant.id)}
                      type="button"
                    >
                      Ouvrir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
