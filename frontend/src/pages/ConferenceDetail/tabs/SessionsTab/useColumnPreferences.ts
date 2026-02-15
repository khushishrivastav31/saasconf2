import { useState, useEffect, useCallback } from "react";
import type { ColumnDef } from "./columnDefs";

/**
 * Hook that persists column visibility preferences in localStorage per conference.
 */
export function useColumnPreferences(
  conferenceId: string,
  allColumns: ColumnDef[]
) {
  const storageKey = `sessions-columns-${conferenceId}`;

  const [visibleKeys, setVisibleKeys] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as string[];
        // Validate saved keys still exist in allColumns
        const validKeys = new Set(allColumns.map((c) => c.key));
        const filtered = parsed.filter((k) => validKeys.has(k));
        if (filtered.length > 0) return filtered;
      }
    } catch {
      // Ignore parse errors
    }
    return allColumns.filter((c) => c.defaultVisible).map((c) => c.key);
  });

  // Persist on change
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(visibleKeys));
  }, [storageKey, visibleKeys]);

  const toggleColumn = useCallback((key: string) => {
    setVisibleKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }, []);

  const resetToDefaults = useCallback(() => {
    setVisibleKeys(
      allColumns.filter((c) => c.defaultVisible).map((c) => c.key)
    );
  }, [allColumns]);

  return { visibleKeys, toggleColumn, resetToDefaults };
}
