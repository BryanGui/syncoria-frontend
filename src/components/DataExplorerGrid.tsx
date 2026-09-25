import { useEffect, useMemo, useRef, useState, type ClipboardEvent } from 'react'
import { DataGrid, type Column, type SortColumn } from 'react-data-grid'
import 'react-data-grid/lib/styles.css'

import type { ExplorerRows, ExplorerSort } from '../api/dataExplorer.ts'
import {
  rangeToTsv, reorderColumn, resizeColumn, trustedSorts,
  type CellRange, type GridColumnState,
} from '../dataExplorer/gridState.ts'

interface GridRow { values: Record<string, unknown>; index: number }
interface DataExplorerGridProps {
  columns: GridColumnState[]
  onColumnsChange: (columns: GridColumnState[]) => void
  page: ExplorerRows | null
  rows: Record<string, unknown>[]
  loadingMore: boolean
  onLoadMore: () => void
  sorts: ExplorerSort[]
  onSortsChange: (sorts: ExplorerSort[]) => void
}

function displayValue(value: unknown): string {
  if (value == null) return ''
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

export function DataExplorerGrid({
  columns, onColumnsChange, page, rows, loadingMore, onLoadMore, sorts, onSortsChange,
}: DataExplorerGridProps) {
  const [selection, setSelection] = useState<CellRange | null>(null)
  const anchor = useRef<{ row: number; column: number } | null>(null)
  const dragging = useRef(false)
  const visibleColumns = useMemo(() => columns.filter((column) => column.visible), [columns])
  const gridRows = useMemo(() => rows.map((values, index) => ({ values, index })), [rows])

  useEffect(() => {
    const stop = () => { dragging.current = false }
    window.addEventListener('mouseup', stop)
    return () => window.removeEventListener('mouseup', stop)
  }, [])

  const gridColumns = useMemo<Column<GridRow>[]>(() => [
    {
      key: '__row_header', name: '#', width: 64, minWidth: 64, frozen: true,
      cellClass: (row) => selection !== null && row.index >= Math.min(selection.startRow, selection.endRow)
        && row.index <= Math.max(selection.startRow, selection.endRow)
        && selection.startColumn === 0 && selection.endColumn === visibleColumns.length - 1
        ? 'data-explorer-grid__selected' : undefined,
      renderCell: ({ row }) => <span className="data-explorer-grid__cell" onMouseEnter={() => {
        if (dragging.current && anchor.current) setSelection({
          startRow: anchor.current.row, endRow: row.index,
          startColumn: 0, endColumn: visibleColumns.length - 1,
        })
      }}>{row.index + 1}</span>,
    },
    ...visibleColumns.map((column, columnIndex): Column<GridRow> => ({
      key: column.name,
      name: column.name,
      width: column.width,
      minWidth: 70,
      maxWidth: 800,
      resizable: true,
      draggable: true,
      sortable: column.sortable,
      cellClass: (row) => selection !== null
        && row.index >= Math.min(selection.startRow, selection.endRow)
        && row.index <= Math.max(selection.startRow, selection.endRow)
        && columnIndex >= Math.min(selection.startColumn, selection.endColumn)
        && columnIndex <= Math.max(selection.startColumn, selection.endColumn)
        ? 'data-explorer-grid__selected' : undefined,
      renderCell: ({ row }) => (
        <span
          className="data-explorer-grid__cell"
          onMouseEnter={() => {
            if (dragging.current && anchor.current) setSelection({
              startRow: anchor.current.row, startColumn: anchor.current.column,
              endRow: row.index, endColumn: columnIndex,
            })
          }}
          title={displayValue(row.values[column.name])}
        >
          {displayValue(row.values[column.name])}
        </span>
      ),
    })),
  ], [selection, visibleColumns])

  const selectedSorts: SortColumn[] = sorts.map((sort) => ({ columnKey: sort.column, direction: sort.direction.toUpperCase() as 'ASC' | 'DESC' }))

  function handleCopy(event: ClipboardEvent<HTMLDivElement>) {
    if (selection === null || visibleColumns.length === 0) return
    event.preventDefault()
    event.clipboardData.setData('text/plain', rangeToTsv(rows, visibleColumns.map((column) => column.name), selection))
  }

  return (
    <div className="data-explorer-grid" onCopyCapture={handleCopy}>
      <p className="data-explorer-grid__hint">Sélectionnez une cellule, étendez avec Maj ou faites glisser, puis copiez avec Ctrl/Cmd+C. Les données sont en lecture seule.</p>
      <DataGrid<GridRow>
        aria-label="Lignes matérialisées"
        className="data-explorer-grid__table"
        columns={gridColumns}
        rows={gridRows}
        enableVirtualization
        sortColumns={selectedSorts}
        onSortColumnsChange={(next) => onSortsChange(trustedSorts(next.map((sort) => ({
          column: sort.columnKey, direction: sort.direction.toLowerCase() as 'asc' | 'desc',
        })), columns))}
        onColumnResize={(column, width) => onColumnsChange(resizeColumn(columns, column.key, width))}
        onColumnsReorder={(source, target) => onColumnsChange(reorderColumn(columns, source, target))}
        onCellMouseDown={({ column, row, rowIdx }, event) => {
          const index = column.key === '__row_header' ? 0 : visibleColumns.findIndex((item) => item.name === column.key)
          if (index < 0) return
          const start = event.shiftKey && anchor.current ? anchor.current : { row: rowIdx, column: index }
          if (!event.shiftKey) anchor.current = start
          dragging.current = true
          setSelection({
            startRow: start.row, endRow: row.index,
            startColumn: column.key === '__row_header' ? 0 : start.column,
            endColumn: column.key === '__row_header' ? visibleColumns.length - 1 : index,
          })
        }}
        onCellKeyDown={({ column, rowIdx }, event) => {
          if (!event.shiftKey || !event.key.startsWith('Arrow')) return
          const index = visibleColumns.findIndex((item) => item.name === column?.key)
          if (index < 0) return
          const start = anchor.current ?? { row: rowIdx, column: index }
          anchor.current = start
          const current = selection ?? { startRow: start.row, endRow: rowIdx, startColumn: start.column, endColumn: index }
          const rowDelta = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
          const columnDelta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
          setSelection({ ...current,
            endRow: Math.max(0, Math.min(rows.length - 1, current.endRow + rowDelta)),
            endColumn: Math.max(0, Math.min(visibleColumns.length - 1, current.endColumn + columnDelta)),
          })
        }}
        onScroll={(event) => {
          const target = event.currentTarget
          if (page?.has_more && !loadingMore && target.scrollTop + target.clientHeight >= target.scrollHeight - 240) onLoadMore()
        }}
      />
      <p aria-live="polite" className="data-explorer-grid__status">
        {rows.length} ligne{rows.length > 1 ? 's' : ''} chargée{rows.length > 1 ? 's' : ''}
        {loadingMore ? ' · Chargement du bloc suivant…' : ''}
      </p>
      {page?.has_more && !loadingMore ? (
        <button className="secondary-button" onClick={onLoadMore} type="button">Charger la suite</button>
      ) : null}
    </div>
  )
}
