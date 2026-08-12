import assert from 'node:assert/strict'
import test from 'node:test'

import {
  credentialFormReducer,
  INITIAL_CREDENTIAL_FORM_STATE,
  integrateLoadedIntegrationCase,
  validateIntegrationCaseDraft,
} from '../src/integrationCases/form.ts'


test('validates and normalizes the real integration creation fields', () => {
  const validation = validateIntegrationCaseDraft({
    tenantId: '11111111-1111-4111-8111-111111111111',
    sourceSystem: ' NOTION ',
    sourceReference: ' reference ',
    objective: ' Import selected records ',
    instructions: ' Read only ',
    environment: 'sandbox',
  })
  assert.deepEqual(validation, {
    normalizedDraft: {
      tenantId: '11111111-1111-4111-8111-111111111111',
      sourceSystem: 'notion',
      sourceReference: 'reference',
      objective: 'Import selected records',
      instructions: 'Read only',
      environment: 'sandbox',
    },
    tenantError: null,
    sourceError: null,
    objectiveError: null,
  })
  assert.notEqual(validateIntegrationCaseDraft({
    tenantId: '',
    sourceSystem: 'invalid/source',
    sourceReference: '',
    objective: '',
    instructions: '',
    environment: 'sandbox',
  }).tenantError, null)
})

test('clears the credential secret after success and every rejected response', () => {
  const editing = credentialFormReducer(
    credentialFormReducer(INITIAL_CREDENTIAL_FORM_STATE, {
      type: 'change_name',
      name: 'Provider credential',
    }),
    { type: 'change_secret', secret: 'ephemeral-value' },
  )
  assert.equal(credentialFormReducer(editing, { type: 'complete' }).secret, '')
  assert.equal(
    credentialFormReducer(editing, { type: 'reject', status: 'error' }).secret,
    '',
  )
})

test('opens the newly created or reloaded case without duplicating the list', () => {
  const previous = [{ id: 'case-1', objective: 'old' }]
  const loaded = { id: 'case-1', objective: 'persisted' }
  assert.deepEqual(integrateLoadedIntegrationCase(previous, loaded), [loaded])
})
