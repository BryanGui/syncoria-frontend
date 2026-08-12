import { useCallback, useEffect, useState } from 'react'

import {
  fetchIntegrationCase,
  fetchIntegrationCases,
  type IntegrationCase,
} from '../api/integrationCases'
import { fetchAdminTenants, type AdminTenant } from '../api/adminTenants'
import { integrateLoadedIntegrationCase } from '../integrationCases/form'
import { IntegrationCaseCreationForm } from './integrations/IntegrationCaseCreationForm'
import { IntegrationCaseDetail } from './integrations/IntegrationCaseDetail'


interface IntegrationsPageProps {
  apiBaseUrl: string | null
  onSessionExpired: () => void
}

type IntegrationCasesPageState =
  | { status: 'loading' }
  | { status: 'loaded'; integrationCases: IntegrationCase[] }
  | { status: 'error' }

type TenantsState =
  | { status: 'loading' }
  | { status: 'loaded'; tenants: AdminTenant[] }
  | { status: 'error' }

type DetailState =
  | { status: 'idle' | 'loading' | 'not_found' | 'error' }
  | { status: 'loaded'; integrationCase: IntegrationCase }


export function IntegrationsPage({
  apiBaseUrl,
  onSessionExpired,
}: IntegrationsPageProps) {
  const [pageState, setPageState] = useState<IntegrationCasesPageState>({
    status: 'loading',
  })
  const [tenantsState, setTenantsState] = useState<TenantsState>({
    status: 'loading',
  })
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null)
  const [detailState, setDetailState] = useState<DetailState>({ status: 'idle' })
  const [isCreationOpen, setIsCreationOpen] = useState(false)

  const updateLoadedCase = useCallback((integrationCase: IntegrationCase) => {
    setDetailState({ status: 'loaded', integrationCase })
    setPageState((currentState) => currentState.status === 'loaded'
      ? {
          status: 'loaded',
          integrationCases: integrateLoadedIntegrationCase(
            currentState.integrationCases,
            integrationCase,
          ),
        }
      : currentState)
  }, [])

  useEffect(() => {
    const abortController = new AbortController()
    let isActive = true
    setPageState({ status: 'loading' })
    void fetchIntegrationCases(apiBaseUrl, abortController.signal).then((result) => {
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
  }, [apiBaseUrl, onSessionExpired])

  useEffect(() => {
    const abortController = new AbortController()
    let isActive = true
    void fetchAdminTenants(apiBaseUrl, abortController.signal).then((result) => {
      if (!isActive) return
      if (result.status === 'unauthenticated') {
        onSessionExpired()
        return
      }
      setTenantsState(result)
    })
    return () => {
      isActive = false
      abortController.abort()
    }
  }, [apiBaseUrl, onSessionExpired])

  useEffect(() => {
    if (selectedCaseId === null) {
      setDetailState({ status: 'idle' })
      return
    }
    const abortController = new AbortController()
    let isActive = true
    setDetailState({ status: 'loading' })
    void fetchIntegrationCase(
      apiBaseUrl,
      selectedCaseId,
      abortController.signal,
    ).then((result) => {
      if (!isActive) return
      if (result.status === 'unauthenticated') {
        onSessionExpired()
        return
      }
      if (result.status === 'loaded') {
        updateLoadedCase(result.integrationCase)
        return
      }
      setDetailState({
        status: result.status === 'not_found' ? 'not_found' : 'error',
      })
    })
    return () => {
      isActive = false
      abortController.abort()
    }
  }, [apiBaseUrl, onSessionExpired, selectedCaseId, updateLoadedCase])

  if (selectedCaseId !== null) {
    if (detailState.status === 'loaded') {
      return (
        <IntegrationCaseDetail
          apiBaseUrl={apiBaseUrl}
          integrationCase={detailState.integrationCase}
          onBack={() => setSelectedCaseId(null)}
          onSessionExpired={onSessionExpired}
          onUpdated={updateLoadedCase}
        />
      )
    }
    return (
      <section className="integration-detail">
        <button
          className="back-button"
          onClick={() => setSelectedCaseId(null)}
          type="button"
        >
          ← Retour aux intégrations
        </button>
        <div
          aria-live={detailState.status === 'loading' ? 'polite' : undefined}
          className={`clients-state${detailState.status === 'loading'
            ? ' clients-state--loading'
            : ''}`}
          role={detailState.status === 'error' || detailState.status === 'not_found'
            ? 'alert'
            : undefined}
        >
          {detailState.status === 'loading' ? (
            <><span className="session-loading__indicator" aria-hidden="true" /><p>Chargement de la fiche…</p></>
          ) : <h2>{detailState.status === 'not_found' ? 'Fiche introuvable' : 'Fiche indisponible'}</h2>}
        </div>
      </section>
    )
  }

  return (
    <section className="integrations-panel" aria-labelledby="integrations-title">
      <div className="integrations-panel__header">
        <div>
          <h2 id="integrations-title">Fiches d’intégration</h2>
          <p>Préparation des connexions clients et de leurs entrées complémentaires.</p>
        </div>
        <button
          className="primary-button"
          onClick={() => setIsCreationOpen(true)}
          type="button"
        >
          + Nouvelle intégration
        </button>
      </div>

      {isCreationOpen ? (
        <IntegrationCaseCreationForm
          apiBaseUrl={apiBaseUrl}
          onCancel={() => setIsCreationOpen(false)}
          onCreated={(integrationCase) => {
            setIsCreationOpen(false)
            updateLoadedCase(integrationCase)
            setSelectedCaseId(integrationCase.id)
          }}
          onSessionExpired={onSessionExpired}
          tenants={tenantsState.status === 'loaded' ? tenantsState.tenants : null}
          tenantsUnavailable={tenantsState.status === 'error'}
        />
      ) : null}

      {pageState.status === 'loading' ? (
        <div aria-live="polite" className="clients-state clients-state--embedded clients-state--loading">
          <span className="session-loading__indicator" aria-hidden="true" />
          <p>Chargement des intégrations…</p>
        </div>
      ) : pageState.status === 'error' ? (
        <div className="clients-state clients-state--embedded" role="alert">
          <h2>Intégrations indisponibles</h2>
        </div>
      ) : pageState.integrationCases.length === 0 ? (
        <div className="clients-state clients-state--embedded">
          <h2>Aucune intégration configurée</h2>
          <p>Les futures fiches d’intégration des clients seront préparées et suivies depuis cet espace.</p>
        </div>
      ) : (
        <div className="integration-list">
          {pageState.integrationCases.map((integrationCase) => (
            <button
              className="integration-list__item"
              key={integrationCase.id}
              onClick={() => setSelectedCaseId(integrationCase.id)}
              type="button"
            >
              <strong>{integrationCase.tenantName}</strong>
              <span>{integrationCase.sourceSystem}</span>
              <span className="integration-list__objective">{integrationCase.objective}</span>
              <span>{integrationCase.environment}</span>
              <span>{integrationCase.status}</span>
              <span>{integrationCase.credential.configured ? 'Credential configuré' : 'Credential non configuré'}</span>
              <span>{integrationCase.jsonInputCount} JSON</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
