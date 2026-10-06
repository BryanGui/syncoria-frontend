import { useEffect, useRef, type ReactNode } from 'react'
import { Button } from '../components/ui'
import { PROSPECT_STATUS_LABELS, type Company, type Contact } from './model'

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <td role="cell">
      <span className="prospecting-cell-label" aria-hidden="true">{label}</span>
      <div>{children}</div>
    </td>
  )
}

export function CompanyTable({
  companies,
  openCompany,
}: {
  companies: Company[]
  openCompany: (id: string) => void
}) {
  return (
    <table className="prospecting-table" role="table" aria-label="Entreprises prospectées">
      <thead role="rowgroup">
        <tr role="row">
          {['Entreprise', 'Ville', 'Secteur', 'Statut', 'Source', 'Dernière mise à jour'].map((label) => (
            <th key={label} scope="col" role="columnheader">{label}</th>
          ))}
        </tr>
      </thead>
      <tbody role="rowgroup">
        {companies.map((company) => (
          <tr key={company.id} role="row">
            <th scope="row" role="rowheader">
              <button className="cp-text-button" onClick={() => openCompany(company.id)}>
                {company.name}
              </button>
            </th>
            <Cell label="Ville">{company.city ?? 'Non renseignée'}</Cell>
            <Cell label="Secteur">{company.sector ?? 'Non renseigné'}</Cell>
            <Cell label="Statut">
              <span className="prospecting-status">{PROSPECT_STATUS_LABELS[company.status]}</span>
            </Cell>
            <Cell label="Source">{company.source ?? 'Non renseignée'}</Cell>
            <Cell label="Dernière mise à jour">
              <time dateTime={company.updated_at}>
                {new Date(company.updated_at).toLocaleString('fr-FR', {
                  dateStyle: 'short', timeStyle: 'short',
                })}
              </time>
            </Cell>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function ContactTable({
  contacts,
  savedId,
  editContact,
}: {
  contacts: Contact[]
  savedId?: string
  editContact: (id: string) => void
}) {
  const savedRow = useRef<HTMLTableRowElement | null>(null)
  useEffect(() => {
    savedRow.current?.focus()
  }, [savedId])
  return (
    <table className="prospecting-table" role="table" aria-label="Contacts de l’entreprise">
      <thead role="rowgroup">
        <tr role="row">
          {['Nom', 'Rôle', 'Email', 'Téléphone', 'LinkedIn', 'Modifier'].map((label) => (
            <th key={label} scope="col" role="columnheader">{label}</th>
          ))}
        </tr>
      </thead>
      <tbody role="rowgroup">
        {contacts.map((contact) => {
          const name = `${contact.first_name} ${contact.last_name}`
          return (
            <tr
              key={contact.id}
              role="row"
              ref={contact.id === savedId ? savedRow : undefined}
              tabIndex={contact.id === savedId ? -1 : undefined}
              className={contact.id === savedId ? 'prospecting-saved' : undefined}
            >
              <th scope="row" role="rowheader">{name}</th>
              <Cell label="Rôle">{contact.role ?? 'Non renseigné'}</Cell>
              <Cell label="Email">{contact.email ?? 'Non renseigné'}</Cell>
              <Cell label="Téléphone">{contact.phone ?? 'Non renseigné'}</Cell>
              <Cell label="LinkedIn">
                {contact.linkedin_url ? (
                  <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer" aria-label={`Ouvrir le profil LinkedIn de ${name}`}>
                    Ouvrir
                  </a>
                ) : 'Non renseigné'}
              </Cell>
              <Cell label="Modifier">
                <Button size="compact" variant="ghost" onClick={() => editContact(contact.id)} aria-label={`Modifier le contact ${name}`}>
                  Modifier
                </Button>
              </Cell>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
