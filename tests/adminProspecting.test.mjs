import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createAdminProspectingApi,
  parseCompany,
  parseContact,
} from '../src/api/adminProspecting.ts'
import { changedFields, PROSPECT_STATUS_LABELS } from '../src/prospecting/model.ts'

const companyId = '11111111-1111-4111-8111-111111111111'
const contactId = '22222222-2222-4222-8222-222222222222'
const otherId = '33333333-3333-4333-8333-333333333333'
const companyInput = {
  name: 'Entreprise test',
  website: 'https://example.test',
  city: null,
  sector: 'Conseil',
  status: 'identified',
  source: null,
  notes: null,
}
const contactInput = {
  first_name: 'Alex',
  last_name: 'Exemple',
  role: null,
  email: 'alex@example.test',
  phone: null,
  linkedin_url: null,
  notes: null,
}
const dates = { created_at: '2026-10-06T00:00:00Z', updated_at: '2026-10-06T00:00:00Z' }
const company = { ...companyInput, id: companyId, ...dates }
const contact = { ...contactInput, id: contactId, company_id: companyId, ...dates }
function setup(response = company, status = 200) {
  const calls = [],
    logs = []
  const logger = Object.fromEntries(
    ['info', 'warning', 'error'].map((level) => [level, (...args) => logs.push(args)]),
  )
  const api = createAdminProspectingApi(
    'https://api.example.test',
    async (url, options) => {
      calls.push({ url, ...options })
      return Response.json(response, { status })
    },
    logger,
  )
  return { api, calls, logs, logger }
}
const operations = (api) => [
  () => api.listCompanies(),
  () => api.getCompany(companyId),
  () => api.createCompany(companyInput),
  () => api.updateCompany(companyId, { status: 'converted' }),
  () => api.listContacts(companyId),
  () => api.getContact(contactId, companyId),
  () => api.createContact(companyId, contactInput),
  () => api.updateContact(contactId, companyId, { email: null }),
]
test('Company and Contact response contracts accept full backend records, including nullable fields', () => {
  assert.deepEqual(parseCompany(company), company)
  assert.deepEqual(parseContact(contact, companyId), contact)
  assert.equal(parseContact(contact, otherId), null)
})
test('Company validation refuses missing, malformed and infrastructure fields', () => {
  for (const value of [
    null,
    [],
    {},
    { ...company, owner_id: otherId },
    { ...company, id: 'demo:1' },
    { ...company, status: 'active' },
    { ...company, status: 'toString' },
    { ...company, name: ' ' },
    { ...company, name: 'x'.repeat(201) },
    { ...company, website: 'javascript:alert(1)' },
    { ...company, website: 'https://user:password@example.test' },
    { ...company, created_at: 'yesterday' },
    { ...company, notes: 'x'.repeat(4001) },
    { ...company, city: undefined },
  ]) {
    assert.equal(parseCompany(value), null)
  }
})
test('Contact validation refuses malformed, incomplete and foreign company records', () => {
  for (const value of [
    { ...contact, tenant_id: otherId },
    { ...contact, company_id: 'bad' },
    { ...contact, first_name: '' },
    { ...contact, email: 'invalid' },
    { ...contact, last_name: null },
    { ...contact, phone: 'x'.repeat(65) },
    { ...contact, updated_at: null },
    { ...contact, linkedin_url: 'ftp://example.test' },
    { ...contact, role: undefined },
  ])
    assert.equal(parseContact(value), null)
})
test('all five French status labels preserve API values', () => {
  assert.deepEqual(PROSPECT_STATUS_LABELS, {
    identified: 'Identifié',
    contacted: 'Contacté',
    in_discussion: 'En discussion',
    converted: 'Converti',
    closed: 'Clos',
  })
  for (const status of Object.keys(PROSPECT_STATUS_LABELS))
    assert.equal(parseCompany({ ...company, status }).status, status)
})
for (const [code, status] of [
  [401, 'unauthenticated'],
  [404, 'not_found'],
  [422, 'invalid'],
  [503, 'unavailable'],
  [500, 'error'],
]) {
  test(`all operations handle ${code} without echoing backend details or substituting fixtures`, async () => {
    const { api, logs } = setup({ detail: 'private@example.test SQL secret' }, code)
    for (const run of operations(api)) assert.deepEqual(await run(), { status })
    const serialized = JSON.stringify(logs)
    for (const sentinel of ['private@example.test', 'SQL secret', companyId, contactId])
      assert.ok(!serialized.includes(sentinel))
  })
}
test('list and get use real prospecting endpoints, pagination and session credentials', async () => {
  const companies = setup([company])
  const controller = new AbortController()
  assert.deepEqual(await companies.api.listCompanies(25, 50, controller.signal), {
    status: 'loaded',
    value: [company],
  })
  assert.equal(
    companies.calls[0].url,
    'https://api.example.test/admin/prospecting/companies?limit=25&offset=50',
  )
  assert.equal(companies.calls[0].credentials, 'include')
  assert.equal(companies.calls[0].signal, controller.signal)
  const contacts = setup([contact])
  assert.deepEqual(await contacts.api.listContacts(companyId), {
    status: 'loaded',
    value: [contact],
  })
  assert.ok(
    contacts.calls[0].url.endsWith(
      `/companies/${companyId}/contacts?limit=25&offset=0`,
    ),
  )
  assert.deepEqual(await setup(company).api.getCompany(companyId), {
    status: 'loaded',
    value: company,
  })
  assert.deepEqual(await setup(contact).api.getContact(contactId, companyId), {
    status: 'loaded',
    value: contact,
  })
  assert.deepEqual(await setup([]).api.listCompanies(), { status: 'loaded', value: [] })
})
test('company POST and PATCH allow only commercial fields, and converted triggers just one PATCH', async () => {
  const { api, calls } = setup(company)
  assert.equal(
    (await api.createCompany({ ...companyInput, tenant_id: otherId, id: otherId }))
      .status,
    'loaded',
  )
  assert.equal(calls[0].method, 'POST')
  assert.deepEqual(JSON.parse(calls[0].body), companyInput)
  assert.equal(
    (
      await api.updateCompany(companyId, {
        status: 'converted',
        notes: null,
        owner_id: otherId,
      })
    ).status,
    'loaded',
  )
  assert.equal(calls[1].method, 'PATCH')
  assert.deepEqual(JSON.parse(calls[1].body), { status: 'converted', notes: null })
  assert.equal(calls.length, 2)
  assert.ok(
    calls.every(
      (call) =>
        call.url.includes('/admin/prospecting/companies') &&
        call.credentials === 'include',
    ),
  )
})
test('contact POST and PATCH never send a mutable parent, scope, timestamps or identity', async () => {
  const { api, calls } = setup(contact)
  assert.equal(
    (
      await api.createContact(companyId, {
        ...contactInput,
        company_id: otherId,
        id: otherId,
      })
    ).status,
    'loaded',
  )
  assert.deepEqual(JSON.parse(calls[0].body), contactInput)
  assert.equal(calls[0].method, 'POST')
  await api.updateContact(contactId, companyId, {
    email: null,
    company_id: otherId,
    updated_at: dates.updated_at,
  })
  assert.equal(
    calls[1].url,
    `https://api.example.test/admin/prospecting/contacts/${contactId}`,
  )
  assert.equal(calls[1].method, 'PATCH')
  assert.deepEqual(JSON.parse(calls[1].body), { email: null })
})
test('wrong identifiers, foreign contacts and mixed-invalid lists are rejected', async () => {
  assert.deepEqual(await setup({ ...company, id: otherId }).api.getCompany(companyId), {
    status: 'error',
  })
  assert.deepEqual(
    await setup({ ...contact, id: otherId }).api.updateContact(contactId, companyId, {
      role: 'Direction',
    }),
    { status: 'error' },
  )
  assert.deepEqual(
    await setup([{ ...contact, company_id: otherId }]).api.listContacts(companyId),
    { status: 'error' },
  )
  assert.deepEqual(await setup([company, {}]).api.listCompanies(), { status: 'error' })
})
test('invalid identifiers and pagination do not make a request', async () => {
  const { api, calls } = setup()
  for (const result of [
    await api.getCompany('../tenants'),
    await api.listCompanies(201),
    await api.listCompanies(25, -1),
    await api.getContact('demo:1', companyId),
  ])
    assert.equal(result.status, 'invalid')
  assert.equal(calls.length, 0)
})
test('network and JSON errors remain sanitized; aborts do not log personal error messages', async () => {
  const { logger, logs } = setup()
  let api = createAdminProspectingApi(
    'https://api.example.test',
    async () => {
      throw new Error('alex@example.test')
    },
    logger,
  )
  assert.deepEqual(await api.listCompanies(), { status: 'error' })
  assert.ok(!JSON.stringify(logs).includes('alex@example.test'))
  const count = logs.length
  const controller = new AbortController()
  controller.abort()
  await api.listCompanies(25, 0, controller.signal)
  assert.equal(logs.length, count)
  api = createAdminProspectingApi(
    'https://api.example.test',
    async () => new Response('not json'),
    logger,
  )
  assert.deepEqual(await api.listCompanies(), { status: 'error' })
  assert.deepEqual(await createAdminProspectingApi(null).listCompanies(), {
    status: 'unavailable',
  })
})
test('PATCH preserves omitted fields and explicit null', () => {
  assert.deepEqual(changedFields({ ...companyInput, notes: 'Note' }, companyInput), {
    notes: 'Note',
  })
  assert.deepEqual(changedFields({ ...contactInput, email: null }, contactInput), {
    email: null,
  })
  assert.deepEqual(changedFields(companyInput, companyInput), {})
})
