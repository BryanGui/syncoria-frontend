import assert from 'node:assert/strict'
import test from 'node:test'

import { fetchAdminTenant } from '../src/api/adminTenant.ts'


function createLoggerSpy() {
  const entries = []
  return {
    entries,
    logger: {
      info: (message, context) => entries.push({ level: 'info', message, context }),
      warning: (message, context) => entries.push({ level: 'warning', message, context }),
      error: (message, context) => entries.push({ level: 'error', message, context }),
    },
  }
}

const tenant = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'alpha',
  status: 'active',
}

test('loads the real tenant detail with credential cookies', async () => {
  let capturedUrl
  let capturedOptions
  const request = async (url, options) => {
    capturedUrl = url
    capturedOptions = options
    return Response.json(tenant)
  }

  assert.deepEqual(
    await fetchAdminTenant('https://api.example.com', tenant.id, undefined, request),
    { status: 'loaded', tenant },
  )
  assert.equal(capturedUrl, `https://api.example.com/admin/tenants/${tenant.id}`)
  assert.equal(capturedOptions.method, 'GET')
  assert.equal(capturedOptions.credentials, 'include')
})

test('reports an expired session separately', async () => {
  const request = async () => Response.json({}, { status: 401 })

  assert.deepEqual(
    await fetchAdminTenant('https://api.example.com', tenant.id, undefined, request),
    { status: 'unauthenticated' },
  )
})

test('reports a missing tenant separately', async () => {
  const request = async () => Response.json({}, { status: 404 })

  assert.deepEqual(
    await fetchAdminTenant('https://api.example.com', tenant.id, undefined, request),
    { status: 'not_found' },
  )
})

test('returns a generic error without logging API details', async () => {
  const { entries, logger } = createLoggerSpy()
  const request = async () => Response.json(
    { detail: 'sensitive database detail' },
    { status: 503 },
  )

  assert.deepEqual(
    await fetchAdminTenant(
      'https://api.example.com',
      tenant.id,
      undefined,
      request,
      logger,
    ),
    { status: 'error' },
  )
  assert.equal(entries[0].context.httpStatus, 503)
  assert.doesNotMatch(JSON.stringify(entries), /sensitive database detail/)
})

test('keeps only allowlisted tenant fields', async () => {
  const request = async () => Response.json({
    ...tenant,
    credential: 'must-not-enter-application-state',
  })

  const result = await fetchAdminTenant(
    'https://api.example.com',
    tenant.id,
    undefined,
    request,
  )

  assert.deepEqual(result, { status: 'loaded', tenant })
  assert.doesNotMatch(JSON.stringify(result), /credential|must-not-enter/)
})

test('rejects a malformed tenant response', async () => {
  const request = async () => Response.json({ id: tenant.id, slug: 'alpha' })

  assert.deepEqual(
    await fetchAdminTenant('https://api.example.com', tenant.id, undefined, request),
    { status: 'error' },
  )
})
