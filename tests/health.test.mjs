import assert from 'node:assert/strict'
import test from 'node:test'

import {
  fetchHealthStatus,
  INITIAL_HEALTH_STATUS,
  normalizeApiBaseUrl,
} from '../src/api/health.ts'


function createLoggerSpy() {
  const entries = []
  return {
    entries,
    logger: {
      info: (message, context) => entries.push({
        level: 'info',
        message,
        context,
      }),
      warning: (message, context) => entries.push({
        level: 'warning',
        message,
        context,
      }),
      error: (message, context) => entries.push({
        level: 'error',
        message,
        context,
      }),
    },
  }
}

test('starts health cards in loading state', () => {
  assert.equal(INITIAL_HEALTH_STATUS, 'loading')
})

test('normalizes the configured API base URL', () => {
  assert.equal(
    normalizeApiBaseUrl(' https://api.example.com/// '),
    'https://api.example.com',
  )
  assert.equal(normalizeApiBaseUrl(undefined), null)
  assert.equal(normalizeApiBaseUrl('  '), null)
})

test('returns operational for a successful health response', async () => {
  let capturedOptions
  const request = async (_url, options) => {
    capturedOptions = options
    return Response.json({ status: 'ok' })
  }

  assert.equal(
    await fetchHealthStatus(
      'https://api.example.com',
      '/health',
      undefined,
      request,
    ),
    'operational',
  )
  assert.equal(capturedOptions.credentials, 'include')
})

test('returns unavailable for an HTTP error', async () => {
  const { entries, logger } = createLoggerSpy()
  const request = async () => Response.json(
    { status: 'unavailable' },
    { status: 503 },
  )

  assert.equal(
    await fetchHealthStatus(
      'https://api.example.com',
      '/health/db',
      undefined,
      request,
      logger,
    ),
    'unavailable',
  )
  assert.deepEqual(entries, [
    {
      level: 'warning',
      message: 'Health endpoint returned an unavailable response.',
      context: {
        page: 'dashboard',
        action: 'load_health_status',
        endpoint: '/health/db',
        httpStatus: 503,
      },
    },
  ])
})

test('returns unavailable for a network error', async () => {
  const { entries, logger } = createLoggerSpy()
  const request = async () => {
    throw new TypeError('sensitive detail that must not be logged')
  }

  assert.equal(
    await fetchHealthStatus(
      'https://api.example.com',
      '/health',
      undefined,
      request,
      logger,
    ),
    'unavailable',
  )
  assert.deepEqual(entries, [
    {
      level: 'error',
      message: 'Health endpoint request failed.',
      context: {
        page: 'dashboard',
        action: 'load_health_status',
        endpoint: '/health',
        errorType: 'TypeError',
      },
    },
  ])
  assert.doesNotMatch(JSON.stringify(entries), /sensitive detail/)
})

test('returns unavailable when the API URL is not configured', async () => {
  const { entries, logger } = createLoggerSpy()
  let wasRequested = false
  const request = async () => {
    wasRequested = true
    return Response.json({ status: 'ok' })
  }

  assert.equal(
    await fetchHealthStatus(null, '/health', undefined, request, logger),
    'unavailable',
  )
  assert.equal(wasRequested, false)
  assert.deepEqual(entries, [
    {
      level: 'warning',
      message: 'API base URL is not configured.',
      context: {
        page: 'dashboard',
        action: 'load_health_status',
        endpoint: '/health',
        errorType: 'configuration_error',
      },
    },
  ])
})
