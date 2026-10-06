import { useCallback, useState } from 'react'
import { Button, Notification, Panel } from '../components/ui'
import { ProspectingForm } from './ProspectingForm'
import { contactFields, emptyContact } from './formFields'
import { changedFields, type Contact } from './model'
import { ContactTable } from './ProspectingTables'
import { useProspectingResource } from './state'
import { LoadError, Pagination, PAGE_SIZE, type ProspectingProps } from './presentation'

interface Props extends ProspectingProps {
  companyId: string
  onSaved: () => void
}
function ContactEditor({
  api,
  companyId,
  contactId,
  onSessionExpired,
  onClose,
  onSaved,
}: Omit<Props, 'onSaved'> & { contactId: string; onClose: () => void; onSaved: (contact: Contact) => void }) {
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
export function Contacts({ api, companyId, onSessionExpired, onSaved }: Props) {
  const [offset, setOffset] = useState(0)
  const [selection, setSelection] = useState<string | null>(null)
  const [saved, setSaved] = useState<Contact | null>(null)
  const load = useCallback(
    (signal: AbortSignal) => api.listContacts(companyId, PAGE_SIZE, offset, signal),
    [api, companyId, offset],
  )
  const { state, reload } = useProspectingResource(load, onSessionExpired)
  const close = () => {
    setSelection(null)
    reload()
  }
  const save = (contact: Contact) => {
    setSaved(contact)
    setOffset(0)
    close()
    onSaved()
  }
  // Keep the confirmed record visible even if pagination or a refresh failure omits it.
  const contacts = state.status === 'loaded' ? state.value : []
  const visibleContacts = saved
    ? [saved, ...contacts.filter((contact) => contact.id !== saved.id)]
    : contacts
  return (
    <Panel className="cp-panel">
      {selection === null ? (
        <>
          <div className="cp-panel-heading">
            <Button
              variant="primary"
              onClick={() => {
                setSaved(null)
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
          ) : null}
          {visibleContacts.length > 0 && (
            <ContactTable
              contacts={visibleContacts}
              savedId={saved?.id}
              editContact={(id) => {
                setSaved(null)
                setSelection(id)
              }}
            />
          )}
          {state.status === 'loaded' && (
            <>
              {!visibleContacts.length ? (
                <p className="cp-empty">Aucun contact sur cette page.</p>
              ) : null}
              <Pagination
                offset={offset}
                count={state.value.length}
                setOffset={(next) => {
                  setSaved(null)
                  setOffset(next)
                }}
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
          onSaved={save}
        />
      ) : (
        <ContactEditor
          key={selection}
          api={api}
          companyId={companyId}
          contactId={selection}
          onSessionExpired={onSessionExpired}
          onClose={close}
          onSaved={save}
        />
      )}
    </Panel>
  )
}
