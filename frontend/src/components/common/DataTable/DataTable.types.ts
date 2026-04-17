import type { ReactNode } from 'react';

export type SortDirection = 'asc' | 'desc';

/** Sort state used by consumers and emitted by DataTable on header clicks. */
export interface SortState<T> {
  key: keyof T & string;
  direction: SortDirection;
}

/**
 * A single column definition.
 *
 * `key` is either a field on T (keyof T & string) or an arbitrary string for
 * synthetic columns (actions, derived values). When the key is not a real
 * field, `sortable` should be false — there's nothing sensible to sort on.
 */
export interface Column<T> {
  key: (keyof T & string) | string;
  header: ReactNode;
  /**
   * Renderer for the cell. Receives the whole row so consumers can combine
   * multiple fields. Defaults to `String(row[key])` when omitted and key is
   * a real field on T.
   */
  render?: (row: T) => ReactNode;
  /** Enables click-to-sort on the header; requires `key` to be a field on T. */
  sortable?: boolean;
  /** Extra classes for the cell <td>. */
  cellClassName?: string;
  /** Extra classes for the header <th>. */
  headerClassName?: string;
  /** Visual width hint, e.g. "w-32" or "w-1/4". */
  width?: string;
  /** Horizontal alignment — default: left. */
  align?: 'left' | 'center' | 'right';
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[] | undefined;
  /** Unique key per row — defaults to `row.id` when T has an id field. */
  rowKey?: (row: T) => string;
  /** Currently selected row id; rendered with a highlight. */
  selectedKey?: string | null;
  /** Fires when a row is clicked. */
  onRowClick?: (row: T) => void;
  /** Sort state + handler. Omit to disable sort UI entirely. */
  sort?: SortState<T>;
  onSortChange?: (next: SortState<T>) => void;
  /** Show a skeleton when true. Overrides empty-state. */
  isLoading?: boolean;
  /** Rendered when data is empty. Optional; falls back to a simple message. */
  emptyState?: ReactNode;
  /** Error message rendered above the table when present. */
  error?: string | null;
  /** Extra className on the wrapping <div>. */
  className?: string;
}
