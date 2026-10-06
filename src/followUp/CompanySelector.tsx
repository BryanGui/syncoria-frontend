import { useCallback, useId, useState } from 'react'
import type { AdminProspectingApi } from '../api/adminProspecting'
import { Button, FormField, TextInput } from '../components/ui'
import type { Company } from '../prospecting/model'
import { LoadError } from '../prospecting/presentation'
import { useProspectingResource } from '../prospecting/state'
import { useDebouncedSearch } from './state'

export function CompanySelector({
  api,
  selected,
  onSelect,
  onSessionExpired,
}: {
  api: AdminProspectingApi
  selected: Company | null
  onSelect: (company: Company | null) => void
  onSessionExpired: () => void
}) {
  const id = useId()
  const [query, setQuery] = useState('')
  const [offset, setOffset] = useState(0)
  const search = useDebouncedSearch(query)
  const load = useCallback(
    (signal: AbortSignal) => api.listCompanies(11, offset, signal, search),
    [api, offset, search],
  )
  const { state, reload } = useProspectingResource(load, onSessionExpired)
  if (selected)
    return (
      <div className="follow-up-subject">
        Entreprise : <strong>{selected.name}</strong>{' '}
        <Button onClick={() => onSelect(null)}>Changer d’entreprise</Button>
      </div>
    )
  return (
    <section aria-label="Choisir une entreprise" className="follow-up-company-selector">
      <FormField htmlFor={id} label="Rechercher une entreprise">
        <TextInput
          id={id}
          type="search"
          maxLength={200}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setOffset(0)
          }}
        />
      </FormField>
      {state.status === 'loading' || search !== query ? (
        <p role="status">Recherche des entreprises…</p>
      ) : state.status !== 'loaded' ? (
        <LoadError status={state.status} retry={reload} />
      ) : (
        <>
          {state.value.length ? (
            <ul>
              {state.value.slice(0, 10).map((company) => (
                <li key={company.id}>
                  <Button variant="ghost" onClick={() => onSelect(company)}>
                    {company.name}
                  </Button>
                  {company.city && <span> · {company.city}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p>Aucune entreprise trouvée.</p>
          )}
          <nav aria-label="Pagination des entreprises" className="follow-up-actions">
            <Button
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - 10))}
            >
              Entreprises précédentes
            </Button>
            <span>Page {offset / 10 + 1}</span>
            <Button
              disabled={state.value.length <= 10}
              onClick={() => setOffset(offset + 10)}
            >
              Entreprises suivantes
            </Button>
          </nav>
        </>
      )}
    </section>
  )
}
