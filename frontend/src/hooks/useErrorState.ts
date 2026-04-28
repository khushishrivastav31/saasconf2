import { useState } from 'react';

/**
 * Tiny replacement for the ~150 sites in the codebase that write
 * `const [error, setError] = useState<string | null>(null)`.
 *
 * Keeps the same tuple shape so migration is a one-line swap. Reduces
 * type noise and gives us a single point to extend later (e.g. add a
 * `clearError` helper, debounced auto-clear, etc.) without touching
 * call sites again.
 */
export function useErrorState(initial: string | null = null) {
  return useState<string | null>(initial);
}
