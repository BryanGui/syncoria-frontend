import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getInitialIngestionStatusLabel,
  getProgressCountLabel,
  getProgressPercentage,
  getProgressWidth,
  isInitialIngestionActive,
  isLaunchResponseCurrent,
} from '../src/tenantIngestion.ts'


test('maps every persisted ingestion status to a clear French label', () => {
  assert.equal(getInitialIngestionStatusLabel('pending'), 'En attente')
  assert.equal(getInitialIngestionStatusLabel('running'), 'En cours')
  assert.equal(getInitialIngestionStatusLabel('completed'), 'Terminé')
  assert.equal(getInitialIngestionStatusLabel('partial'), 'Partiel')
  assert.equal(getInitialIngestionStatusLabel('failed'), 'Erreur')
  assert.equal(getInitialIngestionStatusLabel('interrupted'), 'Interrompu')
  assert.equal(isInitialIngestionActive('running'), true)
  assert.equal(isInitialIngestionActive('pending'), true)
  assert.equal(isInitialIngestionActive('completed'), false)
  assert.equal(isInitialIngestionActive('failed'), false)
  assert.equal(isInitialIngestionActive('interrupted'), false)
})

test('derives progress only from real processed and expected counters', () => {
  assert.equal(getProgressPercentage(56, 90), 56 / 90 * 100)
  assert.equal(getProgressWidth(56, 90), 56 / 90 * 100)
  assert.equal(getProgressPercentage(5, null), null)
  assert.equal(getProgressWidth(5, null), null)
  assert.equal(getProgressPercentage(0, 0), null)
  assert.equal(getProgressCountLabel(56, 90), '56 / 90 traités · 62 %')
  assert.equal(getProgressCountLabel(5, null), '5 traités · volume attendu indisponible')
  assert.equal(getProgressCountLabel(0, 0), '0 traités · volume attendu indisponible')
})

test('keeps actual counts above audit while limiting only visual width', () => {
  assert.equal(getProgressPercentage(12, 10), 120)
  assert.equal(getProgressWidth(12, 10), 100)
  assert.equal(getProgressPercentage(5, 10), 50)
  assert.equal(getProgressWidth(5, 10), 50)
  assert.equal(getProgressCountLabel(12, 10), '12 / 10 traités · 120 %')
})

test('does not apply a launch response after the provider selection changed', () => {
  assert.equal(isLaunchResponseCurrent('provider-a', 'provider-a'), true)
  assert.equal(isLaunchResponseCurrent('provider-b', 'provider-a'), false)
})
