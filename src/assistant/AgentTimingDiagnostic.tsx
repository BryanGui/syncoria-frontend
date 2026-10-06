import type { InternalChatDiagnostic } from '../api/internalAssistant'
export function AgentTimingDiagnostic({
  diagnostic,
}: {
  diagnostic: InternalChatDiagnostic
}) {
  const mcpCalls = diagnostic.timings?.mcp_calls ?? []
  const maximum = (
    key: 'queue_wait_ms' | 'execution_ms' | 'duration_ms' | 'active',
  ) => {
    const values = mcpCalls
      .map((call) => call[key])
      .filter((value): value is number => value !== null)
    return values.length ? Math.max(...values) : '—'
  }
  return (
    <>
      {diagnostic.chosen_settings && (
        <>
          <dt>Configuration choisie</dt>
          <dd>
            {diagnostic.chosen_settings.model} /{' '}
            {diagnostic.chosen_settings.reasoning_effort} · concurrence MCP{' '}
            {diagnostic.chosen_settings.mcp_concurrency} · budget{' '}
            {diagnostic.chosen_settings.tool_budget} · durée maximale{' '}
            {diagnostic.chosen_settings.timeout_seconds} s
          </dd>
        </>
      )}
      {diagnostic.snapshot && (
        <>
          <dt>Configuration effective</dt>
          <dd>
            {diagnostic.snapshot.model} / {diagnostic.snapshot.reasoning_effort}
          </dd>
        </>
      )}
      {diagnostic.timings && (
        <>
          <dt>Mesures du tour</dt>
          <dd>
            <table className="agent-diagnostic-table" aria-label="Mesures du tour">
              <thead>
                <tr>
                  <th>Étape</th>
                  <th>Depuis la requête (ms)</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ['runtime_ready_ms', 'Runtime prêt'],
                    ['mcp_ready_ms', 'MCP prêt'],
                    ['context_ready_ms', 'Contexte prêt'],
                    ['first_event_ms', 'Premier événement'],
                    ['first_text_ms', 'Premier texte'],
                    ['final_response_ms', 'Réponse finale'],
                  ] as const
                ).map(([key, label]) => (
                  <tr key={key}>
                    <th scope="row">{label}</th>
                    <td>{diagnostic.timings![key] ?? '—'}</td>
                  </tr>
                ))}
                <tr>
                  <th scope="row">Attente worker (durée)</th>
                  <td>{diagnostic.timings.worker_wait_ms ?? '—'}</td>
                </tr>
              </tbody>
            </table>
            {diagnostic.timings.tools.length > 0 && (
              <table className="agent-diagnostic-table" aria-label="Mesures des outils">
                <thead>
                  <tr>
                    <th>Outil</th>
                    <th>Phase</th>
                    <th>Depuis la requête (ms)</th>
                  </tr>
                </thead>
                <tbody>
                  {diagnostic.timings.tools.map((tool, index) => (
                    <tr key={`${tool.tool}:${index}`}>
                      <td>{tool.tool}</td>
                      <td>{tool.phase === 'started' ? 'Début' : 'Fin'}</td>
                      <td>{tool.at_ms}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {mcpCalls.length > 0 && (
              <table className="agent-diagnostic-table" aria-label="Mesures MCP">
                <thead>
                  <tr>
                    <th>Mesure</th>
                    <th>Maximum observé</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">Attente en file MCP</th>
                    <td>{maximum('queue_wait_ms')} ms</td>
                  </tr>
                  <tr>
                    <th scope="row">Exécution service MCP</th>
                    <td>{maximum('execution_ms')} ms</td>
                  </tr>
                  <tr>
                    <th scope="row">Initialisation connexion MCP enfant</th>
                    <td>{maximum('duration_ms')} ms</td>
                  </tr>
                  <tr>
                    <th scope="row">Appels MCP actifs</th>
                    <td>{maximum('active')}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </dd>
          <dt>Requête reçue</dt>
          <dd>
            {new Date(diagnostic.timings.request_received_at).toLocaleString('fr-FR')}
          </dd>
        </>
      )}
    </>
  )
}
