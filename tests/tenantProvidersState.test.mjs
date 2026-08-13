import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyProviderVerification,
  buildProviderConfiguration,
  getProviderConnectionLabel,
  getProviderConnectionState,
  selectProviderRecord,
  upsertProviderRecord,
} from '../src/tenantProviders/state.ts'


const provider = {
  id: '22222222-2222-4222-8222-222222222222',
  tenant_id: '11111111-1111-4111-8111-111111111111',
  provider: 'notion',
  name: 'Notion',
  status: 'active',
  configuration: {},
  credential_configured: true,
  created_at: '2026-08-13T08:00:00Z',
  updated_at: '2026-08-13T08:00:00Z',
  last_verified_at: '2026-08-13T08:01:00Z',
  last_verification_status: 'ok',
  last_verification_http_status: 200,
  last_verification_code: null,
  last_verification_message: 'Authentification confirmée.',
}

test('builds optional Notion and required n8n configuration consistently', () => {
  assert.deepEqual(buildProviderConfiguration('notion', '   '), {})
  assert.deepEqual(buildProviderConfiguration('notion', ' workspace '), {
    workspace_reference: 'workspace',
  })
  assert.deepEqual(buildProviderConfiguration('n8n', ' https://n8n.example.com '), {
    base_url: 'https://n8n.example.com',
  })
})

test('represents empty, pending, successful and failed connections', () => {
  assert.equal(getProviderConnectionState(null), 'not_configured')
  assert.equal(getProviderConnectionState({
    ...provider,
    last_verified_at: null,
    last_verification_status: null,
  }), 'pending')
  assert.equal(getProviderConnectionState(provider), 'ok')
  assert.equal(getProviderConnectionState({
    ...provider,
    last_verification_status: 'error',
  }), 'error')
  assert.equal(getProviderConnectionLabel('pending'), 'À vérifier')
})

test('a saved backend record immediately removes a previous OK result', () => {
  const invalidated = {
    ...provider,
    configuration: { workspace_reference: 'updated' },
    last_verified_at: null,
    last_verification_status: null,
    last_verification_http_status: null,
    last_verification_code: null,
    last_verification_message: null,
  }
  const providers = upsertProviderRecord([provider], invalidated)
  assert.equal(providers.length, 1)
  assert.equal(getProviderConnectionState(providers[0]), 'pending')
  assert.equal(providers[0].last_verification_message, null)
})

test('applies only the sanitized verification structure to the displayed record', () => {
  const verification = {
    status: 'error',
    checked_at: '2026-08-13T08:02:00Z',
    provider: 'notion',
    http_status: 401,
    code: 'authentication_refused',
    message: 'Credential refusé.',
  }
  const updated = applyProviderVerification(provider, verification)
  assert.equal(updated.last_verified_at, verification.checked_at)
  assert.equal(updated.last_verification_status, 'error')
  assert.equal(updated.last_verification_message, verification.message)
})

test('prefers the active record and otherwise keeps the latest disabled record', () => {
  const oldDisabled = {
    ...provider,
    id: 'old',
    status: 'disabled',
    updated_at: '2026-08-13T07:00:00Z',
  }
  const latestDisabled = {
    ...provider,
    id: 'latest',
    status: 'disabled',
    updated_at: '2026-08-13T09:00:00Z',
  }
  assert.equal(selectProviderRecord([oldDisabled, provider], 'notion').id, provider.id)
  assert.equal(
    selectProviderRecord([oldDisabled, latestDisabled], 'notion').id,
    latestDisabled.id,
  )
  assert.equal(selectProviderRecord([provider], 'n8n'), null)
})
