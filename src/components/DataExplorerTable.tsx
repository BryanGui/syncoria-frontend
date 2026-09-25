import type { ExplorerColumn, ExplorerRows, ExplorerSort } from '../api/dataExplorer.ts'
import { isSortable } from '../dataExplorer/columns.ts'

interface Props {
  columns: ExplorerColumn[]
  rows: Record<string, unknown>[]
  page: ExplorerRows | null
  sort: ExplorerSort | null
  onSortChange: (sort: ExplorerSort) => void
  loadingMore: boolean
  onLoadMore: () => void
}

function displayValue(value: unknown): string {
  if (value == null) return ''
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

export function DataExplorerTable({ columns, rows, page, sort, onSortChange, loadingMore, onLoadMore }: Props) {
  return <div className="data-explorer-table">
    <div
      className="data-explorer-table__scroll"
      onScroll={(event) => {
        const target = event.currentTarget
        if (page?.has_more && !loadingMore && target.scrollTop + target.clientHeight >= target.scrollHeight - 240) onLoadMore()
      }}
    >
      <table aria-label="Lignes matérialisées" className="data-explorer-table__table">
        <thead><tr>{columns.map((column) => <th
          key={column.name} scope="col"
          aria-sort={sort?.column === column.name ? sort.direction === 'asc' ? 'ascending' : 'descending' : undefined}
        >
          {isSortable(column) ? <button type="button" onClick={() => onSortChange({
            column: column.name,
            direction: sort?.column === column.name && sort.direction === 'asc' ? 'desc' : 'asc',
          })}>
            {column.name}{sort?.column === column.name ? sort.direction === 'asc' ? ' ↑' : ' ↓' : ''}
          </button> : column.name}
        </th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={index}>
          {columns.map((column) => {
            const value = displayValue(row[column.name])
            return <td key={column.name} title={value}>{value}</td>
          })}
        </tr>)}</tbody>
      </table>
    </div>
    <p aria-live="polite" className="data-explorer-table__status">
      {rows.length} ligne{rows.length > 1 ? 's' : ''} chargée{rows.length > 1 ? 's' : ''}
      {loadingMore ? ' · Chargement du bloc suivant…' : ''}
    </p>
    {page?.has_more && !loadingMore ? <button className="secondary-button" onClick={onLoadMore} type="button">Charger la suite</button> : null}
  </div>
}
