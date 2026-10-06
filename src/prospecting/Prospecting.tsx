import { useCallback, useMemo, useState } from 'react'
import { createAdminProspectingApi } from '../api/adminProspecting'
import { Button, Panel } from '../components/ui'
import { CompanySheet } from './CompanySheet'
import { ProspectingForm } from './ProspectingForm'
import { companyFields, emptyCompany } from './formFields'
import { PROSPECT_STATUS_LABELS } from './model'
import { useProspectingResource } from './state'
import './prospecting.css'
import { LoadError, Pagination, PAGE_SIZE, type ProspectingProps } from './presentation'

function CompanyList({
  api,
  onSessionExpired,
  openCompany,
  createCompany,
}: ProspectingProps & {
  openCompany: (id: string) => void
  createCompany: () => void
}) {
  const [offset, setOffset] = useState(0)
  const load = useCallback(
    (signal: AbortSignal) => api.listCompanies(PAGE_SIZE, offset, signal),
    [api, offset],
  )
  const { state, reload } = useProspectingResource(load, onSessionExpired)
  return (
    <Panel className="cp-panel">
      <div className="cp-panel-heading">
        <h2>Entreprises prospectées</h2>
        <Button variant="primary" onClick={createCompany}>
          Ajouter une entreprise
        </Button>
      </div>
      {state.status === 'loading' ? (
        <p role="status">Chargement des entreprises…</p>
      ) : state.status !== 'loaded' ? (
        <LoadError status={state.status} retry={reload} />
      ) : (
        <>
          {state.value.length === 0 ? (
            <p className="cp-empty">Aucune entreprise sur cette page.</p>
          ) : (
            <ul className="prospecting-list">
              {state.value.map((company) => (
                <li key={company.id}>
                  <button
                    className="prospecting-company"
                    onClick={() => openCompany(company.id)}
                  >
                    <strong>{company.name}</strong>
                    <span>Ville : {company.city ?? 'Non renseignée'}</span>
                    <span>Secteur : {company.sector ?? 'Non renseigné'}</span>
                    <span className="prospecting-status">
                      {PROSPECT_STATUS_LABELS[company.status]}
                    </span>
                    <span>Source : {company.source ?? 'Non renseignée'}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Pagination
            offset={offset}
            count={state.value.length}
            setOffset={setOffset}
          />
        </>
      )}
    </Panel>
  )
}
export function Prospecting({
  apiBaseUrl,
  onSessionExpired,
}: {
  apiBaseUrl: string | null
  onSessionExpired: () => void
}) {
  const api = useMemo(() => createAdminProspectingApi(apiBaseUrl), [apiBaseUrl])
  const [selection, setSelection] = useState<string | null>(null)
  return (
    <div className="prospecting" key={apiBaseUrl}>
      <div className="cp-provenance">
        <strong>Données réelles · prospection interne</strong>
        <span>
          Entreprises et contacts commerciaux. Les clients Syncoria disposent d’un
          registre distinct.
        </span>
      </div>
      {selection === null ? (
        <CompanyList
          api={api}
          onSessionExpired={onSessionExpired}
          openCompany={setSelection}
          createCompany={() => setSelection('new')}
        />
      ) : (
        <>
          <Button onClick={() => setSelection(null)}>← Entreprises prospectées</Button>
          {selection === 'new' ? (
            <Panel className="cp-panel">
              <ProspectingForm
                title="Ajouter une entreprise"
                initial={emptyCompany}
                fields={companyFields}
                onSave={(input, signal) => api.createCompany(input, signal)}
                onSaved={(company) => setSelection(company.id)}
                onSessionExpired={onSessionExpired}
                onCancel={() => setSelection(null)}
              />
            </Panel>
          ) : (
            <CompanySheet
              key={selection}
              api={api}
              companyId={selection}
              onSessionExpired={onSessionExpired}
            />
          )}
        </>
      )}
    </div>
  )
}
