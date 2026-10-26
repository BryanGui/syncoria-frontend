import assert from 'node:assert/strict'
import test from 'node:test'
import { loadRuntimeConfig, parseRuntimeConfig } from '../src/config/runtimeConfig.ts'

test('normalizes public API URLs and preserves path prefixes and local HTTP', () => {
  for (const [input, expected] of [
    [' https://api.example.test/// ', 'https://api.example.test'],
    ['https://api.example.test/v1///', 'https://api.example.test/v1'],
    ['http://localhost:8000/', 'http://localhost:8000'],
  ]) {
    const config = parseRuntimeConfig({ apiBaseUrl: input })
    assert.deepEqual(config, { apiBaseUrl: expected })
    assert.ok(Object.isFrozen(config))
  }
})

test('rejects missing or malformed configuration with a generic error', () => {
  for (const value of [undefined, null, [], {}, 'url', { apiBaseUrl: null },
    { apiBaseUrl: 123 }, { apiBaseUrl: '' }, { apiBaseUrl: '  ' }]) {
    assert.throws(() => parseRuntimeConfig(value), {
      message: 'La configuration des services est invalide.',
    })
  }
})

test('rejects relative, unsafe or credential-bearing URLs without exposing their value', () => {
  for (const apiBaseUrl of [
    '/api', '//api.example.test', 'https:api.example.test', 'ftp://api.example.test',
    'javascript:alert(1)', 'https://user:password@example.test',
    'https://api.example.test?token=private', 'https://api.example.test#private',
    'https://api.example.test?', 'https://api.example.test#',
    'https://api.example.test\\path', 'https://api.example.test/a b',
    'https://api.example.test/a\nb',
    'https://api.example.test/a\0b', 'https://api.example.test/a\u007fb',
  ]) {
    assert.throws(() => parseRuntimeConfig({ apiBaseUrl }), {
      message: 'La configuration des services est invalide.',
    })
  }
})

test('reads only declared configuration fields', () => {
  assert.deepEqual(parseRuntimeConfig({ apiBaseUrl: 'https://api.example.test', extra: 'ignored' }), {
    apiBaseUrl: 'https://api.example.test',
  })
})

test('loads configuration without cache and with a bounded request before using its URL', async () => {
  let captured
  const config = await loadRuntimeConfig('/', async (url, options) => {
    captured = { url, options }
    return Response.json({ apiBaseUrl: 'https://runtime.example.test/v1/' })
  })
  assert.equal(config.apiBaseUrl, 'https://runtime.example.test/v1')
  assert.equal(captured.url, '/runtime-config.json')
  assert.equal(captured.options.cache, 'no-store')
  assert.equal(captured.options.credentials, 'same-origin')
  assert.equal(captured.options.redirect, 'error')
  assert.deepEqual(captured.options.headers, { Accept: 'application/json' })
  assert.ok(captured.options.signal instanceof AbortSignal)
})

test('resolves the configuration under the Vite base path', async () => {
  for (const base of ['/syncoria/', '/syncoria']) {
    await loadRuntimeConfig(base, async (url) => {
      assert.equal(url, '/syncoria/runtime-config.json')
      return Response.json({ apiBaseUrl: 'https://api.example.test' })
    })
  }
})

test('does not fall back to a compiled URL on HTTP, network, JSON or validation errors', async () => {
  for (const request of [
    async () => new Response('', { status: 404 }),
    async () => new Response('', { status: 503 }),
    async () => { throw new TypeError('network unavailable') },
    async () => { throw new DOMException('timeout', 'TimeoutError') },
    async () => new Response('<html>SPA fallback</html>'),
    async () => Response.json({ apiBaseUrl: '/api' }),
    async () => Response.json({}),
  ]) {
    await assert.rejects(loadRuntimeConfig('/', request))
  }
})
