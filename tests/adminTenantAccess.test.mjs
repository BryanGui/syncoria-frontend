import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  createTenantUser,
  fetchTenantAccess,
  fetchTenantUserAccess,
  fetchTenantUsers,
  revokeTenantUserSessions,
  updateTenantEntitlement,
  updateTenantUser,
  updateTenantUserOverride,
} from '../src/api/adminTenantAccess.ts'

const tenantId = '11111111-1111-4111-8111-111111111111'
const userId = '22222222-2222-4222-8222-222222222222'
const base = 'https://api.example.test'
const entitlements = { access: true, analytics: false, agent: true }
const tenantAccess = { tenant_id: tenantId, tenant_status: 'active', entitlements, provisioning: { status: 'ready', role_name: 'syncoria_tenant_example' } }
const user = { id: userId, login: 'alice@example.test', display_name: 'Alice', role: 'viewer', status: 'active' }
const userAccess = { tenant_id: tenantId, user_id: userId, role: 'viewer', user_status: 'active', entitlements, overrides: {}, permissions: ['analytics:view'] }
const component = await readFile(new URL('../src/components/AdminTenantAccess.tsx', import.meta.url), 'utf8')
const page = await readFile(new URL('../src/pages/AdminTenantWorkspacePage.tsx', import.meta.url), 'utf8')
const client = await readFile(new URL('../src/pages/ClientWorkspacePage.tsx', import.meta.url), 'utf8')

function mockResponse(payload, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } })
}

function capture(payload, status = 200) {
  const calls = []
  return {
    calls,
    request: async (url, options) => {
      calls.push({ url, ...options })
      return mockResponse(payload, status)
    },
  }
}

test('reads tenant entitlements, provisioning and user list with credentials', async () => {
  const tenant = capture(tenantAccess)
  assert.deepEqual(await fetchTenantAccess(base, tenantId, undefined, tenant.request), { status: 'loaded', data: tenantAccess })
  assert.equal(tenant.calls[0].url, `${base}/admin/tenants/${tenantId}/access`)
  assert.equal(tenant.calls[0].credentials, 'include')
  assert.equal(tenant.calls[0].method, 'GET')
  const users = capture([user])
  assert.deepEqual(await fetchTenantUsers(base, tenantId, undefined, users.request), { status: 'loaded', data: [user] })
  assert.equal(users.calls[0].url, `${base}/admin/tenants/${tenantId}/users`)
})

test('changes Superset and Agent IA entitlements with the backend keys', async () => {
  for (const [capability, enabled] of [['analytics', true], ['analytics', false], ['agent', true], ['agent', false]]) {
    const mock = capture({ entitlements })
    const result = await updateTenantEntitlement(base, tenantId, capability, enabled, mock.request)
    assert.equal(result.status, 'loaded')
    assert.equal(mock.calls[0].method, 'PATCH')
    assert.equal(mock.calls[0].url, `${base}/admin/tenants/${tenantId}/entitlements`)
    assert.deepEqual(JSON.parse(mock.calls[0].body), { entitlements: { [capability]: enabled } })
  }
})

test('creates a user without putting the password in URLs or logs', async () => {
  const mock = capture(user, 201)
  const input = { login: user.login, display_name: user.display_name, password: 'safe-test-password', role: 'viewer' }
  assert.equal((await createTenantUser(base, tenantId, input, mock.request)).status, 'loaded')
  assert.equal(mock.calls[0].method, 'POST')
  assert.equal(mock.calls[0].url, `${base}/admin/tenants/${tenantId}/users`)
  assert.deepEqual(JSON.parse(mock.calls[0].body), input)
  assert.doesNotMatch(mock.calls[0].url, /safe-test-password/)
})

test('changes role and status, then revokes sessions through dedicated endpoints', async () => {
  for (const change of [{ role: 'member' }, { status: 'disabled' }, { status: 'active' }]) {
    const mock = capture(user)
    assert.equal((await updateTenantUser(base, tenantId, userId, change, mock.request)).status, 'loaded')
    assert.equal(mock.calls[0].method, 'PATCH')
    assert.equal(mock.calls[0].url, `${base}/admin/tenants/${tenantId}/users/${userId}`)
    assert.deepEqual(JSON.parse(mock.calls[0].body), change)
  }
  const mock = capture(null, 204)
  assert.deepEqual(await revokeTenantUserSessions(base, tenantId, userId, mock.request), { status: 'loaded', data: null })
  assert.equal(mock.calls[0].url, `${base}/admin/tenants/${tenantId}/users/${userId}/revoke-sessions`)
})

test('reads effective permissions and returns backend access after every override state', async () => {
  const read = capture(userAccess)
  assert.deepEqual(await fetchTenantUserAccess(base, tenantId, userId, undefined, read.request), { status: 'loaded', data: userAccess })
  for (const allowed of [true, false, null]) {
    const mock = capture({ ...userAccess, overrides: allowed === null ? {} : { 'analytics:view': allowed }, permissions: allowed ? ['analytics:view'] : [] })
    const result = await updateTenantUserOverride(base, tenantId, userId, 'analytics:view', allowed, mock.request)
    assert.equal(result.status, 'loaded')
    assert.deepEqual(JSON.parse(mock.calls[0].body), { permission: 'analytics:view', allowed })
    assert.deepEqual(result.data.permissions, allowed ? ['analytics:view'] : [])
  }
})

test('keeps expired sessions and invalid identifiers separate from server errors', async () => {
  const expired = capture(null, 401)
  assert.equal((await fetchTenantAccess(base, tenantId, undefined, expired.request)).status, 'unauthenticated')
  const invalid = capture(tenantAccess)
  assert.equal((await fetchTenantAccess(base, '../other', undefined, invalid.request)).status, 'error')
  assert.equal(invalid.calls.length, 0)
})

test('admin interface shows backend effective state and archived tenant remains read-only', () => {
  assert.match(page, /<AdminTenantAccess/)
  assert.doesNotMatch(client, /AdminTenantAccess|fetchTenantUsers|createTenantUser/)
  assert.match(component, /selectedAccess\.permissions\.includes\(key\)/)
  assert.match(component, /Effectif : \{effective \? 'Oui' : 'Non'\}/)
  assert.match(component, /tenantStatus !== 'active'/)
  assert.match(component, /Ce client archivé est en lecture seule/)
  assert.match(component, /provisioningLabels\[tenantAccess\.provisioning\.status\]/)
  assert.match(component, /role_name \?\? 'Non disponible'/)
  assert.match(component, /onSessionExpired\(\)/)
  assert.match(component, /setPassword\(''\)/)
  assert.match(component, /type="password"/)
  assert.doesNotMatch(component, /localStorage|sessionStorage|console\.|credential|secret|schema_name|SELECT |DROP /)
})
