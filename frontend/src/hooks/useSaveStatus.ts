import { useState, useRef, useCallback, useEffect } from 'react';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function useSaveStatus() {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPendingTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const setSaving = useCallback(() => {
    clearPendingTimeout();
    setSaveStatus('saving');
  }, [clearPendingTimeout]);

  const setSaved = useCallback(() => {
    clearPendingTimeout();
    setSaveStatus('saved');
    timeoutRef.current = setTimeout(() => setSaveStatus('idle'), 2000);
  }, [clearPendingTimeout]);

  const setError = useCallback(() => {
    clearPendingTimeout();
    setSaveStatus('error');
    timeoutRef.current = setTimeout(() => setSaveStatus('idle'), 3000);
  }, [clearPendingTimeout]);

  // Cleanup on unmount
  useEffect(() => {
    return () => clearPendingTimeout();
  }, [clearPendingTimeout]);

  return { saveStatus, setSaving, setSaved, setError };
}
