import {
  technicalLogger,
  type TechnicalLogger,
} from '../observability/logger.ts'

export type HealthEndpoint = '/health' | '/health/db'
export type HealthStatus = 'loading' | 'operational' | 'unavailable'

export const INITIAL_HEALTH_STATUS: HealthStatus = 'loading'

interface HealthResponse {
  status: string
}

export function normalizeApiBaseUrl(configuredUrl: string | undefined): string | null {
  const apiBaseUrl = configuredUrl?.trim().replace(/\/+$/, '')
  return apiBaseUrl || null
}

function isHealthResponse(value: unknown): value is HealthResponse {
  return (
    typeof value === 'object'
    && value !== null
    && 'status' in value
    && typeof value.status === 'string'
  )
}

export async function fetchHealthStatus(
  apiBaseUrl: string | null,
  endpoint: HealthEndpoint,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
  logger: TechnicalLogger = technicalLogger,
): Promise<HealthStatus> {
  if (apiBaseUrl === null) {
    logger.warning('API base URL is not configured.', {
      page: 'dashboard',
      action: 'load_health_status',
      endpoint,
      errorType: 'configuration_error',
    })
    return 'unavailable'
  }

  try {
    const response = await request(`${apiBaseUrl}${endpoint}`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
      method: 'GET',
      signal,
    })

    if (!response.ok) {
      logger.warning('Health endpoint returned an unavailable response.', {
        page: 'dashboard',
        action: 'load_health_status',
        endpoint,
        httpStatus: response.status,
      })
      return 'unavailable'
    }

    const responsePayload: unknown = await response.json()
    if (!isHealthResponse(responsePayload) || responsePayload.status !== 'ok') {
      logger.warning('Health endpoint returned an invalid response.', {
        page: 'dashboard',
        action: 'load_health_status',
        endpoint,
        errorType: 'invalid_response',
      })
      return 'unavailable'
    }

    return 'operational'
  } catch (error: unknown) {
    if (signal?.aborted) {
      return 'unavailable'
    }

    logger.error('Health endpoint request failed.', {
      page: 'dashboard',
      action: 'load_health_status',
      endpoint,
      errorType: error instanceof Error ? error.name : 'UnknownError',
    })
    return 'unavailable'
  }
}
