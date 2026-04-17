import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSaveStatus, type SaveStatus } from '../../../hooks/useSaveStatus';

/**
 * State manager for edit-in-a-side-panel forms.
 *
 * Wraps the common triad:
 *   - a ``data`` object the user is editing (`setField` merges one key at a time)
 *   - a ``isDirty`` flag derived from comparing current vs. initial data
 *   - ``saveStatus`` surfaced by `useSaveStatus`
 *
 * The second argument is a **reset key** — typically the id of the row the
 * user is editing. When the key changes, the form resets to the new
 * ``initialData``. Identity of ``initialData`` alone is NOT tracked: parents
 * typically build the initial object inline on every render, so keying off
 * identity would loop forever.
 */
export function useDetailPanelState<T extends object>(initialData: T, resetKey?: string | number) {
  const [data, setData] = useState<T>(initialData);
  const initialRef = useRef(initialData);
  const prevKeyRef = useRef(resetKey);
  const { saveStatus, setSaving, setSaved, setError } = useSaveStatus();

  // Keep initialRef in sync *without* triggering state changes — consumers
  // rebuild the initial object every render, so we only treat it as "new"
  // when the caller bumps resetKey.
  initialRef.current = prevKeyRef.current === resetKey ? initialRef.current : initialData;

  useEffect(() => {
    if (prevKeyRef.current !== resetKey) {
      prevKeyRef.current = resetKey;
      setData(initialData);
    }
  }, [resetKey, initialData]);

  const setField = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setData((prev) => ({ ...prev, [key]: value }));
  }, []);

  const reset = useCallback(() => {
    setData(initialRef.current);
  }, []);

  const isDirty = useMemo(() => !shallowEqual(data, initialRef.current), [data]);

  return {
    data,
    setData,
    setField,
    reset,
    isDirty,
    saveStatus,
    setSaving,
    setSaved,
    setError,
  };
}

export type { SaveStatus };

function shallowEqual<T extends object>(a: T, b: T): boolean {
  if (a === b) return true;
  const aKeys = Object.keys(a) as (keyof T)[];
  const bKeys = Object.keys(b) as (keyof T)[];
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}
