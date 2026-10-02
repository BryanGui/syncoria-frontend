import { useEffect, useState } from 'react'
import { estateCollections, fetchTenantEstate } from '../api/controlPlaneEstate'
import type { EstateResult, EstateRecord } from '../api/controlPlaneEstate'
const titles = [
  'Identités du tenant',
  'Groupes',
  'Appartenances aux groupes',
  'Comptes fournisseur',
  'Licences',
  'Agents & automatisations',
  'Permissions observées',
  'Mesures agrégées',
  'États qualitatifs',
]
function describe(record: EstateRecord): string {
  const fields = [
    'display_name',
    'name',
    'provider',
    'external_user_id',
    'external_license_id',
    'plan',
    'subject_type',
    'subject_ref',
    'resource',
    'action',
    'policy',
    'kind',
    'state',
    'status',
  ]
  const entries: [string, unknown][] = Object.entries(record)
  const parts = fields.flatMap((field) => {
    const value = entries.find(([key]) => key === field)?.[1]
    return typeof value === 'string' ? [value] : []
  })
  if (
    'value' in record &&
    typeof record.value === 'number' &&
    'unit' in record &&
    typeof record.unit === 'string'
  )
    parts.push(`${record.value} ${record.unit}`)
  return (
    parts.join(' · ') ||
    ('identity_id' in record && 'group_id' in record
      ? `${record.identity_id} → ${record.group_id}`
      : 'Observation disponible')
  )
}
export function RealTenantEstate({
  tenantId,
  apiBaseUrl,
  onSessionExpired,
}: {
  tenantId: string
  apiBaseUrl: string | null
  onSessionExpired: () => void
}) {
  const [snapshot, setSnapshot] = useState<{
    tenantId: string
    apiBaseUrl: string | null
    result: EstateResult
  } | null>(null)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    void fetchTenantEstate(apiBaseUrl, tenantId, controller.signal).then(
      (result) => {
        if (controller.signal.aborted) return
        if (result.status === 'unauthenticated') onSessionExpired()
        setSnapshot({ tenantId, apiBaseUrl, result })
      },
    )
    return () => controller.abort()
  }, [tenantId, apiBaseUrl, onSessionExpired, reload])
  const result =
    snapshot?.tenantId === tenantId && snapshot.apiBaseUrl === apiBaseUrl
      ? snapshot.result
      : null
  if (!result)
    return (
      <section className="cp-panel">
        <p>Chargement du parc IA…</p>
      </section>
    )
  if (result.status !== 'loaded')
    return (
      <section className="cp-panel">
        <h2>Parc IA indisponible</h2>
        <p>Aucune donnée de démonstration ne remplace le registre réel.</p>
        <button
          onClick={() => {
            setSnapshot(null)
            setReload((value) => value + 1)
          }}
        >
          Réessayer
        </button>
      </section>
    )
  return (
    <section className="cp-panel">
      <h2>Parc IA du tenant</h2>
      <p>
        Lecture du registre :{' '}
        {new Date(result.estate.read_at).toLocaleString('fr-FR')}. Cette date ne
        représente pas la fraîcheur des observations.
      </p>
      {estateCollections.map((collection, index) => (
        <details key={collection} open={index === 0}>
          <summary>{titles[index]}</summary>
          {!result.estate[collection].length ? (
            <p>Non connecté / non évalué — aucune observation disponible.</p>
          ) : (
            result.estate[collection].map((record, recordIndex) => (
              <article key={recordIndex}>
                <p>{describe(record)}</p>
                <small>
                  Provenance : {record.provenance} · Observation :{' '}
                  {record.observed_at
                    ? new Date(record.observed_at).toLocaleString('fr-FR')
                    : 'Non renseignée'}
                </small>
              </article>
            ))
          )}
        </details>
      ))}
      <p>
        Les permissions sont des observations ; elles n’autorisent aucune
        action. Chat opérateur accessible depuis le cockpit.
      </p>
    </section>
  )
}
