import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createAdminFollowUpApi,
  parseFollowUpAction,
  parseFollowUpPage,
  followUpQuery,
} from '../src/api/adminFollowUp.ts'
import { createAdminProspectingApi } from '../src/api/adminProspecting.ts'
import { FOLLOW_UP_STATUS_LABELS, changedActionFields } from '../src/followUp/model.ts'
import {
  toParisLocal,
  parisLocalInstants,
  formDeadline,
  deadlineChoiceLabel,
  formatDeadline,
} from '../src/followUp/dates.ts'

const id = '11111111-1111-4111-8111-111111111111'
const companyId = '22222222-2222-4222-8222-222222222222'
const otherId = '33333333-3333-4333-8333-333333333333'
const action = {
  id,
  subject_type: 'prospecting.company',
  subject_id: companyId,
  title: 'Préparer un rendez-vous',
  status: 'todo',
  due_at: '2026-10-24T08:15:23.456Z',
  notes: null,
  created_at: '2026-10-06T00:00:00Z',
  updated_at: '2026-10-06T00:00:00Z',
}
const page = {
  items: [
    {
      action,
      subject: { label: 'Entreprise exemple', company_id: companyId },
      is_overdue: false,
    },
  ],
  has_more: false,
  limit: 25,
  offset: 0,
  as_of: '2026-10-06T00:00:00Z',
  timezone: 'Europe/Paris',
}
const input = Object.fromEntries(
  Object.entries(action).filter(
    ([key]) => !['id', 'created_at', 'updated_at'].includes(key),
  ),
)
function setup(value = page, status = 200) {
  const calls = [],
    logs = []
  const logger = Object.fromEntries(
    ['info', 'warning', 'error'].map((level) => [level, (...args) => logs.push(args)]),
  )
  const api = createAdminFollowUpApi(
    'https://api.example.test',
    async (url, options) => {
      calls.push({ url, ...options })
      return Response.json(value, { status })
    },
    logger,
  )
  return { api, calls, logs, logger }
}

test('FollowUp action accepts exactly nine fields and arbitrary opaque subject types', () => {
  assert.deepEqual(parseFollowUpAction(action), action)
  assert.deepEqual(parseFollowUpAction({ ...action, subject_type: 'support.ticket' }), {
    ...action,
    subject_type: 'support.ticket',
  })
  assert.deepEqual(FOLLOW_UP_STATUS_LABELS, {
    todo: 'À faire',
    waiting: 'En attente',
    done: 'Terminée',
  })
})
test('FollowUp rejects malformed records and technical/business extensions', () => {
  for (const value of [
    null,
    [],
    {},
    { ...action, owner_id: otherId },
    { ...action, title: ' ' },
    { ...action, title: 'x'.repeat(201) },
    { ...action, notes: 'x'.repeat(4001) },
    { ...action, title: 'x\0' },
    { ...action, status: 'toString' },
    { ...action, subject_type: 'Prospecting.Company' },
    { ...action, subject_type: 'prospecting..company' },
    { ...action, subject_id: 'bad' },
    { ...action, id: '../tenants' },
    { ...action, due_at: '2026-10-24T08:15' },
    { ...action, due_at: 12 },
    { ...action, updated_at: 'yesterday' },
  ])
    assert.equal(parseFollowUpAction(value), null)
})
test('worklist validates projection metadata and refuses foreign or unsupported subject navigation', () => {
  assert.deepEqual(parseFollowUpPage(page), page)
  const neutral = {
    action: { ...action, subject_type: 'support.ticket' },
    subject: { label: 'Sujet indisponible', company_id: null },
    is_overdue: false,
  }
  assert.ok(parseFollowUpPage({ ...page, items: [neutral] }))
  for (const value of [
    { ...page, timezone: 'UTC' },
    { ...page, tenant_id: otherId },
    { ...page, has_more: 1 },
    { ...page, limit: 201 },
    { ...page, offset: -1 },
    { ...page, as_of: 'invalid' },
    {
      ...page,
      items: [
        { ...page.items[0], subject: { label: 'Nom étranger', company_id: otherId } },
      ],
    },
    {
      ...page,
      items: [{ ...neutral, subject: { label: 'Entreprise', company_id: companyId } }],
    },
    {
      ...page,
      items: [
        { ...page.items[0], action: { ...action, status: 'done' }, is_overdue: true },
      ],
    },
    {
      ...page,
      items: [
        {
          ...page.items[0],
          subject: {
            label: 'Entreprise',
            company_id: companyId,
            email: 'private@example.test',
          },
        },
      ],
    },
  ])
    assert.equal(parseFollowUpPage(value), null)
})
test('all worklist filters are encoded together before server pagination; literal searches remain intact', () => {
  const params = new URLSearchParams(
    followUpQuery({
      view: 'waiting',
      due: 'today',
      q: '  50%_\\ réunion  ',
      subject_type: 'prospecting.company',
      subject_id: companyId,
      sort: 'updated_at',
      limit: 10,
      offset: 30,
    }),
  )
  assert.deepEqual(Object.fromEntries(params), {
    view: 'waiting',
    due: 'today',
    sort: 'updated_at',
    limit: '10',
    offset: '30',
    q: '50%_\\ réunion',
    subject_type: 'prospecting.company',
    subject_id: companyId,
  })
  assert.equal(new URLSearchParams(followUpQuery({})).get('view'), 'in_progress')
  assert.equal(new URLSearchParams(followUpQuery({ q: '  ' })).has('q'), false)
  for (const query of [
    { view: 'archived' },
    { view: 'constructor' },
    { due: 'yesterday' },
    { sort: 'title' },
    { subject_id: companyId },
    { subject_type: 'support.ticket', subject_id: 'bad' },
    { limit: 0 },
    { limit: 201 },
    { offset: -1 },
    { offset: 1_000_001 },
    { q: 'x'.repeat(201) },
    { q: '\0' },
  ])
    assert.equal(followUpQuery(query), null)
})
test('worklist client uses session credentials, cancellable real API and separate projection', async () => {
  const { api, calls } = setup()
  const controller = new AbortController()
  assert.deepEqual(await api.worklist({ due: 'none', offset: 25 }, controller.signal), {
    status: 'loaded',
    value: page,
  })
  assert.equal(
    calls[0].url,
    'https://api.example.test/admin/follow-up/worklist?view=in_progress&due=none&sort=due_at&limit=25&offset=25',
  )
  assert.equal(calls[0].method, 'GET')
  assert.equal(calls[0].credentials, 'include')
  assert.equal(calls[0].signal, controller.signal)
})
test('mutations use existing routes and PATCH cannot reassign subjects or technical scope', async () => {
  const { api, calls } = setup(action)
  assert.equal(
    (await api.createAction({ ...input, owner_id: otherId, company_name: 'Private' }))
      .status,
    'loaded',
  )
  assert.deepEqual(JSON.parse(calls[0].body), input)
  assert.equal(calls[0].url, 'https://api.example.test/admin/follow-up/actions')
  assert.equal(calls[0].method, 'POST')
  assert.equal(
    (
      await api.updateAction(id, {
        title: 'Révisé',
        due_at: null,
        notes: null,
        subject_id: otherId,
        subject_type: 'other.record',
        owner_id: otherId,
      })
    ).status,
    'loaded',
  )
  assert.deepEqual(JSON.parse(calls[1].body), {
    title: 'Révisé',
    due_at: null,
    notes: null,
  })
  assert.equal(calls[1].method, 'PATCH')
  assert.equal((await api.updateAction(id, { status: 'done' })).status, 'loaded')
  assert.deepEqual(JSON.parse(calls[2].body), { status: 'done' })
  assert.ok(calls.every((call) => call.credentials === 'include'))
})
test('invalid IDs, empty PATCH and invalid query make no HTTP request', async () => {
  const { api, calls } = setup()
  assert.equal((await api.worklist({ subject_id: companyId })).status, 'invalid')
  assert.equal((await api.updateAction('bad', { status: 'done' })).status, 'invalid')
  assert.equal((await api.updateAction(id, { subject_id: otherId })).status, 'invalid')
  assert.equal(calls.length, 0)
  assert.equal(
    (await setup({ ...action, id: otherId }).api.updateAction(id, { title: 'New' }))
      .status,
    'error',
  )
})
for (const [code, status] of [
  [401, 'unauthenticated'],
  [404, 'not_found'],
  [422, 'invalid'],
  [503, 'unavailable'],
  [500, 'error'],
]) {
  test(`FollowUp handles HTTP ${code} without logging records or server errors`, async () => {
    const { api, logs } = setup({ detail: 'private@example.test secret SQL' }, code)
    for (const run of [
      () => api.worklist({ q: 'private@example.test' }),
      () => api.createAction({ ...input, title: 'private@example.test' }),
      () => api.updateAction(id, { notes: 'secret SQL' }),
    ])
      assert.deepEqual(await run(), { status })
    for (const secret of ['private@example.test', 'secret SQL', id, companyId])
      assert.ok(!JSON.stringify(logs).includes(secret))
  })
}
test('network, invalid JSON and abort errors are sanitized without fixture substitution', async () => {
  const { logger, logs } = setup()
  const api = createAdminFollowUpApi(
    'https://api.example.test',
    async () => {
      throw new Error('private@example.test')
    },
    logger,
  )
  assert.deepEqual(await api.worklist(), { status: 'error' })
  assert.ok(!JSON.stringify(logs).includes('private@example.test'))
  const count = logs.length,
    controller = new AbortController()
  controller.abort()
  await api.worklist({}, controller.signal)
  assert.equal(logs.length, count)
  assert.equal((await createAdminFollowUpApi(null).worklist()).status, 'unavailable')
  assert.equal(
    (
      await createAdminFollowUpApi(
        'https://api.example.test',
        async () => new Response('bad json'),
        logger,
      ).worklist()
    ).status,
    'error',
  )
})
test('company selection adds compatible server search while preserving existing list signature', async () => {
  const calls = []
  const api = createAdminProspectingApi(
    'https://api.example.test',
    async (url, options) => {
      calls.push({ url, ...options })
      return Response.json([])
    },
  )
  const controller = new AbortController()
  assert.equal(
    (await api.listCompanies(11, 20, controller.signal, '  Test%_  ')).status,
    'loaded',
  )
  assert.equal(
    calls[0].url,
    'https://api.example.test/admin/prospecting/companies?limit=11&offset=20&q=Test%25_',
  )
  assert.equal(calls[0].signal, controller.signal)
  assert.equal((await api.listCompanies()).status, 'loaded')
  assert.equal(
    calls[1].url,
    'https://api.example.test/admin/prospecting/companies?limit=25&offset=0',
  )
  assert.equal(
    (await api.listCompanies(25, 0, undefined, 'x'.repeat(201))).status,
    'invalid',
  )
  assert.equal((await api.listCompanies(25, 0, undefined, 4)).status, 'invalid')
  assert.equal((await api.listCompanies(25, 0, undefined, '\0')).status, 'invalid')
  assert.equal(calls.length, 2)
})

test('Paris input and rendering use explicit timezone in winter and summer, including midnight', () => {
  assert.equal(toParisLocal('2026-01-14T23:30:00Z'), '2026-01-15T00:30')
  assert.equal(toParisLocal('2026-07-14T22:30:00Z'), '2026-07-15T00:30')
  assert.deepEqual(parisLocalInstants('2026-01-15T00:30'), ['2026-01-14T23:30:00.000Z'])
  assert.deepEqual(parisLocalInstants('2026-07-15T00:30'), ['2026-07-14T22:30:00.000Z'])
  assert.match(formatDeadline('2026-01-14T23:30:00Z'), /15 janv\. 2026,? (?:à )?00:30/)
})
test('spring missing local hour is rejected and invalid calendar dates cannot normalize silently', () => {
  for (const local of [
    '2026-03-29T02:30',
    '2026-02-30T10:00',
    '2026-10-25T24:00',
    'bad',
    '2026-10-25T02:30:00',
  ])
    assert.deepEqual(parisLocalInstants(local), [])
  assert.throws(
    () => formDeadline({ dueLocal: '2026-03-29T02:30', occurrence: '' }, null),
    /n’existe pas/,
  )
})
test('Paris historical IANA offsets are derived rather than silently restricted to UTC+1/+2', () => {
  assert.deepEqual(parisLocalInstants('1890-01-15T12:00'), ['1890-01-15T11:50:39.000Z'])
  assert.equal(toParisLocal('1890-01-15T11:50:39.000Z'), '1890-01-15T12:00')
  assert.equal(
    formDeadline({ dueLocal: '1890-01-15T12:00', occurrence: '' }, null),
    '1890-01-15T11:50:39.000Z',
  )
  assert.deepEqual(parisLocalInstants('9999-12-31T23:00'), ['9999-12-31T22:00:00.000Z'])
})
test('autumn repeated local hour requires explicit occurrence; both choices use UTC', () => {
  const instants = parisLocalInstants('2026-10-25T02:30')
  assert.deepEqual(instants, ['2026-10-25T00:30:00.000Z', '2026-10-25T01:30:00.000Z'])
  assert.throws(
    () => formDeadline({ dueLocal: '2026-10-25T02:30', occurrence: '' }, null),
    /occurrence/,
  )
  assert.equal(
    formDeadline({ dueLocal: '2026-10-25T02:30', occurrence: instants[0] }, null),
    instants[0],
  )
  assert.equal(
    formDeadline({ dueLocal: '2026-10-25T02:30', occurrence: instants[1] }, null),
    instants[1],
  )
  assert.equal(deadlineChoiceLabel(instants[0]), 'Première occurrence (UTC+2)')
  assert.equal(deadlineChoiceLabel(instants[1]), 'Seconde occurrence (UTC+1)')
})
test('editing title preserves exact untouched deadline precision and explicit null clears nullable fields', () => {
  const due = formDeadline(
    { dueLocal: toParisLocal(action.due_at), occurrence: '' },
    action.due_at,
  )
  assert.equal(due, action.due_at)
  assert.deepEqual(
    changedActionFields(
      { title: 'Révisé', status: action.status, due_at: due, notes: action.notes },
      action,
    ),
    { title: 'Révisé' },
  )
  assert.deepEqual(
    changedActionFields({ due_at: null, notes: null }, { ...action, notes: 'Note' }),
    { due_at: null, notes: null },
  )
  assert.equal(formDeadline({ dueLocal: '', occurrence: '' }, action.due_at), null)
  const ambiguous = '2026-10-25T01:30:24.456Z'
  assert.equal(
    formDeadline(
      { dueLocal: '2026-10-25T02:30', occurrence: '2026-10-25T01:30:00.000Z' },
      ambiguous,
    ),
    ambiguous,
  )
  assert.equal(
    formDeadline(
      { dueLocal: '2026-10-25T02:30', occurrence: '2026-10-25T00:30:00.000Z' },
      ambiguous,
    ),
    '2026-10-25T00:30:00.000Z',
  )
})
