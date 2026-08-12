import {
  technicalLogger,
  type TechnicalLogger,
} from '../observability/logger.ts'


export interface IntegrationCaseJsonInput {
  id: string
  filename: string
  createdAt: string
}

export interface IntegrationCaseCredential {
  configured: boolean
  id: string | null
  name: string | null
}

export interface IntegrationCase {
  id: string
  tenantId: string
  tenantName: string
  sourceSystem: string
  sourceReference: string | null
  objective: string
  instructions: string | null
  environment: 'sandbox'
  status: 'draft'
  credential: IntegrationCaseCredential
  jsonInputCount: number
  jsonInputs: IntegrationCaseJsonInput[]
  createdAt: string
  updatedAt: string
}

export interface CreateIntegrationCaseDraft {
  tenantId: string
  sourceSystem: string
  sourceReference: string
  objective: string
  instructions: string
  environment: 'sandbox'
}

export type IntegrationCasesResult =
  | { status: 'loaded'; integrationCases: IntegrationCase[] }
  | { status: 'unauthenticated' }
  | { status: 'error' }

export type IntegrationCaseMutationResult =
  | { status: 'loaded'; integrationCase: IntegrationCase }
  | { status: 'invalid' }
  | { status: 'not_found' }
  | { status: 'unauthenticated' }
  | { status: 'error' }

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function parseIntegrationCase(value: unknown): IntegrationCase | null {
  if (
    typeof value !== 'object'
    || value === null
    || !('id' in value && typeof value.id === 'string')
    || !('tenant_id' in value && typeof value.tenant_id === 'string')
    || !('tenant_name' in value && typeof value.tenant_name === 'string')
    || !('source_system' in value && typeof value.source_system === 'string')
    || !('source_reference' in value && isStringOrNull(value.source_reference))
    || !('objective' in value && typeof value.objective === 'string')
    || !('instructions' in value && isStringOrNull(value.instructions))
    || !('environment' in value && value.environment === 'sandbox')
    || !('status' in value && value.status === 'draft')
    || !('credential' in value && typeof value.credential === 'object'
      && value.credential !== null)
    || !('json_input_count' in value
      && typeof value.json_input_count === 'number')
    || !('json_inputs' in value && Array.isArray(value.json_inputs))
    || !('created_at' in value && typeof value.created_at === 'string')
    || !('updated_at' in value && typeof value.updated_at === 'string')
  ) return null

  const credential = value.credential
  if (
    !('configured' in credential && typeof credential.configured === 'boolean')
    || !('id' in credential && isStringOrNull(credential.id))
    || !('name' in credential && isStringOrNull(credential.name))
  ) return null

  const jsonInputs: IntegrationCaseJsonInput[] = []
  for (const jsonInput of value.json_inputs) {
    if (
      typeof jsonInput !== 'object'
      || jsonInput === null
      || !('id' in jsonInput && typeof jsonInput.id === 'string')
      || !('filename' in jsonInput && typeof jsonInput.filename === 'string')
      || !('created_at' in jsonInput && typeof jsonInput.created_at === 'string')
    ) return null
    jsonInputs.push({
      id: jsonInput.id,
      filename: jsonInput.filename,
      createdAt: jsonInput.created_at,
    })
  }

  return {
    id: value.id,
    tenantId: value.tenant_id,
    tenantName: value.tenant_name,
    sourceSystem: value.source_system,
    sourceReference: value.source_reference,
    objective: value.objective,
    instructions: value.instructions,
    environment: value.environment,
    status: value.status,
    credential: {
      configured: credential.configured,
      id: credential.id,
      name: credential.name,
    },
    jsonInputCount: value.json_input_count,
    jsonInputs,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  }
}

function mapMutationStatus(status: number): IntegrationCaseMutationResult | null {
  if (status === 401) return { status: 'unauthenticated' }
  if (status === 404) return { status: 'not_found' }
  if (status === 422) return { status: 'invalid' }
  return null
}

async function readIntegrationCaseResponse(
  response: Response,
  logger: TechnicalLogger,
  action: string,
  endpoint: string,
): Promise<IntegrationCaseMutationResult> {
  const mappedStatus = mapMutationStatus(response.status)
  if (mappedStatus !== null) return mappedStatus
  if (!response.ok) {
    logger.warning('Integration case endpoint returned an error.', {
      page: 'integrations',
      action,
      endpoint,
      httpStatus: response.status,
    })
    return { status: 'error' }
  }
  const parsed = parseIntegrationCase(await response.json())
  if (parsed === null) {
    logger.warning('Integration case endpoint returned an invalid response.', {
      page: 'integrations',
      action,
      endpoint,
      errorType: 'invalid_response',
    })
    return { status: 'error' }
  }
  return { status: 'loaded', integrationCase: parsed }
}

export async function fetchIntegrationCases(
  apiBaseUrl: string | null,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<IntegrationCasesResult> {
  if (apiBaseUrl === null) return { status: 'error' }
  const endpoint = '/admin/integration-cases'
  try {
    const response = await request(`${apiBaseUrl}${endpoint}`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
      method: 'GET',
      signal,
    })
    if (response.status === 401) return { status: 'unauthenticated' }
    if (!response.ok) return { status: 'error' }
    const payload: unknown = await response.json()
    if (!Array.isArray(payload)) return { status: 'error' }
    const integrationCases = payload.map(parseIntegrationCase)
    if (integrationCases.some((integrationCase) => integrationCase === null)) {
      return { status: 'error' }
    }
    return {
      status: 'loaded',
      integrationCases: integrationCases as IntegrationCase[],
    }
  } catch (error: unknown) {
    if (!signal?.aborted) {
      logger.error('Integration cases request failed.', {
        page: 'integrations',
        action: 'load_integration_cases',
        endpoint,
        errorType: error instanceof Error ? error.name : 'UnknownError',
      })
    }
    return { status: 'error' }
  }
}

export async function fetchIntegrationCase(
  apiBaseUrl: string | null,
  integrationCaseId: string,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<IntegrationCaseMutationResult> {
  if (apiBaseUrl === null) return { status: 'error' }
  const endpoint = `/admin/integration-cases/${encodeURIComponent(integrationCaseId)}`
  try {
    const response = await request(`${apiBaseUrl}${endpoint}`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
      method: 'GET',
      signal,
    })
    return readIntegrationCaseResponse(response, logger, 'load_integration_case', endpoint)
  } catch (error: unknown) {
    if (!signal?.aborted) {
      logger.error('Integration case detail request failed.', {
        page: 'integrations',
        action: 'load_integration_case',
        endpoint,
        errorType: error instanceof Error ? error.name : 'UnknownError',
      })
    }
    return { status: 'error' }
  }
}

export async function createIntegrationCase(
  apiBaseUrl: string | null,
  draft: CreateIntegrationCaseDraft,
  request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<IntegrationCaseMutationResult> {
  if (apiBaseUrl === null) return { status: 'error' }
  const endpoint = '/admin/integration-cases'
  try {
    const response = await request(`${apiBaseUrl}${endpoint}`, {
      body: JSON.stringify({
        tenant_id: draft.tenantId,
        source_system: draft.sourceSystem,
        source_reference: draft.sourceReference || null,
        objective: draft.objective,
        instructions: draft.instructions || null,
        environment: draft.environment,
      }),
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      method: 'POST',
    })
    return readIntegrationCaseResponse(response, logger, 'create_integration_case', endpoint)
  } catch (error: unknown) {
    logger.error('Integration case creation request failed.', {
      page: 'integrations',
      action: 'create_integration_case',
      endpoint,
      errorType: error instanceof Error ? error.name : 'UnknownError',
    })
    return { status: 'error' }
  }
}

export async function configureIntegrationCaseCredential(
  apiBaseUrl: string | null,
  integrationCaseId: string,
  input: { name: string; secret: string },
  request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<IntegrationCaseMutationResult> {
  if (apiBaseUrl === null) return { status: 'error' }
  const endpoint = `/admin/integration-cases/${encodeURIComponent(integrationCaseId)}/credential`
  try {
    const response = await request(`${apiBaseUrl}${endpoint}`, {
      body: JSON.stringify(input),
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      method: 'POST',
    })
    return readIntegrationCaseResponse(response, logger, 'configure_integration_credential', endpoint)
  } catch (error: unknown) {
    logger.error('Integration credential request failed.', {
      page: 'integrations',
      action: 'configure_integration_credential',
      endpoint,
      errorType: error instanceof Error ? error.name : 'UnknownError',
    })
    return { status: 'error' }
  }
}

export async function addIntegrationCaseJsonInput(
  apiBaseUrl: string | null,
  integrationCaseId: string,
  input: { filename: string; payload: unknown },
  request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<IntegrationCaseMutationResult> {
  if (apiBaseUrl === null) return { status: 'error' }
  const endpoint = `/admin/integration-cases/${encodeURIComponent(integrationCaseId)}/json-inputs`
  try {
    const response = await request(`${apiBaseUrl}${endpoint}`, {
      body: JSON.stringify(input),
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      method: 'POST',
    })
    return readIntegrationCaseResponse(response, logger, 'add_integration_json', endpoint)
  } catch (error: unknown) {
    logger.error('Integration JSON request failed.', {
      page: 'integrations',
      action: 'add_integration_json',
      endpoint,
      errorType: error instanceof Error ? error.name : 'UnknownError',
    })
    return { status: 'error' }
  }
}
