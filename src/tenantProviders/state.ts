import type {
  AdminProvider,
  AdminProviderRecord,
  ProviderVerificationResult,
} from '../api/adminTenantProviders.ts'

export type ProviderConnectionState = 'not_configured' | 'pending' | 'ok' | 'error'

export function selectProviderRecord(
  providers: readonly AdminProviderRecord[],
  provider: AdminProvider,
): AdminProviderRecord | null {
  const candidates = providers.filter((item) => item.provider === provider)
  return candidates.find((item) => item.status === 'active')
    ?? candidates.reduce<AdminProviderRecord | null>((latest, item) => {
      if (latest === null) return item
      return Date.parse(item.updated_at) >= Date.parse(latest.updated_at) ? item : latest
    }, null)
    ?? null
}

export function upsertProviderRecord(
  providers: readonly AdminProviderRecord[],
  provider: AdminProviderRecord,
): AdminProviderRecord[] {
  const withoutCurrent = providers.filter((item) => item.id !== provider.id)
  return [...withoutCurrent, provider]
}

export function applyProviderVerification(
  provider: AdminProviderRecord,
  verification: ProviderVerificationResult,
): AdminProviderRecord {
  return {
    ...provider,
    last_verified_at: verification.checked_at,
    last_verification_status: verification.status,
    last_verification_http_status: verification.http_status,
    last_verification_code: verification.code,
    last_verification_message: verification.message,
  }
}

export function getProviderConnectionState(
  provider: AdminProviderRecord | null,
): ProviderConnectionState {
  if (provider === null || !provider.credential_configured) return 'not_configured'
  if (provider.last_verified_at === null || provider.last_verification_status === null) {
    return 'pending'
  }
  return provider.last_verification_status === 'ok' ? 'ok' : 'error'
}

export function getProviderConnectionLabel(state: ProviderConnectionState): string {
  if (state === 'not_configured') return 'Non configurée'
  if (state === 'pending') return 'À vérifier'
  if (state === 'ok') return 'OK'
  return 'Erreur'
}
