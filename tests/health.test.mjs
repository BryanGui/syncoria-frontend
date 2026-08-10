import assert from 'node:assert/strict'
import test from 'node:test'

import {
  fetchHealthStatus,
  INITIAL_HEALTH_STATUS,
  normalizeApiBaseUrl,
} from '../src/api/health.ts'


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
  const request = async () => Response.json({ status: 'ok' })

  assert.equal(
    await fetchHealthStatus(
      'https://api.example.com',
      '/health',
      undefined,
      request,
    ),
    'operational',
  )
})

test('returns unavailable for an HTTP error', async () => {
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
    ),
    'unavailable',
  )
})

test('returns unavailable for a network error', async () => {
  const request = async () => {
    throw new TypeError('network unavailable')
  }

  assert.equal(
    await fetchHealthStatus(
      'https://api.example.com',
      '/health',
      undefined,
      request,
    ),
    'unavailable',
  )
})

test('returns unavailable when the API URL is not configured', async () => {
  let wasRequested = false
  const request = async () => {
    wasRequested = true
    return Response.json({ status: 'ok' })
  }

  assert.equal(
    await fetchHealthStatus(null, '/health', undefined, request),
    'unavailable',
  )
  assert.equal(wasRequested, false)
})
