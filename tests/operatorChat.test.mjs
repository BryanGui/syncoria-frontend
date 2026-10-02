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
