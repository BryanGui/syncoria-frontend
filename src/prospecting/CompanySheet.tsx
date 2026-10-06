import { useCallback, useState } from 'react'
import { Button, Notification, Panel } from '../components/ui'
import { Contacts } from './Contacts'
import { ProspectingForm } from './ProspectingForm'
import { companyFields } from './formFields'
import { changedFields } from './model'
import { useProspectingResource } from './state'
import { LoadError, type ProspectingProps } from './presentation'

export function CompanySheet({
  api,
  companyId,
  onSessionExpired,
}: ProspectingProps & { companyId: string }) {
  const load = useCallback(
    (signal: AbortSignal) => api.getCompany(companyId, signal),
    [api, companyId],
  )
  const { state, reload, setValue } = useProspectingResource(load, onSessionExpired)
  const [saved, setSaved] = useState(false)
  const [view, setView] = useState<'contacts' | 'information'>('contacts')
  if (state.status === 'loading')
    return <p role="status">Chargement de l’entreprise…</p>
  if (state.status !== 'loaded')
    return <LoadError status={state.status} retry={reload} />
  const company = state.value
  return (
    <>
      <div className="prospecting-sheet-heading">
        <h2>{company.name}</h2>
        <div className="prospecting-sheet-views" role="group" aria-label="Vue de la fiche entreprise">
          <Button variant={view === 'contacts' ? 'secondary' : 'ghost'} aria-pressed={view === 'contacts'} onClick={() => setView('contacts')}>
            Contacts
          </Button>
          <Button variant={view === 'information' ? 'secondary' : 'ghost'} aria-pressed={view === 'information'} onClick={() => setView('information')}>
            Informations générales
          </Button>
        </div>
      </div>
      <div hidden={view !== 'contacts'}>
        <Contacts api={api} companyId={company.id} onSessionExpired={onSessionExpired} onSaved={() => setView('contacts')} />
      </div>
      <div hidden={view !== 'information'}>
        {saved && <Notification tone="success">Entreprise enregistrée.</Notification>}
        <Panel className="cp-panel">
          <ProspectingForm
            title="Fiche entreprise"
            key={company.updated_at}
            initial={company}
            fields={companyFields}
            onSessionExpired={onSessionExpired}
            onSave={(input, signal) => {
              setSaved(false)
              const patch = changedFields(input, company)
              return Object.keys(patch).length
                ? api.updateCompany(company.id, patch, signal)
                : Promise.resolve({ status: 'loaded', value: company })
            }}
            onSaved={(updated) => {
              setSaved(true)
              setValue(updated)
            }}
          />
        </Panel>
      </div>
    </>
  )
}
