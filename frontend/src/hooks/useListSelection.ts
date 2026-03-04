import { useState, useMemo } from 'react';

/**
 * Manages selection state for a list of items with an ID field.
 *
 * Derives the selected item from the list whenever the list or selectedId changes,
 * avoiding stale references after mutations.
 */
export function useListSelection<T extends { id: string }>(items: T[]) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedItem = useMemo(
    () => (selectedId ? (items.find((item) => item.id === selectedId) ?? null) : null),
    [items, selectedId]
  );

  function clearSelection() {
    setSelectedId(null);
  }

  return { selectedId, setSelectedId, selectedItem, clearSelection } as const;
}
