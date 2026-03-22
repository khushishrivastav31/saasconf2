import { useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { useDebouncedValue } from './useDebounce';

/**
 * Filter config: maps filter names to their default values.
 * - string defaults create string filters
 * - number defaults create number filters
 * The special key "search" gets a debounced companion value.
 * The special key "page" is auto-reset to 1 when other filters change.
 */
type FilterConfig = Record<string, string | number>;

type FilterValues<T extends FilterConfig> = {
  [K in keyof T]: T[K] extends number ? number : string;
};

type FilterSetters<T extends FilterConfig> = {
  [K in keyof T as `set${Capitalize<string & K>}`]: (
    value: T[K] extends number ? number : string
  ) => void;
};

type UseUrlFiltersReturn<T extends FilterConfig> = FilterValues<T> &
  FilterSetters<T> & {
    hasActiveFilters: boolean;
    clearAllFilters: () => void;
  } & ('search' extends keyof T ? { debouncedSearch: string } : object);

/**
 * Hook that persists filter state in URL query params.
 *
 * Features:
 * - Reads initial values from URL search params (falls back to defaults)
 * - Setters update URL params (params matching defaults are removed for clean URLs)
 * - Changing any filter other than "page" resets page to 1
 * - "search" filter gets a `debouncedSearch` companion (300ms)
 * - `hasActiveFilters` indicates if any filter differs from its default
 * - `clearAllFilters` resets everything to defaults
 */
export function useUrlFilters<T extends FilterConfig>(config: T): UseUrlFiltersReturn<T> {
  const [searchParams, setSearchParams] = useSearchParams();
  // Keep a stable reference to config to avoid re-creating callbacks
  const configRef = useRef(config);
  configRef.current = config;

  // Read current values from URL params
  const values = useMemo(() => {
    const result: Record<string, string | number> = {};
    for (const [key, defaultVal] of Object.entries(config)) {
      const urlVal = searchParams.get(key);
      if (urlVal === null) {
        result[key] = defaultVal;
      } else if (typeof defaultVal === 'number') {
        const parsed = Number(urlVal);
        result[key] = isNaN(parsed) ? defaultVal : parsed;
      } else {
        result[key] = urlVal;
      }
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, ...Object.keys(config)]);

  // Debounced search value
  const searchValue = typeof config.search === 'string' ? (values.search as string) : undefined;
  const debouncedSearch = useDebouncedValue(searchValue ?? '', 300);

  // Generic setter factory
  const createSetter = useCallback(
    (key: string) => (value: string | number) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const cfg = configRef.current;
          const defaultVal = cfg[key];

          // Set or remove the param
          if (value === defaultVal || (typeof defaultVal === 'string' && value === '')) {
            next.delete(key);
          } else {
            next.set(key, String(value));
          }

          // Reset page to 1 when changing non-page filters
          if (key !== 'page' && 'page' in cfg) {
            next.delete('page');
          }

          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  // Build setters object
  const setters = useMemo(() => {
    const result: Record<string, (value: string | number) => void> = {};
    for (const key of Object.keys(config)) {
      const capitalized = key.charAt(0).toUpperCase() + key.slice(1);
      result[`set${capitalized}`] = createSetter(key);
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createSetter, ...Object.keys(config)]);

  // hasActiveFilters: true if any filter differs from its default (excluding page)
  const hasActiveFilters = useMemo(() => {
    for (const [key, defaultVal] of Object.entries(config)) {
      if (key === 'page') continue;
      if (values[key] !== defaultVal) return true;
    }
    return false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, ...Object.keys(config)]);

  // clearAllFilters: reset everything to defaults
  const clearAllFilters = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const key of Object.keys(configRef.current)) {
          next.delete(key);
        }
        return next;
      },
      { replace: true }
    );
  }, [setSearchParams]);

  // Assemble return value
  const result: Record<string, unknown> = {
    ...values,
    ...setters,
    hasActiveFilters,
    clearAllFilters,
  };

  if (searchValue !== undefined) {
    result.debouncedSearch = debouncedSearch;
  }

  return result as UseUrlFiltersReturn<T>;
}
