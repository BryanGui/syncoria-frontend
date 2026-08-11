import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createClientSession,
  deleteClientSession,
  fetchCurrentClientUser,
} from '../src/api/clientSession.ts'
import { selectLoginMode } from '../src/auth/loginMode.ts'


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

const meResponse = {
  user: {
    id: '11111111-1111-4111-8111-111111111111',
    login: 'client@example.test',
    display_name: 'Client Test',
    role: 'tenant_admin',
  },
  tenant: {
    id: '22222222-2222-4222-8222-222222222222',
    slug: 'syncoria_lab',
    status: 'active',
  },
}

test('switches explicitly between client and admin login modes', () => {
  assert.equal(selectLoginMode('client'), 'client')
  assert.equal(selectLoginMode('admin'), 'admin')
})

test('submits client credentials only to the client session endpoint', async () => {
  const sensitivePassword = 'browser-only-password'
  let capturedUrl
  let capturedOptions
  const { entries, logger } = createLoggerSpy()
  const request = async (url, options) => {
    capturedUrl = url
    capturedOptions = options
    return Response.json({ authenticated: true })
  }

  assert.equal(
    await createClientSession(
      'https://api.example.com',
      'client@example.test',
      sensitivePassword,
      request,
      logger,
    ),
    'authenticated',
  )
  assert.equal(capturedUrl, 'https://api.example.com/auth/session')
  assert.equal(capturedOptions.credentials, 'include')
  assert.deepEqual(JSON.parse(capturedOptions.body), {
    login: 'client@example.test',
    password: sensitivePassword,
  })
  assert.doesNotMatch(JSON.stringify(entries), /browser-only-password|client@example/)
})

test('maps rejected client credentials to a generic state', async () => {
  const request = async () => Response.json(
    { detail: 'Invalid credentials.' },
    { status: 401 },
  )

  assert.equal(
    await createClientSession(
      'https://api.example.com',
      'missing',
      'wrong',
      request,
    ),
    'rejected',
  )
})

test('loads an existing client session from me without a selectable tenant', async () => {
  let capturedUrl
  let capturedOptions
  const request = async (url, options) => {
    capturedUrl = url
    capturedOptions = options
    return Response.json({
      ...meResponse,
      user: { ...meResponse.user, password_hash: 'must-not-enter-state' },
      tenant: { ...meResponse.tenant, credential: 'must-not-enter-state' },
    })
  }

  const result = await fetchCurrentClientUser(
    'https://api.example.com',
    undefined,
    request,
  )

  assert.equal(capturedUrl, 'https://api.example.com/me')
  assert.equal(capturedOptions.method, 'GET')
  assert.equal(capturedOptions.credentials, 'include')
  assert.deepEqual(result, {
    status: 'loaded',
    currentUser: {
      user: {
        id: meResponse.user.id,
        login: meResponse.user.login,
        displayName: meResponse.user.display_name,
        role: meResponse.user.role,
      },
      tenant: meResponse.tenant,
    },
  })
  assert.doesNotMatch(JSON.stringify(result), /password_hash|credential|must-not-enter/)
})

test('reports an expired client session from me', async () => {
  const request = async () => Response.json({}, { status: 401 })

  assert.deepEqual(
    await fetchCurrentClientUser('https://api.example.com', undefined, request),
    { status: 'unauthenticated' },
  )
})

test('rejects a malformed me response', async () => {
  const request = async () => Response.json({
    user: meResponse.user,
    tenant: { id: meResponse.tenant.id, slug: 'syncoria_lab' },
  })

  assert.deepEqual(
    await fetchCurrentClientUser('https://api.example.com', undefined, request),
    { status: 'error' },
  )
})

test('logs out through the client endpoint without exposing a token', async () => {
  let capturedUrl
  let capturedOptions
  const request = async (url, options) => {
    capturedUrl = url
    capturedOptions = options
    return new Response(null, { status: 204 })
  }

  assert.equal(await deleteClientSession('https://api.example.com', request), true)
  assert.equal(capturedUrl, 'https://api.example.com/auth/session')
  assert.equal(capturedOptions.method, 'DELETE')
  assert.equal(capturedOptions.credentials, 'include')
})
