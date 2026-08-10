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
): Promise<HealthStatus> {
  if (apiBaseUrl === null) {
    return 'unavailable'
  }

  try {
    const response = await request(`${apiBaseUrl}${endpoint}`, {
      headers: { Accept: 'application/json' },
      method: 'GET',
      signal,
    })

    if (!response.ok) {
      return 'unavailable'
    }

    const responsePayload: unknown = await response.json()
    return isHealthResponse(responsePayload) && responsePayload.status === 'ok'
      ? 'operational'
      : 'unavailable'
  } catch {
    return 'unavailable'
  }
}
