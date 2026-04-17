import { useCallback, useMemo, useState } from 'react';
import type { SortState } from './DataTable.types';

/**
 * Small local-state hook for consumers that don't need external sort control.
 * Returns a stable `onSortChange` callback and toggles direction on repeat
 * clicks of the same column.
 */
export function useDataTableState<T>(initial?: SortState<T>) {
  const [sort, setSort] = useState<SortState<T> | undefined>(initial);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const onSortChange = useCallback((next: SortState<T>) => {
    setSort((prev) =>
      prev && prev.key === next.key
        ? { key: next.key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : next
    );
  }, []);

  return useMemo(
    () => ({ sort, onSortChange, selectedKey, setSelectedKey }),
    [sort, onSortChange, selectedKey]
  );
}
