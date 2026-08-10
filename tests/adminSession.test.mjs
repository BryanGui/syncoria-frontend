import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createAdminSession,
  deleteAdminSession,
  fetchAdminSession,
} from '../src/api/adminSession.ts'


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

test('recognizes an existing admin session and includes credentials', async () => {
  let capturedUrl
  let capturedOptions
  const request = async (url, options) => {
    capturedUrl = url
    capturedOptions = options
    return Response.json({ authenticated: true })
  }

  assert.equal(
    await fetchAdminSession(
      'https://api.example.com',
      undefined,
      request,
    ),
    'authenticated',
  )
  assert.equal(capturedUrl, 'https://api.example.com/admin/session')
  assert.equal(capturedOptions.method, 'GET')
  assert.equal(capturedOptions.credentials, 'include')
})

test('recognizes an absent or expired admin session', async () => {
  const request = async () => Response.json({ authenticated: false })

  assert.equal(
    await fetchAdminSession('https://api.example.com', undefined, request),
    'unauthenticated',
  )
})

test('returns an error state when session verification is unavailable', async () => {
  const { entries, logger } = createLoggerSpy()
  const request = async () => new Response(null, { status: 503 })

  assert.equal(
    await fetchAdminSession(
      'https://api.example.com',
      undefined,
      request,
      logger,
    ),
    'error',
  )
  assert.equal(entries[0].context.httpStatus, 503)
})

test('submits credentials only in the login request body', async () => {
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
    await createAdminSession(
      'https://api.example.com',
      'admin-user',
      sensitivePassword,
      request,
      logger,
    ),
    'authenticated',
  )
  assert.equal(capturedUrl, 'https://api.example.com/admin/session')
  assert.equal(capturedOptions.method, 'POST')
  assert.equal(capturedOptions.credentials, 'include')
  assert.deepEqual(JSON.parse(capturedOptions.body), {
    username: 'admin-user',
    password: sensitivePassword,
  })
  assert.doesNotMatch(JSON.stringify(entries), /browser-only-password|admin-user/)
})

test('maps invalid credentials to a rejected login without logging them', async () => {
  const { entries, logger } = createLoggerSpy()
  const request = async () => Response.json(
    { detail: 'Invalid credentials.' },
    { status: 401 },
  )

  assert.equal(
    await createAdminSession(
      'https://api.example.com',
      'wrong-user',
      'wrong-password',
      request,
      logger,
    ),
    'rejected',
  )
  assert.deepEqual(entries, [])
})

test('logs out through a credentialed delete request', async () => {
  let capturedOptions
  const request = async (_url, options) => {
    capturedOptions = options
    return new Response(null, { status: 204 })
  }

  assert.equal(
    await deleteAdminSession('https://api.example.com', request),
    true,
  )
  assert.equal(capturedOptions.method, 'DELETE')
  assert.equal(capturedOptions.credentials, 'include')
})

test('never throws when login or logout requests fail', async () => {
  const { entries, logger } = createLoggerSpy()
  const request = async () => {
    throw new TypeError('sensitive network detail')
  }

  assert.equal(
    await createAdminSession(
      'https://api.example.com',
      'admin-user',
      'secret-password',
      request,
      logger,
    ),
    'error',
  )
  assert.equal(
    await deleteAdminSession('https://api.example.com', request, logger),
    false,
  )
  assert.doesNotMatch(
    JSON.stringify(entries),
    /secret-password|admin-user|sensitive network detail/,
  )
})
