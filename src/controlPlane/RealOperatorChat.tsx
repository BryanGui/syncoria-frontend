import { useEffect, useRef, useState } from 'react'
import { Button, FormField, SelectInput, TextareaInput } from '../components/ui'
import {
  chatRequest,
  ChatRequestError,
  parseThread,
  parseMessage,
  readChatStream,
} from '../api/operatorChat'
import type { ChatThread, ChatMessage } from '../api/operatorChat'

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
  const [current, setCurrent] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [before, setBefore] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const [activity, setActivity] = useState('')
  const [privacy, setPrivacy] = useState('')
  const [context, setContext] = useState(
    'Contexte reconstruit à chaque envoi : dossier conseil et parc IA.',
  )
  const [error, setError] = useState<string | null>(null)
  const controller = useRef<AbortController | null>(null)
  const alive = useRef(true)
  const fail = (reason: unknown) => {
    if (!alive.current) return
    if (reason instanceof ChatRequestError && reason.status === 401)
      onSessionExpired()
    setError(
      reason instanceof ChatRequestError && reason.status === 409
        ? 'Conversation occupée ou archivée. Rechargez les conversations.'
        : "La réponse n'a pas pu être terminée.",
    )
  }
  useEffect(() => {
    alive.current = true
    const load = new AbortController()
    void chatRequest(apiBaseUrl, tenantId, '', 'GET', load.signal)
      .then((r) => r.json())
      .then((rows: unknown) => {
        if (!Array.isArray(rows) || rows.length > 20)
          throw new Error('invalid_response')
        const parsed = rows.map((row) => parseThread(row, tenantId))
        if (!load.signal.aborted) setThreads(parsed)
      })
      .catch((reason) => {
        if (!load.signal.aborted) fail(reason)
      })
    return () => {
      alive.current = false
      load.abort()
      controller.current?.abort()
    }
    // Component is keyed by tenant and API origin in its parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, apiBaseUrl])
  const run = async (operation: (signal: AbortSignal) => Promise<void>) => {
    controller.current?.abort()
    const request = new AbortController()
    controller.current = request
    setBusy(true)
    setError(null)
    try {
      await operation(request.signal)
    } catch (reason) {
      if (!request.signal.aborted) fail(reason)
    } finally {
      if (alive.current && !request.signal.aborted) setBusy(false)
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
      setThreads((rows) =>
        [
          thread,
          ...rows.filter((row) => row.thread_id !== thread.thread_id),
        ].slice(0, 20),
      )
      setCurrent(thread.thread_id)
      setContent('')
      setMessages([])
      setBefore(null)
      setActivity('')
      setPrivacy('')
    })
  const resume = (threadId: string, cursor?: string) =>
    run(async (signal) => {
      if (!cursor) {
        setCurrent(null)
        setMessages([])
        setBefore(null)
        setContent('')
        setActivity('')
        setPrivacy('')
      }
      if (!threadId) return
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
        !Array.isArray(snapshot.messages)
      )
        throw new Error('invalid_response')
      const thread = parseThread(snapshot.thread, tenantId)
      if (
        thread.thread_id !== threadId ||
        thread.status !== 'active' ||
        snapshot.messages.length > 50
      )
        throw new Error('invalid_response')
      const parsed = snapshot.messages.map((row) =>
        parseMessage(row, tenantId, threadId),
      )
      if (
        !(
          snapshot.next_before === null ||
          (typeof snapshot.next_before === 'string' &&
            parsed[0]?.message_id === snapshot.next_before)
        )
      )
        throw new Error('invalid_response')
      if (signal.aborted) return
      setCurrent(threadId)
      setMessages((old) => (cursor ? [...parsed, ...old] : parsed))
      setBefore(snapshot.next_before)
    })
  const send = () =>
    run(async (signal) => {
      if (!current || !content.trim()) return
      const text = content
      setActivity('Analyse en cours…')
      setPrivacy('')
      const response = await chatRequest(
        apiBaseUrl,
        tenantId,
        `/${current}/messages`,
        'POST',
        signal,
        text,
      )
      await readChatStream(response, tenantId, current, (event) => {
        if (signal.aborted || !alive.current) return
        if (event.type === 'message_started') {
          setMessages((old) => [...old, event.message])
          setContent('')
        }
        if (event.type === 'assistant_message')
          setMessages((old) => [...old, event.message])
        if (event.type === 'context_ready')
          setContext(
            `Contexte : dossier conseil · parc IA · ${event.integrations} intégrations disponibles${event.partial ? ' · résumé partiel' : ''}`,
          )
        if (event.type === 'tool_started' || event.type === 'tool_completed')
          setActivity(
            `${event.label} · ${event.status === 'running' ? 'en cours' : event.status === 'completed' ? 'terminé' : 'échec'}`,
          )
        if (event.type === 'privacy_state_changed')
          setPrivacy(
            event.state === 'public'
              ? 'Recherche publique disponible'
              : 'Session privée — accès Web public désactivé',
          )
        if (event.type === 'completed') setActivity('Terminé')
        if (event.type === 'cancelled') setActivity('Réponse interrompue')
        if (event.type === 'error') {
          setActivity('')
          setError("La réponse n'a pas pu être terminée.")
        }
      })
    })
  const stop = async () => {
    if (!current) return
    try {
      await chatRequest(apiBaseUrl, tenantId, `/${current}/cancel`, 'POST')
    } catch (reason) {
      fail(reason)
    }
  }
  const archive = () =>
    run(async (signal) => {
      if (!current) return
      const archived = parseThread(
        await (
          await chatRequest(
            apiBaseUrl,
            tenantId,
            `/${current}/archive`,
            'POST',
            signal,
          )
        ).json(),
        tenantId,
      )
      if (archived.thread_id !== current || archived.status !== 'archived')
        throw new Error('invalid_response')
      if (!signal.aborted) {
        setThreads((old) => old.filter((row) => row.thread_id !== current))
        setCurrent(null)
        setMessages([])
        setBefore(null)
        setActivity('')
        setPrivacy('')
      }
    })
  return (
    <div className="cp-real-chat">
      <div className="cp-chat-actions">
        <Button disabled={busy} onClick={create}>
          Nouveau chat
        </Button>
        <Button variant="ghost" disabled={busy || !current} onClick={archive}>
          Archiver
        </Button>
      </div>
      <FormField htmlFor="chat-thread" label="Conversations récentes">
        <SelectInput
          id="chat-thread"
          disabled={busy}
          value={current ?? ''}
          onChange={(event) => void resume(event.target.value)}
        >
          <option value="">Sélectionner une conversation</option>
          {threads.map((thread, index) => (
            <option key={thread.thread_id} value={thread.thread_id}>
              {thread.title ?? `Conversation ${index + 1}`} ·{' '}
              {new Date(thread.updated_at).toLocaleString('fr-FR')}
            </option>
          ))}
        </SelectInput>
      </FormField>
      <p className="cp-note">{context}</p>
      {before && (
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => current && void resume(current, before)}
        >
          Messages précédents
        </Button>
      )}
      <div
        className="cp-chat-messages"
        aria-label="Historique de conversation"
        aria-live="polite"
      >
        {messages.map((message) => (
          <article key={message.message_id}>
            <strong>
              {message.role === 'user'
                ? 'Opérateur'
                : message.role === 'assistant'
                  ? 'Assistant'
                  : 'Événement'}
            </strong>
            <p>{message.content}</p>
          </article>
        ))}
      </div>
      <p role="status">{activity}</p>
      {privacy && <p>{privacy}</p>}
      {error && <p role="alert">{error}</p>}
      <FormField
        htmlFor="chat-message"
        label="Message opérateur"
        hint="Conseil et explorations en lecture seule. Ne saisissez aucun credential."
      >
        <TextareaInput
          id="chat-message"
          rows={3}
          maxLength={4000}
          disabled={busy || !current}
          value={content}
          onChange={(event) => setContent(event.target.value)}
        />
      </FormField>
      <div className="cp-chat-actions">
        <Button
          variant="primary"
          disabled={busy || !current || !content.trim()}
          onClick={send}
        >
          Envoyer
        </Button>
        {busy && current && <Button onClick={() => void stop()}>Stop</Button>}
      </div>
    </div>
  )
}
