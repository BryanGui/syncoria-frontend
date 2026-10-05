import { useCallback, useState } from 'react'
import { Button, Notification, Panel } from '../components/ui'
import { ProspectingForm } from './ProspectingForm'
import { contactFields, emptyContact } from './formFields'
import { changedFields } from './model'
import { useProspectingResource } from './state'
import { LoadError, Pagination, PAGE_SIZE, type ProspectingProps } from './presentation'

interface Props extends ProspectingProps {
  companyId: string
}
function ContactEditor({
  api,
  companyId,
  contactId,
  onSessionExpired,
  onClose,
  onSaved,
}: Props & { contactId: string; onClose: () => void; onSaved: () => void }) {
  const load = useCallback(
    (signal: AbortSignal) => api.getContact(contactId, companyId, signal),
    [api, contactId, companyId],
  )
  const { state, reload } = useProspectingResource(load, onSessionExpired)
  if (state.status === 'loading') return <p role="status">Chargement du contact…</p>
  if (state.status !== 'loaded')
    return (
      <>
        <LoadError status={state.status} retry={reload} />
        <Button onClick={onClose}>Retour aux contacts</Button>
      </>
    )
  const contact = state.value
  return (
    <ProspectingForm
      title="Modifier le contact"
      initial={contact}
      fields={contactFields}
      onSessionExpired={onSessionExpired}
      onCancel={onClose}
      onSaved={onSaved}
      onSave={(input, signal) => {
        const patch = changedFields(input, contact)
        return Object.keys(patch).length
          ? api.updateContact(contact.id, companyId, patch, signal)
          : Promise.resolve({ status: 'loaded', value: contact })
      }}
    />
  )
}
export function Contacts({ api, companyId, onSessionExpired }: Props) {
  const [offset, setOffset] = useState(0)
  const [selection, setSelection] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const load = useCallback(
    (signal: AbortSignal) => api.listContacts(companyId, PAGE_SIZE, offset, signal),
    [api, companyId, offset],
  )
  const { state, reload } = useProspectingResource(load, onSessionExpired)
  const close = () => {
    setSelection(null)
    reload()
  }
  return (
    <Panel className="cp-panel">
      {selection === null ? (
        <>
          <div className="cp-panel-heading">
            <h2>Contacts de l’entreprise</h2>
            <Button
              onClick={() => {
                setSaved(false)
                setSelection('new')
              }}
            >
              Ajouter un contact
            </Button>
          </div>
          {saved && <Notification tone="success">Contact enregistré.</Notification>}
          {state.status === 'loading' ? (
            <p role="status">Chargement des contacts…</p>
          ) : state.status !== 'loaded' ? (
            <LoadError status={state.status} retry={reload} />
          ) : (
            <>
              {!state.value.length ? (
                <p className="cp-empty">Aucun contact sur cette page.</p>
              ) : (
                <ul className="prospecting-list">
                  {state.value.map((contact) => (
                    <li key={contact.id} className="prospecting-contact">
                      <div>
                        <h3>
                          {contact.first_name} {contact.last_name}
                        </h3>
                        <p>{contact.role ?? 'Fonction non renseignée'}</p>
                        <p>
                          {contact.email ?? 'Email non renseigné'} ·{' '}
                          {contact.phone ?? 'Téléphone non renseigné'}
                        </p>
                      </div>
                      <Button
                        onClick={() => {
                          setSaved(false)
                          setSelection(contact.id)
                        }}
                        aria-label={`Modifier le contact ${contact.first_name} ${contact.last_name}`}
                      >
                        Modifier
                      </Button>
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
        </>
      ) : selection === 'new' ? (
        <ProspectingForm
          title="Ajouter un contact"
          initial={emptyContact}
          fields={contactFields}
          onSessionExpired={onSessionExpired}
          onCancel={close}
          onSave={(input, signal) => api.createContact(companyId, input, signal)}
          onSaved={() => {
            setSaved(true)
            setOffset(0)
            close()
          }}
        />
      ) : (
        <ContactEditor
          key={selection}
          api={api}
          companyId={companyId}
          contactId={selection}
          onSessionExpired={onSessionExpired}
          onClose={close}
          onSaved={() => {
            setSaved(true)
            close()
          }}
        />
      )}
    </Panel>
  )
}
