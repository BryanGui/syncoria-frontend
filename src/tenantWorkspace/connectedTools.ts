import type { AdminProviderRecord } from '../api/adminTenantProviders.ts'
import { getProviderLabel } from '../providers/catalog.ts'

export interface ConnectedTool {
  id: string
  provider: string
  label: string
  connectionName: string | null
  statusLabel: string
  statusTone: 'ok' | 'muted' | 'warning'
}

export function toConnectedTools(records: readonly AdminProviderRecord[]): ConnectedTool[] {
  return records.map((record) => {
    const label = getProviderLabel(record.provider)
    const name = record.name.trim()
    let statusLabel = 'À vérifier'
    let statusTone: ConnectedTool['statusTone'] = 'warning'

    if (record.status !== 'active') {
      statusLabel = 'Inactif'
      statusTone = 'muted'
    } else if (!record.credential_configured) {
      statusLabel = 'Non configuré'
      statusTone = 'muted'
    } else if (record.last_verified_at !== null && record.last_verification_status === 'ok') {
      statusLabel = 'Connecté'
      statusTone = 'ok'
    } else if (record.last_verification_status === 'error') {
      statusLabel = 'Erreur de vérification'
    }

    return {
      id: record.id,
      provider: record.provider,
      label,
      connectionName: name && name.toLocaleLowerCase() !== label.toLocaleLowerCase() ? name : null,
      statusLabel,
      statusTone,
    }
  })
}
