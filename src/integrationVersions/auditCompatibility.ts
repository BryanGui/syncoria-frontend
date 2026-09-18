import type { AdminTenantReport } from '../api/adminTenantReports.ts'

export function compatibleGlobalAuditReports(
  reports: AdminTenantReport[],
  providerRecordIds: string[],
): AdminTenantReport[] {
  if (providerRecordIds.length === 0) return []
  const expected = new Set(providerRecordIds)
  return reports.filter((report) => {
    if (report.status !== 'completed' || report.scope_kind !== 'global'
      || !report.has_usable_ddl
      || report.tenant_provider_record_ids.length !== expected.size) return false
    return report.tenant_provider_record_ids.every((providerId) => expected.has(providerId))
  }).sort((first, second) => {
    const createdAtOrder = (second.created_at ?? '').localeCompare(first.created_at ?? '')
    return createdAtOrder || second.id.localeCompare(first.id)
  })
}
