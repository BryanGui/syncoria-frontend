import assert from 'node:assert/strict'
import test from 'node:test'

import { fetchAdminTenants } from '../src/api/adminTenants.ts'


function createLoggerSpy() {
  const entries = []
  return {
    entries,
    logger: {
      info: (message, context) => entries.push({ level: 'info', message, context }),
      warning: (message, context) => entries.push({
        level: 'warning',
        message,
        context,
      }),
      error: (message, context) => entries.push({ level: 'error', message, context }),
    },
  }
}

test('loads real admin tenants with credential cookies', async () => {
  const tenants = [
    {
      id: '11111111-1111-4111-8111-111111111111',
      slug: 'alpha',
      status: 'active',
    },
  ]
  let capturedUrl
  let capturedOptions
  const request = async (url, options) => {
    capturedUrl = url
    capturedOptions = options
    return Response.json(tenants)
  }

  assert.deepEqual(
    await fetchAdminTenants('https://api.example.com', undefined, request),
    { status: 'loaded', tenants },
  )
  assert.equal(capturedUrl, 'https://api.example.com/admin/tenants')
  assert.equal(capturedOptions.method, 'GET')
  assert.equal(capturedOptions.credentials, 'include')
})

test('returns a loaded empty list when no tenant exists', async () => {
  const request = async () => Response.json([])

  assert.deepEqual(
    await fetchAdminTenants('https://api.example.com', undefined, request),
    { status: 'loaded', tenants: [] },
  )
})

test('reports an expired admin session separately', async () => {
  const { entries, logger } = createLoggerSpy()
  const request = async () => Response.json(
    { detail: 'Authentication required.' },
    { status: 401 },
  )

  assert.deepEqual(
    await fetchAdminTenants(
      'https://api.example.com',
      undefined,
      request,
      logger,
    ),
    { status: 'unauthenticated' },
  )
  assert.deepEqual(entries, [])
})

test('returns an error state for an API failure without leaking details', async () => {
  const { entries, logger } = createLoggerSpy()
  const request = async () => Response.json(
    { detail: 'sensitive database detail' },
    { status: 503 },
  )

  assert.deepEqual(
    await fetchAdminTenants(
      'https://api.example.com',
      undefined,
      request,
      logger,
    ),
    { status: 'error' },
  )
  assert.equal(entries[0].context.httpStatus, 503)
  assert.doesNotMatch(JSON.stringify(entries), /sensitive database detail/)
})

test('rejects a malformed tenant response', async () => {
  const request = async () => Response.json([
    { id: 'tenant-id', slug: 'alpha', status: 'active', credential: 'secret' },
    { id: 'missing-status', slug: 'invalid' },
  ])

  assert.deepEqual(
    await fetchAdminTenants('https://api.example.com', undefined, request),
    { status: 'error' },
  )
})

test('keeps only the minimal tenant fields from a valid response', async () => {
  const request = async () => Response.json([
    {
      id: '11111111-1111-4111-8111-111111111111',
      slug: 'alpha',
      status: 'active',
      credential: 'must-not-enter-application-state',
    },
  ])

  const result = await fetchAdminTenants(
    'https://api.example.com',
    undefined,
    request,
  )

  assert.deepEqual(result, {
    status: 'loaded',
    tenants: [{
      id: '11111111-1111-4111-8111-111111111111',
      slug: 'alpha',
      status: 'active',
    }],
  })
  assert.doesNotMatch(JSON.stringify(result), /credential|must-not-enter/)
})
