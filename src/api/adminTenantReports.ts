import { isReportDate, sortTenantReports } from '../tenantReports/model.ts'

export interface AdminTenantReport {
  id: string
  title: string
  provider: string
  report_date: string
  status: 'completed' | 'archived'
  sources_analyzed: number
  sources_retained: number
  sources_excluded: number
  records_retained: number
  decisions_required: number | null
}

export type AdminTenantReportsResult =
  | { status: 'loaded'; reports: AdminTenantReport[] }
  | { status: 'unauthenticated' | 'not_found' | 'error' }

const reportIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const tenantIdPattern = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i

function parseReport(value: unknown): AdminTenantReport | null {
  if (typeof value !== 'object' || value === null) return null
  const report = value as Record<string, unknown>
  const counts = ['sources_analyzed', 'sources_retained', 'sources_excluded', 'records_retained'] as const
  if (typeof report.id !== 'string' || report.id.length > 80 || !reportIdPattern.test(report.id)
    || typeof report.title !== 'string' || !report.title || report.title.length > 120
    || typeof report.provider !== 'string' || report.provider.length > 64 || !reportIdPattern.test(report.provider)
    || !isReportDate(report.report_date)
    || (report.status !== 'completed' && report.status !== 'archived')
    || counts.some((key) => !Number.isSafeInteger(report[key]) || (report[key] as number) < 0)
    || (report.decisions_required !== null && (!Number.isSafeInteger(report.decisions_required) || (report.decisions_required as number) < 0))) return null
  return {
    id: report.id, title: report.title, status: report.status,
    provider: report.provider, report_date: report.report_date,
    sources_analyzed: report.sources_analyzed as number,
    sources_retained: report.sources_retained as number,
    sources_excluded: report.sources_excluded as number,
    records_retained: report.records_retained as number,
    decisions_required: report.decisions_required as number | null,
  }
}

export async function fetchAdminTenantReports(
  apiBaseUrl: string | null, tenantId: string, signal?: AbortSignal,
  request: typeof fetch = fetch,
): Promise<AdminTenantReportsResult> {
  if (apiBaseUrl === null || !tenantIdPattern.test(tenantId)) return { status: 'error' }
  try {
    const response = await request(`${apiBaseUrl}/admin/tenants/${tenantId}/reports`, {
      method: 'GET', credentials: 'include', headers: { Accept: 'application/json' }, signal,
    })
    if (response.status === 401) return { status: 'unauthenticated' }
    if (response.status === 404) return { status: 'not_found' }
    if (!response.ok) return { status: 'error' }
    const payload: unknown = await response.json()
    if (!Array.isArray(payload) || payload.length > 100) return { status: 'error' }
    const reports = payload.map(parseReport)
    if (reports.some((report) => report === null)) return { status: 'error' }
    const validReports = reports as AdminTenantReport[]
    if (new Set(validReports.map((report) => report.id)).size !== validReports.length) return { status: 'error' }
    return { status: 'loaded', reports: sortTenantReports(validReports) }
  } catch {
    return { status: 'error' }
  }
}

export function buildAdminTenantReportPdfUrl(
  apiBaseUrl: string | null, tenantId: string, reportId: string, download = false,
): string | undefined {
  if (apiBaseUrl === null || !tenantIdPattern.test(tenantId)
    || reportId.length > 80 || !reportIdPattern.test(reportId)) return undefined
  return `${apiBaseUrl}/admin/tenants/${tenantId}/reports/${reportId}/pdf${download ? '?download=true' : ''}`
}


export type ArchiveAdminTenantReportResult =
  | { status: 'archived'; report: AdminTenantReport }
  | { status: 'unauthenticated' | 'not_found' | 'error' }

export async function archiveAdminTenantReport(
  apiBaseUrl: string | null, tenantId: string, reportId: string,
  signal?: AbortSignal, request: typeof fetch = fetch,
): Promise<ArchiveAdminTenantReportResult> {
  if (apiBaseUrl === null || !tenantIdPattern.test(tenantId)
    || reportId.length > 80 || !reportIdPattern.test(reportId)) return { status: 'error' }
  try {
    const response = await request(`${apiBaseUrl}/admin/tenants/${tenantId}/reports/${reportId}/archive`, {
      method: 'POST', credentials: 'include', headers: { Accept: 'application/json' }, signal,
    })
    if (response.status === 401) return { status: 'unauthenticated' }
    if (response.status === 404) return { status: 'not_found' }
    if (!response.ok) return { status: 'error' }
    const report = parseReport(await response.json())
    if (!report || report.id !== reportId || report.status !== 'archived') return { status: 'error' }
    return { status: 'archived', report }
  } catch {
    return { status: 'error' }
  }
}
