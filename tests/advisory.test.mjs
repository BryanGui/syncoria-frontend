import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseAdvisoryDossier,
  fetchAdvisoryDossier,
  saveAdvisoryRecord,
  safeLauncherUrl,
} from '../src/api/advisory.ts'
import {
  emptyAdvisory,
  completeAdvisory,
  advisoryTenantId,
  advisoryOtherTenantId,
} from './advisoryFixtures.mjs'

test('empty and complete dossier preserve advisory summaries, links and unknown assessments', () => {
  assert.equal(
    parseAdvisoryDossier(emptyAdvisory(), advisoryTenantId).profile,
    null,
  )
  const dossier = parseAdvisoryDossier(completeAdvisory(), advisoryTenantId)
  assert.equal(dossier.contacts[0].contact_type, 'ai_referent')
  assert.equal(dossier.opportunities[0].feasibility, 'unknown')
  assert.equal(dossier.decisions[0].rationale, 'Limiter le risque métier')
  assert.equal(dossier.actions[0].need_id, dossier.needs[0].need_id)
})
test('cross-tenant records, unexpected secret fields, invalid enums and unsafe URLs fail closed', () => {
  for (const collection of [
    'profile',
    'contacts',
    'needs',
    'opportunities',
    'decisions',
    'engagements',
    'actions',
    'provider_access',
    'recent_timeline',
  ]) {
    for (const extra of [
      { tenant_id: advisoryOtherTenantId },
      { password: 'sentinel' },
      { cookie: 'sentinel' },
    ]) {
      const payload = completeAdvisory()
      const record =
        collection === 'profile' ? payload.profile : payload[collection][0]
      Object.assign(record, extra)
      assert.equal(parseAdvisoryDossier(payload, advisoryTenantId), null)
    }
  }
  for (const url of [
    'http://example.test',
    'https://user:pass@example.test/',
    'https://example.test/?token=sentinel',
    'https://example.test/#sentinel',
    'https://example.test/?%74oken=x',
    'https://example.test\\@evil.test/',
    'https://example.test/%0a',
  ]) {
    assert.equal(safeLauncherUrl(url), false)
    const payload = completeAdvisory()
    payload.provider_access[0].login_url = url
    assert.equal(parseAdvisoryDossier(payload, advisoryTenantId), null)
  }
  for (const extra of [
    { provenance: 'provider' },
    { status: 'invented' },
    { status: 'completed' },
  ]) {
    const payload = completeAdvisory()
    Object.assign(payload.actions[0], extra)
    assert.equal(parseAdvisoryDossier(payload, advisoryTenantId), null)
  }
  assert.equal(
    parseAdvisoryDossier(completeAdvisory(), advisoryOtherTenantId),
    null,
  )
})
test('fetch is admin cookie scoped, rejects demo identifiers and distinguishes API failures', async () => {
  let calls = 0
  const request = async (url, options) => {
    calls++
    assert.equal(
      url,
      `https://api.test/admin/advisory/tenants/${advisoryTenantId}/dossier`,
    )
    assert.equal(options.credentials, 'include')
    return new Response(JSON.stringify(emptyAdvisory()))
  }
  assert.equal(
    (
      await fetchAdvisoryDossier(
        'https://api.test',
        advisoryTenantId,
        undefined,
        request,
      )
    ).status,
    'loaded',
  )
  assert.equal(
    (
      await fetchAdvisoryDossier(
        'https://api.test',
        'demo:1',
        undefined,
        request,
      )
    ).status,
    'unavailable',
  )
  assert.equal(calls, 1)
  for (const [status, expected] of [
    [401, 'unauthenticated'],
    [404, 'not_found'],
    [409, 'archived'],
    [422, 'invalid'],
    [503, 'unavailable'],
  ]) {
    const result = await fetchAdvisoryDossier(
      'https://api.test',
      advisoryTenantId,
      undefined,
      async () => new Response('{}', { status }),
    )
    assert.equal(result.status, expected)
    assert.equal('data' in result, false)
  }
})
test('create, profile upsert and edits use strict JSON and reject foreign responses', async () => {
  const fixture = completeAdvisory()
  for (const [resource, record, id, method] of [
    ['profile', fixture.profile, undefined, 'PUT'],
    ['needs', fixture.needs[0], undefined, 'POST'],
    [
      'provider_access',
      fixture.provider_access[0],
      fixture.provider_access[0].access_reference_id,
      'PUT',
    ],
  ]) {
    const result = await saveAdvisoryRecord(
      'https://api.test',
      advisoryTenantId,
      resource,
      { title: 'Résumé' },
      id,
      undefined,
      async (url, options) => {
        assert.equal(options.method, method)
        assert.equal(options.credentials, 'include')
        assert.equal(options.headers['Content-Type'], 'application/json')
        assert.equal(
          url,
          `https://api.test/admin/advisory/tenants/${advisoryTenantId}/${resource.replace('_', '-')}${id ? '/' + id : ''}`,
        )
        return new Response(JSON.stringify(record))
      },
    )
    assert.equal(result.status, 'loaded')
  }
  assert.equal(
    (
      await saveAdvisoryRecord(
        'https://api.test',
        advisoryTenantId,
        'needs',
        { title: 'Résumé' },
        undefined,
        undefined,
        async () =>
          new Response(
            JSON.stringify({
              ...fixture.needs[0],
              tenant_id: advisoryOtherTenantId,
            }),
          ),
      )
    ).status,
    'unavailable',
  )
})

test('malformed or fabricated timeline events are rejected without exceptions', () => {
  for (const event of [
    { event: 'made_up', resource: undefined },
    { event: 'constructor', resource: 'decisions' },
    { event: 'decision_accepted', resource: 'opportunities' },
    { title: 'Unrelated text' },
  ]) {
    const payload = completeAdvisory()
    Object.assign(payload.recent_timeline[0], event)
    assert.equal(parseAdvisoryDossier(payload, advisoryTenantId), null)
  }
})
