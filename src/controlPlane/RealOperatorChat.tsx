import { useEffect, useRef, useState } from 'react'
import { Button } from '../components/ui'
import {
  chatRequest,
  ChatRequestError,
  parseThread,
  parseMessage,
  readChatStream,
  conversationGroups,
  operatorRequest,
  parseCapabilities,
  parseMemoryResults,
  parseDiagnostics,
} from '../api/operatorChat'
import type {
  ChatThread,
  ChatMessage,
  CapabilityProfile,
  MemoryResult,
  ChatDiagnostic,
} from '../api/operatorChat'

export function RealOperatorChat({
  tenantId,
  apiBaseUrl,
  onSessionExpired,
}: {
  tenantId: string
  apiBaseUrl: string | null
  onSessionExpired: () => void
}) {
  const [threads, setThreads] = useState<ChatThread[]>([])
  const [selected, setSelected] = useState<ChatThread | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [before, setBefore] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [activity, setActivity] = useState('')
  const [archives, setArchives] = useState(false)
  const [mobileSidebar, setMobileSidebar] = useState(true)
  const [panel, setPanel] = useState<
    'diagnostic' | 'capabilities' | 'memory' | null
  >(null)
  const [profile, setProfile] = useState<CapabilityProfile | null>(null)
  const [diagnostics, setDiagnostics] = useState<ChatDiagnostic[]>([])
  const [query, setQuery] = useState('')
  const [memoryKind, setMemoryKind] = useState('summary')
  const [memoryContent, setMemoryContent] = useState('')
  const [memorySaved, setMemorySaved] = useState(false)
  const [results, setResults] = useState<MemoryResult[]>([])
  const [rename, setRename] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const controller = useRef<AbortController | null>(null)
  const alive = useRef(true)
  const bottom = useRef<HTMLDivElement>(null)
  const fail = (reason: unknown) => {
    if (!alive.current) return
    setActivity('')
    if (reason instanceof ChatRequestError && reason.status === 401)
      onSessionExpired()
    setError(
      reason instanceof ChatRequestError && reason.status === 409
        ? 'Conversation occupée ou archivée. Rechargez les conversations.'
        : "La réponse n'a pas pu être terminée.",
    )
  }
  const loadThreads = async (archived: boolean, signal?: AbortSignal) => {
    const rows: unknown = await (
      await chatRequest(
        apiBaseUrl,
        tenantId,
        `?status=${archived ? 'archived' : 'active'}`,
        'GET',
        signal,
      )
    ).json()
    if (!Array.isArray(rows) || rows.length > 100)
      throw new Error('invalid_response')
    const parsed = rows.map((row) => parseThread(row, tenantId))
    if (!signal?.aborted && alive.current) {
      setThreads(parsed)
      setSelected(
        (current) =>
          parsed.find((row) => row.thread_id === current?.thread_id) ?? current,
      )
    }
  }
  useEffect(() => {
    alive.current = true
    const load = new AbortController()
    void loadThreads(false, load.signal).catch((reason) => {
      if (!load.signal.aborted) fail(reason)
    })
    return () => {
      alive.current = false
      load.abort()
      controller.current?.abort()
    }
    // Parent keys this component by tenant and origin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, apiBaseUrl])
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'nearest' })
  }, [messages, draft])
  const run = async (operation: (signal: AbortSignal) => Promise<void>) => {
    const request = new AbortController()
    controller.current = request
    setBusy(true)
    setError(null)
    try {
      await operation(request.signal)
    } catch (reason) {
      if (!request.signal.aborted) fail(reason)
    } finally {
      if (alive.current && !request.signal.aborted) {
        setBusy(false)
        setStreaming(false)
        setDraft('')
      }
    }
  }
  const create = () =>
    run(async (signal) => {
      const thread = parseThread(
        await (
          await chatRequest(apiBaseUrl, tenantId, '', 'POST', signal)
        ).json(),
        tenantId,
      )
      if (signal.aborted) return
      setSelected(thread)
      setMobileSidebar(false)
      setMemorySaved(false)
      setMessages([])
      setBefore(null)
      setContent('')
      setActivity('')
      setArchives(false)
      setPanel(null)
      await loadThreads(false, signal)
    })
  const resume = (threadId: string, cursor?: string) =>
    run(async (signal) => {
      if (!cursor) {
        setSelected(null)
        setMessages([])
        setBefore(null)
        setContent('')
        setActivity('')
        setPanel(null)
      }
      const snapshot: unknown = await (
        await chatRequest(
          apiBaseUrl,
          tenantId,
          `/${threadId}${cursor ? `?before=${cursor}` : ''}`,
          'GET',
          signal,
        )
      ).json()
      if (
        !snapshot ||
        typeof snapshot !== 'object' ||
        !('thread' in snapshot) ||
        !('messages' in snapshot) ||
        !('next_before' in snapshot) ||
        !Array.isArray(snapshot.messages) ||
        snapshot.messages.length > 50
      )
        throw new Error('invalid_response')
      const thread = parseThread(snapshot.thread, tenantId)
      if (thread.thread_id !== threadId) throw new Error('invalid_response')
      const parsed = snapshot.messages.map((row) =>
        parseMessage(row, tenantId, threadId),
      )
      if (!(
        snapshot.next_before === null ||
        (typeof snapshot.next_before === 'string' &&
          parsed[0]?.message_id === snapshot.next_before)
      ))
        throw new Error('invalid_response')
      if (signal.aborted) return
      setSelected(thread)
      setMobileSidebar(false)
      setMemorySaved(false)
      setMessages((old) => (cursor ? [...parsed, ...old] : parsed))
      setBefore(snapshot.next_before)
    })
  const send = () =>
    run(async (signal) => {
      if (!selected || selected.status === 'archived' || !content.trim()) return
      const id = selected.thread_id
      setStreaming(true)
      setDraft('')
      setActivity('Analyse…')
      const response = await chatRequest(
        apiBaseUrl,
        tenantId,
        `/${id}/messages`,
        'POST',
        signal,
        content,
      )
      await readChatStream(response, tenantId, id, (event) => {
        if (signal.aborted || !alive.current) return
        if (event.type === 'message_started') {
          setMessages((old) => [...old, event.message])
          setContent('')
        }
        if (event.type === 'assistant_delta')
          setDraft((old) => (old + event.text).slice(0, 16000))
        if (event.type === 'assistant_message') {
          setDraft('')
          setMessages((old) => [...old, event.message])
        }
        if (event.type === 'tool_started')
          setActivity(
            event.tool === 'syncoria_provider_request'
              ? 'Lecture provider…'
              : event.tool === 'syncoria_chat_memory_search'
                ? 'Consultation d’une source…'
                : 'Exécution dans le workspace…',
          )
        if (event.type === 'tool_completed') setActivity('Analyse…')
        if (event.type === 'completed') setActivity('Terminé')
        if (event.type === 'cancelled') {
          setDraft('')
          setActivity('Réponse interrompue')
        }
        if (event.type === 'error') {
          setDraft('')
          setActivity('')
          setError("La réponse n'a pas pu être terminée.")
        }
      })
      await loadThreads(archives, signal)
    })
  const stop = async () => {
    if (!selected) return
    try {
      await chatRequest(
        apiBaseUrl,
        tenantId,
        `/${selected.thread_id}/cancel`,
        'POST',
      )
    } catch (reason) {
      fail(reason)
    }
  }
  const changeThread = (action: 'archive' | 'restore') =>
    run(async (signal) => {
      if (!selected) return
      const changed = parseThread(
        await (
          await chatRequest(
            apiBaseUrl,
            tenantId,
            `/${selected.thread_id}/${action}`,
            'POST',
            signal,
          )
        ).json(),
        tenantId,
      )
      if (
        changed.thread_id !== selected.thread_id ||
        changed.status !== (action === 'archive' ? 'archived' : 'active')
      )
        throw new Error('invalid_response')
      if (signal.aborted) return
      setSelected(changed)
      setContent('')
      await loadThreads(archives, signal)
    })
  const saveTitle = () =>
    run(async (signal) => {
      if (!selected || !rename?.trim()) return
      const changed = parseThread(
        await (
          await chatRequest(
            apiBaseUrl,
            tenantId,
            `/${selected.thread_id}`,
            'PATCH',
            signal,
            { title: rename.trim() },
          )
        ).json(),
        tenantId,
      )
      if (changed.thread_id !== selected.thread_id || signal.aborted) return
      setSelected(changed)
      setRename(null)
      await loadThreads(archives, signal)
    })
  const openPanel = (next: typeof panel) =>
    run(async (signal) => {
      setPanel(next)
      setMobileSidebar(false)
      if (next === 'capabilities')
        setProfile(
          parseCapabilities(
            await operatorRequest(
              apiBaseUrl,
              '/capabilities',
              'GET',
              undefined,
              signal,
            ),
          ),
        )
      if (next === 'diagnostic' && selected)
        setDiagnostics(
          parseDiagnostics(
            await (
              await chatRequest(
                apiBaseUrl,
                tenantId,
                `/${selected.thread_id}/diagnostics`,
                'GET',
                signal,
              )
            ).json(),
          ),
        )
    })
  const updateCapabilities = (id?: string, enabled?: boolean) =>
    run(async (signal) => {
      const enabledFlags = Object.fromEntries(
        ['shell', 'workspace', 'python', 'multi_agent'].map((key) => [
          key,
          profile?.capabilities.find((capability) => capability.id === key)
            ?.enabled ?? false,
        ]),
      )
      if (id === 'shell' || id === 'workspace' || id === 'python')
        Object.assign(enabledFlags, {
          shell: enabled,
          workspace: enabled,
          python: enabled,
        })
      else if (id) enabledFlags[id] = Boolean(enabled)
      const flags = id ? { enabled: enabledFlags } : undefined
      const next = parseCapabilities(
        await operatorRequest(
          apiBaseUrl,
          id ? '/capabilities' : '/capabilities/reset',
          id ? 'PUT' : 'POST',
          flags,
          signal,
        ),
      )
      if (!signal.aborted) setProfile(next)
    })
  const saveMemory = () =>
    run(async (signal) => {
      if (!selected || !memoryContent.trim()) return
      await operatorRequest(
        apiBaseUrl,
        `/tenants/${tenantId}/memory`,
        'POST',
        {
          thread_id: selected.thread_id,
          kind: memoryKind,
          content: memoryContent.trim(),
        },
        signal,
      )
      if (!signal.aborted) {
        setMemoryContent('')
        setMemorySaved(true)
      }
    })
  const search = () =>
    run(async (signal) => {
      const next = parseMemoryResults(
        await operatorRequest(
          apiBaseUrl,
          `/tenants/${tenantId}/memory/search?q=${encodeURIComponent(query)}`,
          'GET',
          undefined,
          signal,
        ),
      )
      if (!signal.aborted) setResults(next)
    })
  return (
    <div className="cp-real-chat">
      <aside
        className={`cp-chat-sidebar ${mobileSidebar ? 'is-mobile-open' : 'is-mobile-closed'}`}
        aria-label="Conversations"
      >
        <Button disabled={busy} onClick={create}>
          Nouveau chat
        </Button>
        <div className="cp-chat-tabs">
          <button
            aria-pressed={!archives}
            disabled={busy}
            onClick={() => {
              setArchives(false)
              void run((signal) => loadThreads(false, signal))
            }}
          >
            Conversations
          </button>
          <button
            aria-pressed={archives}
            disabled={busy}
            onClick={() => {
              setArchives(true)
              void run((signal) => loadThreads(true, signal))
            }}
          >
            Archives
          </button>
        </div>
        <nav
          aria-label={
            archives ? 'Conversations archivées' : 'Conversations récentes'
          }
        >
          {conversationGroups(threads).map((group) => (
            <section key={group.label}>
              <h3>{group.label}</h3>
              {group.threads.map((thread) => (
                <button
                  className={
                    selected?.thread_id === thread.thread_id
                      ? 'is-selected'
                      : ''
                  }
                  aria-current={
                    selected?.thread_id === thread.thread_id
                      ? 'page'
                      : undefined
                  }
                  key={thread.thread_id}
                  disabled={busy}
                  onClick={() => void resume(thread.thread_id)}
                >
                  {thread.title || 'Nouveau chat'}
                  <time>
                    {new Date(thread.updated_at).toLocaleDateString('fr-FR')}
                  </time>
                </button>
              ))}
            </section>
          ))}
          {threads.length === 0 && (
            <p>
              Aucune conversation {archives ? 'archivée' : 'pour le moment'}.
            </p>
          )}
        </nav>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => void openPanel('memory')}
        >
          Rechercher dans la mémoire
        </Button>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => void openPanel('capabilities')}
        >
          Capacités Codex
        </Button>
      </aside>
      <main className="cp-chat-workspace">
        <header className="cp-chat-toolbar">
          <button
            className="cp-chat-mobile-toggle"
            aria-expanded={mobileSidebar}
            onClick={() => setMobileSidebar((open) => !open)}
          >
            Conversations et outils
          </button>
          <h3>{selected?.title || 'Votre espace de travail'}</h3>
          <div>
            {selected && (
              <>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setRename(selected.title || '')}
                >
                  Renommer
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    void changeThread(
                      selected.status === 'active' ? 'archive' : 'restore',
                    )
                  }
                >
                  {selected.status === 'active' ? 'Archiver' : 'Restaurer'}
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              disabled={busy || !selected}
              onClick={() => void openPanel('diagnostic')}
            >
              Diagnostic
            </Button>
          </div>
        </header>
        {rename !== null && (
          <form
            className="cp-chat-rename"
            onSubmit={(event) => {
              event.preventDefault()
              void saveTitle()
            }}
          >
            <label>
              Titre de conversation
              <input
                maxLength={200}
                value={rename}
                onChange={(event) => setRename(event.target.value)}
              />
            </label>
            <Button type="submit" disabled={busy || !rename.trim()}>
              Enregistrer le titre
            </Button>
            <Button variant="ghost" onClick={() => setRename(null)}>
              Annuler
            </Button>
          </form>
        )}
        {panel && (
          <section
            className="cp-chat-detail"
            aria-label={
              panel === 'diagnostic'
                ? 'Diagnostic'
                : panel === 'memory'
                  ? 'Mémoire'
                  : 'Capacités Codex'
            }
          >
            <button className="cp-chat-close" onClick={() => setPanel(null)}>
              Fermer le panneau
            </button>
            {panel === 'diagnostic' && (
              <>
                <h3>Diagnostic des tours</h3>
                <p>Chat tenant privé — accès Web public désactivé</p>
                {diagnostics.length === 0 && <p>Aucun tour enregistré.</p>}
                {diagnostics.map((row) => (
                  <details key={row.correlation_id}>
                    <summary>
                      {new Date(row.created_at).toLocaleString('fr-FR')} ·{' '}
                      {row.status}
                    </summary>
                    <dl>
                      <dt>Correlation ID</dt>
                      <dd>{row.correlation_id}</dd>
                      <dt>Durée</dt>
                      <dd>{row.duration_ms ?? '—'} ms</dd>
                      {row.snapshot && (
                        <>
                          <dt>Runtime / version</dt>
                          <dd>
                            {row.snapshot.runtime_provider} /{' '}
                            {row.snapshot.runtime_version}
                          </dd>
                          <dt>Modèle / effort</dt>
                          <dd>
                            {row.snapshot.model} /{' '}
                            {row.snapshot.reasoning_effort}
                          </dd>
                          <dt>Capacités actives</dt>
                          <dd>
                            {Object.entries(row.snapshot.capabilities)
                              .filter(([, enabled]) => enabled)
                              .map(([id]) => id)
                              .join(', ') || 'Aucune'}
                          </dd>
                          <dt>MCP autorisés</dt>
                          <dd>{row.snapshot.mcp.join(', ')}</dd>
                          <dt>Sandbox / privacy / réseau</dt>
                          <dd>
                            {row.snapshot.sandbox} / {row.snapshot.privacy} /{' '}
                            {row.snapshot.network}
                          </dd>
                          <dt>Horodatage du snapshot</dt>
                          <dd>
                            {new Date(row.snapshot.timestamp).toLocaleString(
                              'fr-FR',
                            )}
                          </dd>
                          <dt>Version de politique</dt>
                          <dd>{row.snapshot.policy_version}</dd>
                          <dt>Configuration</dt>
                          <dd>{row.snapshot.config_hash}</dd>
                        </>
                      )}
                      <dt>Tools utilisés</dt>
                      <dd>
                        {row.tools
                          .map((tool) => `${tool.label} (${tool.status})`)
                          .join(', ') || 'Aucun'}
                      </dd>
                    </dl>
                  </details>
                ))}
              </>
            )}
            {panel === 'capabilities' && (
              <>
                <h3>Profil global Codex</h3>
                <p>
                  Ces paramètres s’appliquent aux prochains tours de tous les
                  tenants. Les protections Syncoria restent imposées par les
                  services.
                </p>
                {profile?.capabilities.map((capability) => (
                  <label className="cp-chat-capability" key={capability.id}>
                    <input
                      type="checkbox"
                      checked={capability.enabled}
                      disabled={
                        busy ||
                        !capability.supported ||
                        ![
                          'shell',
                          'workspace',
                          'python',
                          'multi_agent',
                        ].includes(capability.id)
                      }
                      onChange={(event) =>
                        void updateCapabilities(
                          capability.id,
                          event.target.checked,
                        )
                      }
                    />
                    <span>
                      {capability.label}
                      <small>
                        {!capability.supported
                          ? 'Indisponible'
                          : capability.enabled
                            ? 'Activée'
                            : 'Désactivée'}
                        {capability.reason ? ` · ${capability.reason}` : ''}
                      </small>
                    </span>
                  </label>
                ))}
                <Button
                  disabled={busy}
                  onClick={() => void updateCapabilities()}
                >
                  Restaurer les paramètres Syncoria par défaut
                </Button>
              </>
            )}
            {panel === 'memory' && (
              <>
                <h3>Mémoire du tenant</h3>
                {selected && (
                  <form
                    className="cp-memory-create"
                    onSubmit={(event) => {
                      event.preventDefault()
                      void saveMemory()
                    }}
                  >
                    <label>
                      Type de mémoire
                      <select
                        value={memoryKind}
                        onChange={(event) => setMemoryKind(event.target.value)}
                      >
                        {Object.entries({
                          summary: 'Résumé durable',
                          decision: 'Décision',
                          next_action: 'Prochaine action',
                          incident: 'Incident',
                          cause: 'Cause',
                          resolution: 'Résolution',
                        }).map(([id, label]) => (
                          <option key={id} value={id}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Élément à mémoriser
                      <textarea
                        rows={3}
                        maxLength={4000}
                        value={memoryContent}
                        onChange={(event) => {
                          setMemoryContent(event.target.value)
                          setMemorySaved(false)
                        }}
                      />
                    </label>
                    <Button
                      type="submit"
                      disabled={busy || !memoryContent.trim()}
                    >
                      Enregistrer dans la mémoire
                    </Button>
                    {memorySaved && <p>Élément enregistré pour ce tenant.</p>}
                  </form>
                )}
                <form
                  onSubmit={(event) => {
                    event.preventDefault()
                    void search()
                  }}
                >
                  <label>
                    Rechercher un problème similaire
                    <input
                      value={query}
                      maxLength={1000}
                      placeholder="Avons-nous déjà rencontré un problème similaire ?"
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </label>
                  <Button type="submit" disabled={busy || !query.trim()}>
                    Rechercher
                  </Button>
                </form>
                {results.map((result, index) => (
                  <article key={`${result.thread_id}:${index}`}>
                    <strong>
                      {result.title || 'Conversation'}
                      {result.archived ? ' · Archivée' : ''}
                    </strong>
                    <small>{result.kind}</small>
                    <p>{result.content}</p>
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void resume(result.thread_id)}
                    >
                      Consulter la conversation
                    </Button>
                  </article>
                ))}
              </>
            )}
          </section>
        )}
        <div className="cp-chat-scroll">
          <div
            className="cp-chat-messages"
            aria-label="Historique de conversation"
            aria-live="polite"
          >
            {!selected && (
              <div className="cp-chat-welcome">
                <span aria-hidden="true">◇</span>
                <h3>Comment puis-je vous aider ?</h3>
                <p>
                  Explorez un problème, préparez une décision ou retrouvez une
                  résolution passée.
                </p>
                <Button disabled={busy} onClick={create}>
                  Commencer une conversation
                </Button>
              </div>
            )}
            {before && (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  selected && void resume(selected.thread_id, before)
                }
              >
                Messages précédents
              </Button>
            )}
            {messages
              .filter((message) => message.role !== 'system_event')
              .map((message) => (
                <article
                  className={`cp-chat-message cp-chat-message--${message.role}`}
                  key={message.message_id}
                >
                  <strong>{message.role === 'user' ? 'Vous' : 'Codex'}</strong>
                  <p>{message.content}</p>
                </article>
              ))}
            {draft && (
              <article className="cp-chat-message cp-chat-message--assistant">
                <strong>Codex</strong>
                <p>{draft}</p>
              </article>
            )}
            <div ref={bottom} />
          </div>
        </div>
        <footer className="cp-chat-composer">
          <p className="cp-chat-activity" role="status">
            {activity}
          </p>
          {error && <p role="alert">{error}</p>}
          {selected?.status === 'archived' && (
            <p>Conversation archivée · consultation en lecture seule.</p>
          )}
          <label className="sr-only" htmlFor="chat-message">
            Message opérateur
          </label>
          <textarea
            id="chat-message"
            rows={3}
            maxLength={4000}
            placeholder={
              selected?.status === 'archived'
                ? 'Restaurez cette conversation pour continuer.'
                : 'Écrivez votre message…'
            }
            disabled={busy || !selected || selected.status === 'archived'}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault()
                if (!busy && content.trim()) void send()
              }
            }}
          />
          <div className="cp-chat-composer-actions">
            <small>
              Entrée pour envoyer · Maj + Entrée pour une nouvelle ligne
            </small>
            {streaming ? (
              <Button onClick={() => void stop()}>Stop</Button>
            ) : (
              <Button
                variant="primary"
                disabled={
                  busy ||
                  !selected ||
                  selected.status === 'archived' ||
                  !content.trim()
                }
                onClick={() => void send()}
              >
                Envoyer
              </Button>
            )}
          </div>
        </footer>
      </main>
    </div>
  )
}
