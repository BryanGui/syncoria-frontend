import type { AdminTenantReport } from '../api/adminTenantReports.ts'

export function isReportDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) || value.startsWith('0000')) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function formatReportDate(value: string): string {
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

export function formatLocalCalendarDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function sortTenantReports(reports: AdminTenantReport[]): AdminTenantReport[] {
  return [...reports].sort((first, second) => {
    const firstKey = `${first.report_date}:${first.id}`
    const secondKey = `${second.report_date}:${second.id}`
    return firstKey === secondKey ? 0 : firstKey > secondKey ? -1 : 1
  })
}
