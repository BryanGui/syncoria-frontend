import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  createAgentSettingsApi,
  type AgentSettings as Settings,
  type AgentSettingsProfile,
} from '../api/internalAssistant'
import { ChatRequestError } from '../api/operatorChat'
import {
  Button,
  FormField,
  Notification,
  SelectInput,
  TextInput,
} from '../components/ui'
import './agentSettings.css'

const capabilityKeys = ['shell', 'workspace', 'python', 'multi_agent'] as const
const effortLabels: Record<string, string> = {
  none: 'Aucun',
  minimal: 'Minimal',
  low: 'Faible',
  medium: 'Moyen',
  high: 'Élevé',
  xhigh: 'Très élevé',
  max: 'Maximum',
  ultra: 'Ultra',
}
function configurationError(reason: unknown): string {
  const status = reason instanceof ChatRequestError ? reason.status : 0
  if (status === 409)
    return 'Les réglages ont été modifiés ailleurs. Vos choix sont conservés. Rechargez les réglages avant de les enregistrer à nouveau.'
  if (status === 422)
    return 'Ces réglages ne sont pas valides pour le runtime connecté. Vérifiez le modèle, son effort et les limites.'
  if (status === 503)
    return 'Le catalogue ou les réglages du runtime sont indisponibles. Vos choix sont conservés.'
  return 'Impossible de charger ou d’enregistrer les réglages. Réessayez.'
}
export function AgentSettings({
  apiBaseUrl,
  onSessionExpired,
}: {
  apiBaseUrl: string | null
  onSessionExpired: () => void
}) {
  const id = useId()
  const api = useMemo(() => createAgentSettingsApi(apiBaseUrl), [apiBaseUrl])
  const [profile, setProfile] = useState<AgentSettingsProfile | null>(null)
  const [draft, setDraft] = useState<Settings | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [revision, setRevision] = useState(0)
  const pending = useRef<AbortController | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    pending.current = controller
    setBusy(true)
    setError(null)
    void api
      .load(controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return
        setProfile(next)
        setDraft(next.settings)
        setConflict(false)
        setSaved(false)
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        if (reason instanceof ChatRequestError && reason.status === 401)
          onSessionExpired()
        setError(configurationError(reason))
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          pending.current = null
          setBusy(false)
        }
      })
    return () => controller.abort()
  }, [api, onSessionExpired, revision])
  useEffect(() => () => pending.current?.abort(), [])
  async function save(reset = false) {
    if (!profile || !draft || pending.current) return
    const controller = new AbortController()
    pending.current = controller
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const next = reset
        ? await api.reset(profile.revision, controller.signal)
        : await api.save(profile.revision, draft, controller.signal)
      if (controller.signal.aborted) return
      setProfile(next)
      setDraft(next.settings)
      setConflict(false)
      setSaved(true)
    } catch (reason) {
      if (controller.signal.aborted) return
      if (reason instanceof ChatRequestError && reason.status === 401)
        onSessionExpired()
      if (reason instanceof ChatRequestError && reason.status === 409) setConflict(true)
      setError(configurationError(reason))
    } finally {
      if (!controller.signal.aborted) {
        pending.current = null
        setBusy(false)
      }
    }
  }
  const model = profile?.catalogue.models.find((entry) => entry.id === draft?.model)
  const validModel =
    model && draft && model.reasoning_efforts.includes(draft.reasoning_effort)
  const supported = (key: string) =>
    profile?.capabilities.find((capability) => capability.id === key)?.supported ===
    true
  const groupSupported = ['shell', 'workspace', 'python'].every(supported)
  function updateDraft(next: Settings) {
    setDraft(next)
    setSaved(false)
  }
  function selectModel(modelId: string) {
    if (!draft || !profile) return
    const next = profile.catalogue.models.find((entry) => entry.id === modelId)
    if (!next || !next.reasoning_efforts.length) return
    // The catalogue supplies the default; a valid user effort is otherwise retained.
    const effort = next.reasoning_efforts.includes(draft.reasoning_effort)
      ? draft.reasoning_effort
      : (next.default_reasoning_effort ?? next.reasoning_efforts[0])
    updateDraft({ ...draft, model: modelId, reasoning_effort: effort })
  }
  return (
    <div className="agent-settings">
      <h3>Réglages de l’agent</h3>
      <p>
        Assistant interne uniquement. Les changements s’appliquent aux prochains tours ;
        un tour commencé conserve ses réglages.
      </p>
      {error && <Notification tone="error">{error}</Notification>}
      {busy && !profile && <p role="status">Chargement des réglages…</p>}
      {!profile || !draft ? (
        !busy && (
          <Button onClick={() => setRevision((value) => value + 1)}>Réessayer</Button>
        )
      ) : (
        <>
          {profile.validation_error && (
            <Notification tone="error">
              La configuration enregistrée n’est plus compatible avec le runtime.
              Choisissez un modèle, un effort et des capacités disponibles avant de
              sauvegarder.
            </Notification>
          )}
          {!profile.catalogue.astra_available && (
            <p className="agent-settings-note">
              Astra indisponible :{' '}
              {profile.catalogue.astra_reason ??
                'Ce modèle n’est pas proposé par le runtime connecté.'}
            </p>
          )}
          {profile.catalogue.preferred_model_id && (
            <p className="agent-settings-note">
              Choix privilégié disponible :{' '}
              {
                profile.catalogue.models.find(
                  (entry) => entry.id === profile.catalogue.preferred_model_id,
                )?.label
              }
              . Votre configuration enregistrée reste inchangée jusqu’à la sauvegarde.
            </p>
          )}
          <form
            aria-label="Réglages de l’agent"
            onSubmit={(event) => {
              event.preventDefault()
              void save()
            }}
          >
            <fieldset disabled={busy}>
              <div className="agent-settings-grid">
                <FormField htmlFor={`${id}-model`} label="Modèle">
                  <SelectInput
                    id={`${id}-model`}
                    value={draft.model}
                    onChange={(event) => selectModel(event.target.value)}
                  >
                    {!model && (
                      <option value={draft.model} disabled>
                        {draft.model} — indisponible
                      </option>
                    )}
                    {profile.catalogue.models.map((entry) => (
                      <option
                        key={entry.id}
                        value={entry.id}
                        disabled={!entry.reasoning_efforts.length}
                      >
                        {entry.label}
                        {entry.id === profile.catalogue.preferred_model_id
                          ? ' — choix privilégié'
                          : ''}
                        {!entry.reasoning_efforts.length
                          ? ' — effort indisponible'
                          : ''}
                      </option>
                    ))}
                  </SelectInput>
                </FormField>
                <FormField htmlFor={`${id}-effort`} label="Effort de raisonnement">
                  <SelectInput
                    id={`${id}-effort`}
                    value={draft.reasoning_effort}
                    onChange={(event) =>
                      updateDraft({ ...draft, reasoning_effort: event.target.value })
                    }
                  >
                    {!model?.reasoning_efforts.includes(draft.reasoning_effort) && (
                      <option value={draft.reasoning_effort} disabled>
                        {draft.reasoning_effort} — indisponible
                      </option>
                    )}
                    {model?.reasoning_efforts.map((effort) => (
                      <option key={effort} value={effort}>
                        {effortLabels[effort] ?? effort}
                      </option>
                    ))}
                  </SelectInput>
                </FormField>
              </div>
              {model?.reasoning_efforts.includes('high') &&
                draft.reasoning_effort !== 'high' && (
                  <Button
                    variant="ghost"
                    onClick={() => updateDraft({ ...draft, reasoning_effort: 'high' })}
                  >
                    Proposer un effort élevé
                  </Button>
                )}
              <h4>Capacités</h4>
              <p className="agent-settings-note">
                Shell, workspace et Python sont liés par la sandbox. PRIVATE et les
                restrictions réseau restent imposés par Syncoria.
              </p>
              {profile.capabilities.map((capability) => {
                const toggleable = capabilityKeys.includes(
                  capability.id as (typeof capabilityKeys)[number],
                )
                const grouped = ['shell', 'workspace', 'python'].includes(capability.id)
                const enabled = toggleable
                  ? draft.capabilities[capability.id as (typeof capabilityKeys)[number]]
                  : capability.id === 'syncoria_mcp' && capability.supported
                return (
                  <label className="cp-chat-capability" key={capability.id}>
                    <input
                      type="checkbox"
                      checked={enabled}
                      disabled={
                        !toggleable ||
                        (!capability.supported && !enabled) ||
                        (grouped && !groupSupported && !enabled)
                      }
                      onChange={(event) =>
                        updateDraft({
                          ...draft,
                          capabilities: grouped
                            ? {
                                ...draft.capabilities,
                                shell: event.target.checked,
                                workspace: event.target.checked,
                                python: event.target.checked,
                              }
                            : {
                                ...draft.capabilities,
                                multi_agent: event.target.checked,
                              },
                        })
                      }
                    />
                    <span>
                      {capability.label}
                      <small>
                        {!capability.supported
                          ? 'Indisponible'
                          : enabled
                            ? 'Activée'
                            : 'Désactivée'}
                        {capability.reason ? ` · ${capability.reason}` : ''}
                        {capability.id === 'syncoria_mcp'
                          ? ' · imposée par la politique'
                          : ''}
                      </small>
                    </span>
                  </label>
                )
              })}
              <h4>MCP autorisés</h4>
              {profile.mcp.length ? (
                <ul>
                  {profile.mcp.map((tool) => (
                    <li key={tool.name}>{tool.name} · lecture seule</li>
                  ))}
                </ul>
              ) : (
                <p>Aucun outil MCP annoncé.</p>
              )}
              <details className="agent-settings-advanced">
                <summary>Réglages avancés</summary>
                <div className="agent-settings-grid">
                  {(
                    [
                      ['mcp_concurrency', 'Concurrence MCP'],
                      ['timeout_seconds', 'Durée maximale du tour (secondes)'],
                      ['tool_budget', 'Budget d’appels MCP'],
                    ] as const
                  ).map(([key, label]) => (
                    <FormField key={key} htmlFor={`${id}-${key}`} label={label}>
                      <TextInput
                        id={`${id}-${key}`}
                        type="number"
                        required
                        min={profile.bounds[key].min}
                        max={profile.bounds[key].max}
                        step={1}
                        value={Number.isNaN(draft[key]) ? '' : draft[key]}
                        onChange={(event) =>
                          updateDraft({
                            ...draft,
                            [key]:
                              event.target.value === ''
                                ? Number.NaN
                                : Number(event.target.value),
                          })
                        }
                      />
                    </FormField>
                  ))}
                </div>
                <p className="agent-settings-note">
                  La concurrence et le budget d’appels MCP sont partagés entre l’agent
                  et ses sous-agents. Ce budget ne couvre pas les commandes natives du
                  shell ou du workspace.
                </p>
              </details>
              <div className="agent-settings-actions">
                <Button
                  type="submit"
                  variant="primary"
                  loading={busy}
                  disabled={!validModel || conflict}
                >
                  Enregistrer les réglages
                </Button>
                <Button
                  disabled={busy || conflict}
                  onClick={() => {
                    void save(true)
                  }}
                >
                  Restaurer les paramètres Syncoria par défaut
                </Button>
              </div>
            </fieldset>
          </form>
          {conflict && (
            <Button disabled={busy} onClick={() => setRevision((value) => value + 1)}>
              Recharger les réglages enregistrés
            </Button>
          )}
          {saved && (
            <Notification tone="success">
              Réglages enregistrés pour les prochains tours.
            </Notification>
          )}
          <p className="agent-settings-note">
            Configuration enregistrée : {profile.settings.model} /{' '}
            {effortLabels[profile.settings.reasoning_effort] ??
              profile.settings.reasoning_effort}
            . La configuration effective de chaque tour figure dans Diagnostic.
          </p>
        </>
      )}
    </div>
  )
}
