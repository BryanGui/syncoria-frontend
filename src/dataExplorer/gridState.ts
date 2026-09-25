import type { ExplorerColumn, ExplorerSort } from '../api/dataExplorer.ts'

export interface GridColumnState { name: string; width: number; visible: boolean; technical: boolean; sortable: boolean }
export interface CellRange { startRow: number; endRow: number; startColumn: number; endColumn: number }

export function businessColumns(columns: ExplorerColumn[]): GridColumnState[] {
  return [...columns]
    .sort((left, right) => left.ordinal_position - right.ordinal_position)
    .filter((column) => !column.is_technical && !column.name.startsWith('__syncoria_'))
    .map((column) => ({ name: column.name, width: 180, visible: true, technical: false,
      sortable: column.type_family !== 'other' || column.data_type === 'uuid' }))
}

export function resizeColumn(columns: GridColumnState[], name: string, width: number): GridColumnState[] {
  return columns.map((column) => column.name === name
    ? { ...column, width: Math.max(70, Math.min(800, Math.round(width))) } : column)
}

export function reorderColumn(columns: GridColumnState[], source: string, target: string): GridColumnState[] {
  const from = columns.findIndex((column) => column.name === source)
  const to = columns.findIndex((column) => column.name === target)
  if (from < 0 || to < 0 || from === to) return columns
  const next = [...columns]
  next.splice(to, 0, ...next.splice(from, 1))
  return next
}

export function trustedSorts(sorts: ExplorerSort[], columns: GridColumnState[]): ExplorerSort[] {
  const allowed = new Set(columns.filter((column) => column.visible && !column.technical && column.sortable).map((column) => column.name))
  return sorts.filter((sort) => allowed.has(sort.column)).slice(0, 5)
}

function clipboardValue(value: unknown): string {
  const text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)
  return /[\t\r\n"]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function rangeToTsv(rows: Record<string, unknown>[], columns: string[], range: CellRange): string {
  const lines: string[] = []
  for (let row = Math.min(range.startRow, range.endRow); row <= Math.max(range.startRow, range.endRow); row++) {
    if (!rows[row]) continue
    const cells: string[] = []
    for (let col = Math.min(range.startColumn, range.endColumn); col <= Math.max(range.startColumn, range.endColumn); col++) {
      cells.push(clipboardValue(rows[row][columns[col]]))
    }
    lines.push(cells.join('\t'))
  }
  return lines.join('\r\n')
}
