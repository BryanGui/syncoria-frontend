import type { InitialIngestionStatus } from './api/adminTenantIngestions'

export function getInitialIngestionStatusLabel(status: InitialIngestionStatus): string {
  if (status === 'pending') return 'En attente'
  if (status === 'running') return 'En cours'
  if (status === 'completed') return 'Terminé'
  if (status === 'partial') return 'Partiel'
  if (status === 'failed') return 'Erreur'
  return 'Interrompu'
}

export function isInitialIngestionActive(status: InitialIngestionStatus): boolean {
  return status === 'pending' || status === 'running'
}

export function getProgressPercentage(processed: number, expected: number | null): number | null {
  if (expected === null || expected <= 0) return null
  return (processed / expected) * 100
}

export function getProgressWidth(processed: number, expected: number | null): number | null {
  const percentage = getProgressPercentage(processed, expected)
  return percentage === null ? null : Math.min(100, percentage)
}

export function getProgressCountLabel(processed: number, expected: number | null): string {
  const percentage = getProgressPercentage(processed, expected)
  if (percentage === null) return `${processed} traités · volume attendu indisponible`
  return `${processed} / ${expected} traités · ${Math.round(percentage)} %`
}

export function isLaunchResponseCurrent(
  selectedProviderId: string,
  launchedProviderId: string,
): boolean {
  return selectedProviderId === launchedProviderId
}
