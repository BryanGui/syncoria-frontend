import { useCallback, useState } from 'react'
import { Notification, Panel } from '../components/ui'
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
  if (state.status === 'loading')
    return <p role="status">Chargement de l’entreprise…</p>
  if (state.status !== 'loaded')
    return <LoadError status={state.status} retry={reload} />
  const company = state.value
  return (
    <>
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
      <Contacts api={api} companyId={company.id} onSessionExpired={onSessionExpired} />
    </>
  )
}
