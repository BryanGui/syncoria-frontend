import type {
  CreateIntegrationCaseDraft,
  IntegrationCase,
} from '../api/integrationCases.ts'


export const INITIAL_INTEGRATION_CASE_DRAFT: CreateIntegrationCaseDraft = {
  tenantId: '',
  sourceSystem: '',
  sourceReference: '',
  objective: '',
  instructions: '',
  environment: 'sandbox',
}

export interface IntegrationCaseDraftValidation {
  normalizedDraft: CreateIntegrationCaseDraft
  tenantError: string | null
  sourceError: string | null
  objectiveError: string | null
}

const SOURCE_PATTERN = /^[a-z0-9_-]+$/

export function validateIntegrationCaseDraft(
  draft: CreateIntegrationCaseDraft,
): IntegrationCaseDraftValidation {
  const normalizedDraft = {
    tenantId: draft.tenantId,
    sourceSystem: draft.sourceSystem.trim().toLowerCase(),
    sourceReference: draft.sourceReference.trim(),
    objective: draft.objective.trim(),
    instructions: draft.instructions.trim(),
    environment: 'sandbox' as const,
  }
  return {
    normalizedDraft,
    tenantError: normalizedDraft.tenantId ? null : 'Sélectionnez un client.',
    sourceError: SOURCE_PATTERN.test(normalizedDraft.sourceSystem)
      ? null
      : 'Utilisez uniquement des minuscules, chiffres, tirets ou underscores.',
    objectiveError: normalizedDraft.objective
      ? null
      : 'L’objectif est obligatoire.',
  }
}

export interface CredentialFormState {
  name: string
  secret: string
  status: 'idle' | 'submitting' | 'invalid' | 'error'
}

export type CredentialFormAction =
  | { type: 'change_name'; name: string }
  | { type: 'change_secret'; secret: string }
  | { type: 'submit' }
  | { type: 'reject'; status: 'invalid' | 'error' }
  | { type: 'complete' }

export const INITIAL_CREDENTIAL_FORM_STATE: CredentialFormState = {
  name: '',
  secret: '',
  status: 'idle',
}

export function credentialFormReducer(
  state: CredentialFormState,
  action: CredentialFormAction,
): CredentialFormState {
  switch (action.type) {
    case 'change_name':
      return { ...state, name: action.name, status: 'idle' }
    case 'change_secret':
      return { ...state, secret: action.secret, status: 'idle' }
    case 'submit':
      return { ...state, status: 'submitting' }
    case 'reject':
      return { ...state, secret: '', status: action.status }
    case 'complete':
      return INITIAL_CREDENTIAL_FORM_STATE
  }
}

export function integrateLoadedIntegrationCase(
  integrationCases: IntegrationCase[],
  loadedIntegrationCase: IntegrationCase,
): IntegrationCase[] {
  return [
    loadedIntegrationCase,
    ...integrationCases.filter(({ id }) => id !== loadedIntegrationCase.id),
  ]
}
