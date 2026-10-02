import { Button, Panel } from '../components/ui'
import { useEffect, useRef, useState } from 'react'
import {
  advisorySpecs,
  fetchAdvisoryDossier,
  saveAdvisoryRecord,
} from '../api/advisory'
import type {
  AdvisoryCollection as Collection,
  AdvisoryDossier,
  AdvisoryRecord,
  AdvisoryResource,
  AdvisoryResult,
  AdvisoryValue,
} from '../api/advisory'
import { RealTenantEstate } from './RealTenantEstate'
import { AdvisoryEditor } from './AdvisoryEditor'
import { AdvisoryCollection } from './AdvisoryCollection'
import { advisoryLabel } from './advisoryLabels'
import './advisory.css'
type View = 'overview' | 'opportunities' | 'engagements' | 'followup' | 'estate'
const views: [View, string][] = [
  ['overview', 'Vue conseil'],
  ['opportunities', 'Opportunités'],
  ['engagements', 'Réalisations'],
  ['followup', 'Suivi'],
  ['estate', 'Parc IA'],
]
const messages = {
  unavailable: 'Dossier conseil indisponible. Réessayez.',
  invalid:
    'Vérifiez les champs, les dates, les liens et l’URL HTTPS sans paramètres ni fragment.',
  archived: 'Tenant archivé : le dossier ne peut pas être modifié.',
  not_found: 'Tenant ou élément introuvable.',
  unauthenticated: 'Session expirée.',
}
export function RealTenantAdvisory({
  tenantId,
  apiBaseUrl,
  onSessionExpired,
}: {
  tenantId: string
  apiBaseUrl: string | null
  onSessionExpired: () => void
}) {
  const [view, setView] = useState<View>('overview')
  const [snapshot, setSnapshot] = useState<{
    tenantId: string
    apiBaseUrl: string | null
    result: AdvisoryResult<AdvisoryDossier>
  } | null>(null)
  const [reload, setReload] = useState(0)
  const [editor, setEditor] = useState<{
    resource: AdvisoryResource
    record: AdvisoryRecord | null
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [writeError, setWriteError] = useState<string | null>(null)
  const mutation = useRef<AbortController | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    void fetchAdvisoryDossier(apiBaseUrl, tenantId, controller.signal).then(
      (result) => {
        if (controller.signal.aborted) return
        if (result.status === 'unauthenticated') onSessionExpired()
        setSnapshot({ tenantId, apiBaseUrl, result })
      },
    )
    return () => {
      controller.abort()
      mutation.current?.abort()
    }
  }, [tenantId, apiBaseUrl, onSessionExpired, reload])
  const result =
    snapshot?.tenantId === tenantId && snapshot.apiBaseUrl === apiBaseUrl
      ? snapshot.result
      : null
  const dossier = result?.status === 'loaded' ? result.data : null
  const edit = (resource: AdvisoryResource, record: AdvisoryRecord | null) => {
    if (busy) return
    setWriteError(null)
    setEditor({ resource, record })
  }
  const save = async (payload: Record<string, AdvisoryValue>) => {
    if (!editor || busy) return
    mutation.current?.abort()
    const controller = new AbortController()
    mutation.current = controller
    setBusy(true)
    setWriteError(null)
    const id = advisorySpecs[editor.resource].id
    const identifier =
      editor.record && id ? String(editor.record[id]) : undefined
    const saved = await saveAdvisoryRecord(
      apiBaseUrl,
      tenantId,
      editor.resource,
      payload,
      identifier,
      controller.signal,
    )
    if (controller.signal.aborted) return
    setBusy(false)
    if (saved.status === 'unauthenticated') {
      onSessionExpired()
      return
    }
    if (saved.status !== 'loaded') {
      setWriteError(messages[saved.status])
      return
    }
    setEditor(null)
    setSnapshot(null)
    setReload((value) => value + 1)
  }
  const collection = (key: Collection, rows = dossier?.[key] ?? []) =>
    dossier && (
      <AdvisoryCollection
        key={key}
        collection={key}
        rows={rows}
        dossier={dossier}
        onEdit={edit}
        compact={view === 'overview'}
        onViewAll={
          view === 'overview'
            ? () => {
                setEditor(null)
                setView(
                  key === 'contacts' || key === 'actions'
                    ? 'followup'
                    : key === 'engagements'
                      ? 'engagements'
                      : 'opportunities',
                )
              }
            : undefined
        }
      />
    )
  return (
    <div className="advisory-dossier">
      <nav className="advisory-navigation" aria-label="Dossier conseil">
        {views.map(([key, label]) => (
          <Button
            size="compact"
            key={key}
            variant={view === key ? 'primary' : 'secondary'}
            aria-current={view === key ? 'page' : undefined}
            onClick={() => {
              if (busy) return
              setEditor(null)
              setWriteError(null)
              setView(key)
            }}
            disabled={busy}
          >
            {label}
          </Button>
        ))}
      </nav>
      {view === 'estate' ? (
        <>
          <RealTenantEstate
            tenantId={tenantId}
            apiBaseUrl={apiBaseUrl}
            onSessionExpired={onSessionExpired}
          />
          {collection('provider_access')}
        </>
      ) : !result ? (
        <Panel className="cp-panel">
          <p role="status">Chargement du dossier conseil…</p>
        </Panel>
      ) : !dossier ? (
        <Panel className="cp-panel">
          <h2>Dossier conseil indisponible</h2>
          <p role="alert">{messages[result.status as keyof typeof messages]}</p>
          <Button
            size="compact"
            onClick={() => {
              setSnapshot(null)
              setReload((value) => value + 1)
            }}
          >
            Réessayer
          </Button>
        </Panel>
      ) : (
        <>
          {editor && (
            <AdvisoryEditor
              key={`${editor.resource}:${editor.record?.[advisorySpecs[editor.resource].id ?? 'tenant_id'] ?? 'new'}`}
              {...editor}
              dossier={dossier}
              busy={busy}
              error={writeError}
              onCancel={() => setEditor(null)}
              onSave={(payload) => {
                void save(payload)
              }}
            />
          )}
          {view === 'overview' && (
            <>
              <Panel className="cp-panel">
                <div className="cp-panel-heading">
                  <h2>Comprendre l’entreprise</h2>
                  <Button
                    size="compact"
                    onClick={() => edit('profile', dossier.profile)}
                  >
                    {dossier.profile
                      ? 'Modifier le profil'
                      : 'Renseigner le profil'}
                  </Button>
                </div>
                {dossier.profile ? (
                  <dl className="advisory-facts advisory-profile-facts">
                    {advisorySpecs.profile.fields.map((field) => (
                      <div key={field.key}>
                        <dt>{field.label}</dt>
                        <dd>
                          {String(
                            dossier.profile?.[field.key] ?? 'Non renseigné',
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p>Le contexte de cette entreprise reste à renseigner.</p>
                )}
              </Panel>
              <div className="advisory-grid">
                {collection(
                  'contacts',
                  dossier.contacts
                    .filter((row) => row.active)
                    .sort(
                      (a, b) =>
                        Number(b.contact_type === 'ai_referent') -
                        Number(a.contact_type === 'ai_referent'),
                    )
                    .slice(0, 3),
                )}
                {collection(
                  'needs',
                  dossier.needs
                    .filter((row) =>
                      ['identified', 'exploring'].includes(String(row.status)),
                    )
                    .slice(0, 3),
                )}
              </div>
              <div className="advisory-grid">
                {collection(
                  'opportunities',
                  dossier.opportunities
                    .filter(
                      (row) =>
                        row.priority === 'high' &&
                        !['rejected', 'implemented'].includes(
                          String(row.status),
                        ),
                    )
                    .slice(0, 3),
                )}
                {collection(
                  'actions',
                  dossier.actions
                    .filter(
                      (row) =>
                        !['completed', 'cancelled'].includes(
                          String(row.status),
                        ),
                    )
                    .sort(
                      (a, b) =>
                        (a.due_at ? Date.parse(String(a.due_at)) : Infinity) -
                        (b.due_at ? Date.parse(String(b.due_at)) : Infinity),
                    )
                    .slice(0, 3),
                )}
              </div>
              <div className="advisory-grid">
                {collection('decisions', dossier.decisions.slice(0, 3))}
                {collection('engagements', dossier.engagements.slice(0, 3))}
              </div>
            </>
          )}
          {view === 'opportunities' && (
            <>
              {collection('needs')}
              {collection('opportunities')}
              {collection('decisions')}
            </>
          )}
          {view === 'engagements' && collection('engagements')}
          {view === 'followup' && (
            <>
              {collection('actions')}
              {collection('contacts')}
              <Panel className="cp-panel">
                <h2>Historique du conseil</h2>
                {!dossier.recent_timeline.length && (
                  <p>Aucun jalon renseigné.</p>
                )}
                <ol className="advisory-timeline">
                  {dossier.recent_timeline.map((entry) => (
                    <li key={`${entry.resource_id}:${entry.event}`}>
                      <time>{new Date(entry.at).toLocaleString('fr-FR')}</time>
                      <div>
                        <strong>{advisoryLabel(entry.event)}</strong>
                        <p>{entry.title}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </Panel>
            </>
          )}
        </>
      )}
      {view === 'estate' && editor && dossier && (
        <AdvisoryEditor
          key={`${editor.resource}:${editor.record?.access_reference_id ?? 'new'}`}
          {...editor}
          dossier={dossier}
          busy={busy}
          error={writeError}
          onCancel={() => setEditor(null)}
          onSave={(payload) => {
            void save(payload)
          }}
        />
      )}
    </div>
  )
}
