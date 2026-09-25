import type { ExplorerColumn } from '../api/dataExplorer.ts'

export function businessColumns(columns: ExplorerColumn[]): ExplorerColumn[] {
  return [...columns]
    .sort((left, right) => left.ordinal_position - right.ordinal_position)
    .filter((column) => !column.is_technical && !column.name.startsWith('__syncoria_'))
    .slice(0, 100)
}

export function isSortable(column: ExplorerColumn): boolean {
  return column.type_family !== 'other' || column.data_type === 'uuid'
}
