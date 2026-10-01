import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseTenantEstate,
  fetchTenantEstate,
  estateCollections,
} from '../src/api/controlPlaneEstate.ts'
const tenantId = '00000000-0000-4000-8000-000000000001'
const observed_at = '2026-10-01T10:00:00Z'
const empty = () => ({
  tenant: { tenant_id: tenantId, slug: 'test', name: 'Test', status: 'active' },
  read_at: observed_at,
  ...Object.fromEntries(estateCollections.map((key) => [key, []])),
})
const membership = () => ({
  membership_id: '00000000-0000-4000-8000-000000000002',
  tenant_id: tenantId,
  identity_id: null,
  provider: 'openai',
  external_user_id: 'provider-user-42',
  external_email: null,
  role: null,
  status: 'unknown',
  provenance: 'provider',
  observed_at,
})
test('real estate preserves empty collections, null links and real provenance', () => {
  for (const provenance of ['provider', 'syncoria']) {
    const payload = empty()
    payload.memberships = [{ ...membership(), provenance }]
    const result = parseTenantEstate(payload, tenantId)
    assert.equal(result.memberships[0].identity_id, null)
    assert.equal(result.memberships[0].status, 'unknown')
    assert.deepEqual(result.metrics, [])
  }
})
test('live estate rejects fixtures, private fields, invalid enums and foreign tenant records', () => {
  for (const extra of [
    { provenance: 'synthetic/demo' },
    { tenant_id: '00000000-0000-4000-8000-000000000003' },
    { payload: 'private' },
    { provider: 'bad provider' },
    { observed_at: null },
    { status: null },
  ]) {
    const payload = empty()
    payload.memberships = [{ ...membership(), ...extra }]
    assert.equal(parseTenantEstate(payload, tenantId), null)
  }
  assert.equal(parseTenantEstate(empty(), 'demo:one'), null)
  assert.equal(
    parseTenantEstate({ ...empty(), credentials: 'private' }, tenantId),
    null,
  )
})
test('estate fetch uses admin cookie route; never fetches demo identifiers', async () => {
  let calls = 0
  const request = async (url, options) => {
    calls++
    assert.equal(
      url,
      `https://api.test/admin/control-plane/tenants/${tenantId}/estate`,
    )
    assert.equal(options.credentials, 'include')
    return new Response(JSON.stringify(empty()), { status: 200 })
  }
  assert.equal(
    (await fetchTenantEstate('https://api.test', tenantId, undefined, request))
      .status,
    'loaded',
  )
  assert.equal(
    (
      await fetchTenantEstate(
        'https://api.test',
        'demo:one',
        undefined,
        request,
      )
    ).status,
    'error',
  )
  assert.equal(calls, 1)
})
test('authentication and unavailable snapshots have no fixture fallback', async () => {
  for (const status of [401, 404, 409, 503]) {
    const result = await fetchTenantEstate(
      'https://api.test',
      tenantId,
      undefined,
      async () => new Response('{}', { status }),
    )
    assert.equal(result.status, status === 401 ? 'unauthenticated' : 'error')
    assert.equal('estate' in result, false)
  }
})
