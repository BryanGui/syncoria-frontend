import { Button, Panel } from '../components/ui'
import { advisorySpecs, safeLauncherUrl } from '../api/advisory'
import type {
  AdvisoryCollection as Collection,
  AdvisoryDossier,
  AdvisoryRecord,
} from '../api/advisory'
import { advisoryLabel } from './advisoryLabels'
export function AdvisoryCollection({
  collection,
  rows,
  dossier,
  onEdit,
  compact = false,
  onViewAll,
}: {
  collection: Collection
  rows: AdvisoryRecord[]
  dossier: AdvisoryDossier
  onEdit: (collection: Collection, record: AdvisoryRecord | null) => void
  compact?: boolean
  onViewAll?: () => void
}) {
  const spec = advisorySpecs[collection]
  const summaryFields: Partial<Record<Collection, string[]>> = {
    contacts: ['contact_type', 'role_title'],
    needs: ['description', 'status'],
    opportunities: ['hypothesis', 'priority', 'feasibility'],
    decisions: ['decision', 'rationale'],
    engagements: ['summary', 'status'],
    actions: ['notes', 'owner', 'due_at', 'status'],
  }
  return (
    <Panel className="cp-panel advisory-collection">
      <div className="cp-panel-heading">
        <h2>{spec.label}</h2>
        <Button size="compact" onClick={() => onEdit(collection, null)}>
          Ajouter · {spec.label}
        </Button>
      </div>
      {!rows.length && <p>Aucun élément renseigné.</p>}
      {rows.map((record) => (
        <article className="advisory-card" key={String(record[spec.id!])}>
          <div className="advisory-card-heading">
            <h3>{String(record.title ?? record.name ?? record.label)}</h3>
            <Button
              size="compact"
              variant="ghost"
              aria-label={`Modifier · ${record.title ?? record.name ?? record.label}`}
              onClick={() => onEdit(collection, record)}
            >
              Modifier
            </Button>
          </div>
          <dl className="advisory-facts">
            {spec.fields
              .filter(
                (field) =>
                  !['title', 'name', 'label', 'login_url'].includes(
                    field.key,
                  ) &&
                  (!compact ||
                    summaryFields[collection]?.includes(field.key)) &&
                  record[field.key] !== null &&
                  record[field.key] !== '',
              )
              .map((field) => {
                const value = record[field.key]
                const text =
                  field.type === 'reference'
                    ? (dossier[field.target!].find(
                        (row) =>
                          row[advisorySpecs[field.target!].id!] === value,
                      )?.title ?? 'Référence indisponible')
                    : field.type === 'boolean'
                      ? value
                        ? 'Oui'
                        : 'Non'
                      : field.type === 'date'
                        ? new Date(String(value)).toLocaleString('fr-FR')
                        : field.type === 'enum'
                          ? advisoryLabel(String(value))
                          : String(value)
                return (
                  <div key={field.key}>
                    <dt>{field.label}</dt>
                    <dd>{String(text)}</dd>
                  </div>
                )
              })}
          </dl>
          {collection === 'provider_access' &&
            (record.status === 'active' && safeLauncherUrl(record.login_url) ? (
              <a
                className="advisory-launch"
                href={record.login_url}
                target="_blank"
                rel="noopener noreferrer"
                referrerPolicy="no-referrer"
              >
                Ouvrir · {String(record.label)} ↗
              </a>
            ) : (
              <p>
                {record.status === 'revoked'
                  ? 'Accès révoqué — ouverture désactivée.'
                  : !record.login_url
                    ? 'URL non renseignée.'
                    : 'Accès non actif — ouverture désactivée.'}
              </p>
            ))}
        </article>
      ))}
      {onViewAll && (
        <Button size="compact" variant="ghost" onClick={onViewAll}>
          Voir tout · {spec.label}
        </Button>
      )}
    </Panel>
  )
}
