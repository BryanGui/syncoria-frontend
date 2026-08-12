import assert from 'node:assert/strict'
import test from 'node:test'

import {
  INITIAL_TENANT_CREATION_FORM_STATE,
  integrateCreatedTenant,
  normalizeTenantSlug,
  tenantCreationFormReducer,
  validateTenantCreationDraft,
} from '../src/tenantCreation/form.ts'


test('normalizes the slug exactly as the backend contract', () => {
  assert.equal(normalizeTenantSlug(' Novalia_Talents '), 'novalia_talents')
})

test('validates the client name and safe slug before submission', () => {
  assert.deepEqual(
    validateTenantCreationDraft({
      name: ' Novalia Talents ',
      slug: ' NOVALIA ',
    }),
    {
      nameError: null,
      normalizedName: 'Novalia Talents',
      normalizedSlug: 'novalia',
      slugError: null,
    },
  )

  for (const slug of ['', 'not valid', 'équipe', '-tenant', 'tenant--one']) {
    assert.notEqual(
      validateTenantCreationDraft({ name: 'Client', slug }).slugError,
      null,
    )
  }
})

test('rejects a blank client name', () => {
  const validation = validateTenantCreationDraft({ name: '  ', slug: 'client' })
  assert.equal(validation.nameError, 'Le nom du client est obligatoire.')
})

test('opens, edits, submits and cancels the creation form deterministically', () => {
  let state = tenantCreationFormReducer(
    INITIAL_TENANT_CREATION_FORM_STATE,
    { type: 'open' },
  )
  assert.equal(state.isOpen, true)

  state = tenantCreationFormReducer(state, {
    type: 'change_name',
    name: 'Novalia Talents',
  })
  state = tenantCreationFormReducer(state, {
    type: 'change_slug',
    slug: 'novalia',
  })
  state = tenantCreationFormReducer(state, { type: 'submit' })
  assert.equal(state.status, 'submitting')

  state = tenantCreationFormReducer(state, { type: 'cancel' })
  assert.deepEqual(state, INITIAL_TENANT_CREATION_FORM_STATE)
})

test('preserves the form while exposing conflict and API error states', () => {
  const opened = tenantCreationFormReducer(
    INITIAL_TENANT_CREATION_FORM_STATE,
    { type: 'open' },
  )
  const conflict = tenantCreationFormReducer(opened, {
    type: 'reject',
    status: 'conflict',
  })
  const apiError = tenantCreationFormReducer(opened, {
    type: 'reject',
    status: 'error',
  })

  assert.equal(conflict.isOpen, true)
  assert.equal(conflict.status, 'conflict')
  assert.equal(apiError.isOpen, true)
  assert.equal(apiError.status, 'error')
})

test('makes the created tenant visible and selects its shared workspace', () => {
  const existingTenant = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Zeta',
    slug: 'zeta',
    status: 'active',
  }
  const createdTenant = {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Novalia Talents',
    slug: 'novalia',
    status: 'active',
  }

  assert.deepEqual(integrateCreatedTenant([existingTenant], createdTenant), {
    tenants: [createdTenant, existingTenant],
    tenantIdToOpen: createdTenant.id,
  })
})
