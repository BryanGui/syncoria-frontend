import { useCallback, useState } from 'react'
import { Button, Notification, Panel } from '../components/ui'
import { Contacts } from './Contacts'
import { ProspectingForm } from './ProspectingForm'
import { companyFields } from './formFields'
import { changedFields } from './model'
import { useProspectingResource } from './state'
import { LoadError, type ProspectingProps } from './presentation'
import type { AdminFollowUpApi } from '../api/adminFollowUp'
import { FollowUpWorkspace } from '../followUp/FollowUp'

export function CompanySheet({
  api,
  companyId,
  onSessionExpired,
  followUpApi,
}: ProspectingProps & { companyId: string; followUpApi: AdminFollowUpApi }) {
  const load = useCallback(
    (signal: AbortSignal) => api.getCompany(companyId, signal),
    [api, companyId],
  )
  const { state, reload, setValue } = useProspectingResource(load, onSessionExpired)
  const [saved, setSaved] = useState(false)
  const [view, setView] = useState<'contacts' | 'information' | 'follow-up'>('contacts')
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
          <Button variant={view === 'follow-up' ? 'secondary' : 'ghost'} aria-pressed={view === 'follow-up'} onClick={() => setView('follow-up')}>
            Suivi
          </Button>
        </div>
      </div>
      {view === 'follow-up' && (
        <FollowUpWorkspace
          api={followUpApi}
          prospectingApi={api}
          company={company}
          onSessionExpired={onSessionExpired}
        />
      )}
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
