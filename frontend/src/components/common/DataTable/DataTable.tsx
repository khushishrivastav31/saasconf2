import { memo, useCallback, type ReactNode } from 'react';
import type { Column, DataTableProps } from './DataTable.types';

function alignClass(align: Column<unknown>['align']): string {
  if (align === 'center') return 'text-center';
  if (align === 'right') return 'text-right';
  return 'text-left';
}

function defaultRowKey<T>(row: T): string {
  if (row && typeof row === 'object' && 'id' in row) {
    return String((row as { id: unknown }).id);
  }
  // Fall back: let React handle it via index (rare; consumer should supply rowKey)
  return JSON.stringify(row);
}

function renderCell<T>(col: Column<T>, row: T): ReactNode {
  if (col.render) return col.render(row);
  if (col.key && row && typeof row === 'object' && col.key in row) {
    const v = (row as Record<string, unknown>)[col.key];
    if (v === null || v === undefined) return '';
    return String(v);
  }
  return '';
}

function SortIndicator({ direction }: { direction: 'asc' | 'desc' | null }) {
  if (direction === null) {
    return <span className="ml-1 text-gray-300 dark:text-gray-600">↕</span>;
  }
  return (
    <span className="ml-1 text-gray-600 dark:text-gray-300">{direction === 'asc' ? '↑' : '↓'}</span>
  );
}

function LoadingSkeleton({ rows, cols }: { rows: number; cols: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="animate-pulse">
          {Array.from({ length: cols }).map((__, c) => (
            <td key={c} className="px-4 py-3">
              <div className="h-4 w-3/4 rounded bg-gray-200 dark:bg-gray-700" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function DataTableInner<T>({
  columns,
  data,
  rowKey,
  selectedKey,
  onRowClick,
  sort,
  onSortChange,
  isLoading,
  emptyState,
  error,
  className = '',
}: DataTableProps<T>) {
  const keyOf = rowKey ?? defaultRowKey;

  const handleHeaderClick = useCallback(
    (col: Column<T>) => {
      if (!col.sortable || !onSortChange) return;
      const key = col.key as keyof T & string;
      const direction = sort && sort.key === key && sort.direction === 'asc' ? 'desc' : 'asc';
      onSortChange({ key, direction });
    },
    [onSortChange, sort]
  );

  const rows = data ?? [];
  const hasRows = rows.length > 0;

  return (
    <div className={className}>
      {error && (
        <p
          role="alert"
          className="mb-2 text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-3 py-2 rounded"
        >
          {error}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              {columns.map((col) => {
                const isSortedBy = sort && sort.key === col.key;
                const direction = isSortedBy ? sort.direction : null;
                const canSort = Boolean(col.sortable && onSortChange);
                return (
                  <th
                    key={col.key}
                    scope="col"
                    className={`px-4 py-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 ${alignClass(col.align)} ${
                      col.width ?? ''
                    } ${col.headerClassName ?? ''} ${
                      canSort
                        ? 'cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200'
                        : ''
                    }`}
                    aria-sort={
                      isSortedBy
                        ? direction === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : canSort
                          ? 'none'
                          : undefined
                    }
                    onClick={canSort ? () => handleHeaderClick(col) : undefined}
                  >
                    <span className="inline-flex items-center">
                      {col.header}
                      {canSort && <SortIndicator direction={direction} />}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
            {isLoading ? (
              <LoadingSkeleton rows={5} cols={columns.length} />
            ) : hasRows ? (
              rows.map((row) => {
                const key = keyOf(row);
                const isSelected = selectedKey === key;
                return (
                  <tr
                    key={key}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={`${onRowClick ? 'cursor-pointer' : ''} ${
                      isSelected
                        ? 'bg-primary-50 dark:bg-primary-900/30'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                    aria-selected={onRowClick ? isSelected : undefined}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={`px-4 py-3 text-sm text-gray-900 dark:text-gray-100 ${alignClass(col.align)} ${col.cellClassName ?? ''}`}
                      >
                        {renderCell(col, row)}
                      </td>
                    ))}
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8">
                  {emptyState ?? (
                    <p className="text-center text-sm text-gray-500 dark:text-gray-400">No data</p>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Generic, headless-ish table primitive. Handles layout, sort-header UX,
 * selected-row highlight, loading skeleton, empty state, error banner.
 * Styling for content stays with the consumer via `Column.render`.
 */
const DataTable = memo(DataTableInner) as typeof DataTableInner;

export default DataTable;
