export interface RuntimeConfig {
  readonly apiBaseUrl: string
}

export function parseRuntimeConfig(value: unknown): RuntimeConfig {
  const invalidConfiguration = () => new Error('La configuration des services est invalide.')

  if (typeof value !== 'object' || value === null || !('apiBaseUrl' in value)
    || typeof value.apiBaseUrl !== 'string') {
    throw invalidConfiguration()
  }

  const apiBaseUrl = value.apiBaseUrl.trim().replace(/\/+$/, '')
  let url: URL
  try {
    url = new URL(apiBaseUrl)
  } catch {
    throw invalidConfiguration()
  }

  const hasControlCharacter = [...apiBaseUrl].some((character) =>
    character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  if (!/^https?:\/\//i.test(apiBaseUrl) || !['http:', 'https:'].includes(url.protocol)
    || url.username || url.password || /[?#\\\s]/.test(apiBaseUrl) || hasControlCharacter) {
    throw invalidConfiguration()
  }

  return Object.freeze({ apiBaseUrl })
}

export async function loadRuntimeConfig(
  basePath = '/',
  request: typeof fetch = fetch,
): Promise<RuntimeConfig> {
  const path = basePath.endsWith('/') ? basePath : `${basePath}/`
  const response = await request(`${path}runtime-config.json`, {
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) {
    throw new Error('Impossible de charger la configuration des services.')
  }

  const payload: unknown = await response.json()
  return parseRuntimeConfig(payload)
}
