import test from 'node:test'
import assert from 'node:assert/strict'
import { parseChatEvent, readChatStream, parseThread, chatRequest } from '../src/api/operatorChat.ts'
const tenant='11111111-1111-4111-8111-111111111111',thread='22222222-2222-4222-8222-222222222222'
test('tool and reasoning fields fail closed before DOM',()=>{
 for (const value of [{type:'reasoning',text:'synthetic-sentinel'},{type:'tool_started',tool:'shell',label:'Exécution sandbox',status:'running',arguments:'synthetic-sentinel'},{type:'tool_completed',tool:'evil',label:'synthetic-sentinel',status:'completed'},{type:'error',code:'runtime_unavailable',message:'synthetic-sentinel'}]) assert.throws(()=>parseChatEvent(value,tenant,thread))
 assert.equal(parseChatEvent({type:'tool_completed',tool:'shell',label:'Exécution sandbox',status:'completed'},tenant,thread).status,'completed')
})
test('tenant, thread and private fields rejected',()=>{
 const message={message_id:thread,thread_id:thread,tenant_id:thread,role:'assistant',content:'Hello',created_at:'2026-10-02T10:00:00Z',correlation_id:null}
 assert.throws(()=>parseChatEvent({type:'assistant_message',message},tenant,thread))
 assert.throws(()=>parseThread({tenant_id:tenant,password:'synthetic-sentinel'},tenant))
})
test('SSE supports split UTF-8 and requires terminal event',async()=>{
 const encoder=new TextEncoder(), bytes=encoder.encode('data: '+JSON.stringify({type:'tool_started',tool:'shell',label:'Exécution sandbox',status:'running'})+'\n\ndata: {"type":"completed"}\n\n')
 const stream=new ReadableStream({start(c){for(const byte of bytes)c.enqueue(Uint8Array.of(byte));c.close()}})
 const events=[];await readChatStream(new Response(stream,{headers:{'Content-Type':'text/event-stream'}}),tenant,thread,e=>events.push(e))
 assert.equal(events.length,2)
 await assert.rejects(readChatStream(new Response('data: {"type":"runtime_state","status":"running"}\n\n',{headers:{'Content-Type':'text/event-stream'}}),tenant,thread,()=>{}))
})
test('demo never sends a runtime request',async()=>{
 await assert.rejects(chatRequest('https://example.test','demo:1','','POST'))
})

test('tenant chat accepts only confirmed private privacy events', () => {
  assert.throws(() =>
    parseChatEvent(
      { type: 'privacy_state_changed', state: 'public' },
      tenant,
      thread,
    ),
  )
  assert.equal(
    parseChatEvent(
      { type: 'privacy_state_changed', state: 'private' },
      tenant,
      thread,
    ).state,
    'private',
  )
})

test('native assistant deltas are visible text only', () => {
  assert.equal(parseChatEvent({ type: 'assistant_delta', text: 'Réponse progressive' }, tenant, thread).text, 'Réponse progressive')
  assert.throws(() => parseChatEvent({ type: 'assistant_delta', text: 'Hello', reasoning: 'synthetic' }, tenant, thread))
})

test('conversation grouping orders recent discussions without mutating persistence', async () => {
  const { conversationGroups } = await import('../src/api/operatorChat.ts')
  const rows = [{ thread_id: 'old', updated_at: '2026-09-01T12:00:00Z' }, { thread_id: 'new', updated_at: '2026-10-04T10:00:00Z' }]
  const groups = conversationGroups(rows, new Date('2026-10-04T12:00:00Z'))
  assert.equal(groups[0].label, 'Aujourd’hui')
  assert.equal(groups[0].threads[0].thread_id, 'new')
  assert.equal(groups[1].label, 'Plus anciennes')
  assert.equal(rows[0].thread_id, 'old')
})

test('unsupported capabilities and diagnostic secrets fail closed', async () => {
  const { parseCapabilities, parseDiagnostics, parseMemoryResults } = await import('../src/api/operatorChat.ts')
  assert.throws(() => parseCapabilities({ policy_version: 'v2', capabilities: [{ id: 'browser', label: 'Browser', supported: false, enabled: true, reason: null }] }))
  assert.throws(() => parseDiagnostics([{ correlation_id: thread, snapshot: null, status: 'succeeded', duration_ms: 1, created_at: '2026-10-04T10:00:00Z', tools: [], credentials: 'synthetic' }]))
  assert.throws(() => parseMemoryResults([{ thread_id: thread, title: null, archived: true, kind: 'resolution', content: 'synthetic', rank: 1, token: 'synthetic' }]))
})

test('attachment contract accepts only opaque IDs and unavailable ingestion', async () => {
  const { parseAttachmentPolicy, parseAttachmentReference } = await import('../src/api/operatorChat.ts')
  const policy = { available: false, reference: 'attachment_id', tenant_scoped: true, max_size_bytes: 10485760, allowed_media_types: ['text/plain', 'application/pdf'], lifetime: 'turn', host_paths_allowed: false }
  assert.equal(parseAttachmentPolicy(policy).available, false)
  assert.throws(() => parseAttachmentPolicy({ ...policy, available: true }))
  assert.equal(parseAttachmentReference({ attachment_id: thread }).attachment_id, thread)
  assert.throws(() => parseAttachmentReference({ attachment_id: '/etc/passwd' }))
  assert.throws(() => parseAttachmentReference({ attachment_id: thread, path: '/etc/passwd' }))
})

test('diagnostic preserves the applied private configuration and rejects extra fields', async () => {
  const { parseDiagnostics } = await import('../src/api/operatorChat.ts')
  const snapshot = { model: 'model-test', reasoning_effort: 'medium', runtime_provider: 'codex', runtime_version: 'test', capabilities: { shell: true, workspace: true, python: true, multi_agent: false }, mcp: ['syncoria_chat_memory_search', 'syncoria_provider_request'], sandbox: 'workspace-write', privacy: 'private', network: 'private-egress-disabled', policy_version: 'operator-chat-v2', config_hash: 'a'.repeat(64), correlation_id: thread, timestamp: '2026-10-04T10:00:00Z' }
  const row = { correlation_id: thread, snapshot, status: 'succeeded', duration_ms: 12, created_at: snapshot.timestamp, tools: [{ tool: 'shell', label: 'Exécution sandbox', status: 'completed' }] }
  assert.equal(parseDiagnostics([row])[0].snapshot.config_hash, snapshot.config_hash)
  assert.throws(() => parseDiagnostics([{ ...row, snapshot: { ...snapshot, token: 'synthetic' } }]))
  assert.throws(() => parseDiagnostics([{ ...row, snapshot: { ...snapshot, privacy: 'public' } }]))
  assert.throws(() => parseDiagnostics([{ ...row, tools: [{ ...row.tools[0], arguments: 'synthetic' }] }]))
})
