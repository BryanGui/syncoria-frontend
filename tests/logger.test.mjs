import assert from 'node:assert/strict'
import test from 'node:test'

import { createTechnicalLogger } from '../src/observability/logger.ts'


function createConsoleSpy() {
  const calls = []
  const consoleOutput = {
    info: (...parameters) => calls.push({ method: 'info', parameters }),
    warn: (...parameters) => calls.push({ method: 'warn', parameters }),
    error: (...parameters) => calls.push({ method: 'error', parameters }),
  }
  return { calls, consoleOutput }
}

test('writes info, warning and error entries to the development console', () => {
  const { calls, consoleOutput } = createConsoleSpy()
  const logger = createTechnicalLogger({
    isDevelopment: true,
    consoleOutput,
  })

  logger.info('Dashboard loaded.', { page: 'dashboard' })
  logger.warning('Health endpoint unavailable.', {
    endpoint: '/health',
    httpStatus: 503,
  })
  logger.error('Health request failed.', { errorType: 'TypeError' })

  assert.deepEqual(
    calls.map(({ method }) => method),
    ['info', 'warn', 'error'],
  )
  assert.deepEqual(calls[1].parameters, [
    '[Syncoria]',
    {
      level: 'warning',
      message: 'Health endpoint unavailable.',
      context: { endpoint: '/health', httpStatus: 503 },
    },
  ])
})

test('does not write to the console outside development', () => {
  const { calls, consoleOutput } = createConsoleSpy()
  const logger = createTechnicalLogger({
    isDevelopment: false,
    consoleOutput,
  })

  logger.error('Health request failed.', { errorType: 'TypeError' })

  assert.deepEqual(calls, [])
})

test('supports additional transports without changing logger calls', () => {
  const transportedEntries = []
  const logger = createTechnicalLogger({
    isDevelopment: false,
    transports: [(entry) => transportedEntries.push(entry)],
  })

  logger.info('Dashboard loaded.', {
    page: 'dashboard',
    action: 'load_dashboard',
  })

  assert.deepEqual(transportedEntries, [
    {
      level: 'info',
      message: 'Dashboard loaded.',
      context: {
        page: 'dashboard',
        action: 'load_dashboard',
      },
    },
  ])
})

test('keeps only allowlisted technical context fields', () => {
  const transportedEntries = []
  const logger = createTechnicalLogger({
    isDevelopment: false,
    transports: [(entry) => transportedEntries.push(entry)],
  })

  logger.warning('Health endpoint unavailable.', {
    endpoint: '/health',
    token: 'sensitive-value',
    payload: { personalData: 'sensitive-value' },
  })

  assert.deepEqual(transportedEntries[0].context, {
    endpoint: '/health',
  })
  assert.doesNotMatch(JSON.stringify(transportedEntries), /sensitive-value/)
})

test('isolates transport failures from logger callers', () => {
  const transportedEntries = []
  const logger = createTechnicalLogger({
    isDevelopment: false,
    transports: [
      () => {
        throw new Error('transport unavailable')
      },
      (entry) => transportedEntries.push(entry),
    ],
  })

  assert.doesNotThrow(() => logger.error('Health request failed.'))
  assert.equal(transportedEntries.length, 1)
})
